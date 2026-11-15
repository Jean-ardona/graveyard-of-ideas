import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import type { Camera } from 'three';
import { getPointerMode, releasePointer, requestPointer, subscribePointerMode } from '../interaction/pointerLock';
import { BOOK_PIVOTS, BOOK_SIZE } from './bookAssets';
import { getBookHandle } from './bookHandles';
import type { BookHandle } from './bookHandles';
import { isOpening } from './bookSequence';
import { COVER_OPEN_ANGLE, LIFT_HEIGHT, READING_POSE } from './bookTimings';
import { isIdle } from './pageTurn';
import { closeBook, getReadingProjectId } from './readingBook';
import { readingMachine } from './readingMachine';

/**
 * Poses of the moving book, in the space of its parent (the tomb). Allocated once: the book
 * sequence is a singleton, so one set of scratch objects serves every frame and every book.
 */
const basePosition = new Vector3();
const baseQuaternion = new Quaternion();
const targetPosition = new Vector3();
const targetQuaternion = new Quaternion();
const parentQuaternion = new Quaternion();

/**
 * Where the book origin (bottom center) sits in camera space when open: the spine on the
 * view axis, the middle of the book `READING_POSE.down` below the view center.
 */
const READING_X = -BOOK_PIVOTS.frontBoard[0];
const READING_Y = -READING_POSE.down - BOOK_SIZE.height / 2;
const READING_Z = -READING_POSE.distance;

/**
 * Captures the pose the book starts from and the reading pose in front of the camera. Runs
 * once per sequence, when OPEN is accepted; the camera is frozen from then until the book rests.
 */
function captureReadingPose(handle: BookHandle, camera: Camera): void {
  const { root } = handle;
  basePosition.copy(root.position);
  baseQuaternion.copy(root.quaternion);
  targetPosition.set(READING_X, READING_Y, READING_Z).applyQuaternion(camera.quaternion).add(camera.position);
  targetQuaternion.copy(camera.quaternion);
  const parent = root.parent;
  if (parent === null) return;
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(targetPosition);
  targetQuaternion.premultiply(parent.getWorldQuaternion(parentQuaternion).invert());
}

/**
 * Writes the pose for the current progress. Every value depends on the progress alone, so
 * playing the sequence backward retraces the same path. Opening is a negative rotation about y.
 */
function applyPose(handle: BookHandle): void {
  const { lift, approach, cover } = readingMachine.progress;
  const { root } = handle;
  root.position.copy(basePosition);
  root.position.y += LIFT_HEIGHT * lift;
  root.position.lerp(targetPosition, approach);
  root.quaternion.copy(baseQuaternion).slerp(targetQuaternion, approach);
  handle.parts.cover.rotation.y = -COVER_OPEN_ANGLE * cover;
}

/**
 * Plays the book sequence: ticks the reading machine each frame and moves the book from its
 * progress values. Does no work while the book is closed, or open with the pages at rest.
 * Discrete changes (start, skip, landing) and the pointer rules are handled in a listener.
 */
export default function BookSequenceDriver() {
  const camera = useThree((state) => state.camera);
  const active = useRef<BookHandle | null>(null);

  useEffect(() => {
    let wasClosed = readingMachine.phase() === 'closed';
    let wasReleased = readingMachine.pointerLockReleased();

    const unsubscribeMachine = readingMachine.subscribe(() => {
      const closed = readingMachine.phase() === 'closed';
      if (wasClosed && !closed) {
        const id = getReadingProjectId();
        active.current = (id !== null && getBookHandle(id)) || null;
        if (active.current) captureReadingPose(active.current, camera);
      }
      wasClosed = closed;

      const released = readingMachine.pointerLockReleased();
      if (released !== wasReleased) {
        wasReleased = released;
        if (released) releasePointer();
        else requestPointer();
      }

      if (active.current) applyPose(active.current);
      if (closed) active.current = null;
    });

    // Escape leaves Pointer Lock without a key event: the lost lock reverses the opening.
    const unsubscribePointer = subscribePointerMode(() => {
      if (getPointerMode() === 'lost' && isOpening(readingMachine.phase())) closeBook();
    });

    return () => {
      unsubscribeMachine();
      unsubscribePointer();
    };
  }, [camera]);

  useFrame((_, delta) => {
    const phase = readingMachine.phase();
    if (phase === 'closed' || (phase === 'open' && isIdle(readingMachine.pages))) return;
    readingMachine.tick(delta);
    if (active.current) applyPose(active.current);
  });

  return null;
}
