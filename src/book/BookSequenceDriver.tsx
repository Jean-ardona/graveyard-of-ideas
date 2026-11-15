import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';
import type { Camera, Mesh, Object3D } from 'three';
import { getPointerMode, releasePointer, requestPointer, subscribePointerMode } from '../interaction/pointerLock';
import { appStore } from '../store/appStore';
import { BOOK_PAGE_FACE, BOOK_PIVOTS, BOOK_SIZE } from './bookAssets';
import { getBookHandle } from './bookHandles';
import { LEAF_COUNT, leafCoverProgress, leafHingeAngle, leafHingeZ, leafTurnFraction } from './bookStack';
import type { BookHandle } from './bookHandles';
import { isOpening } from './bookSequence';
import { LIFT_HEIGHT, READING_POSE } from './bookTimings';
import { coverAngle, coverOpenFraction } from './coverScrub';
import { clearPageRect, writePageRect } from './pageRect';
import { curledLeafIndex } from './leafCurl';
import {
  beginLeafCurl,
  createLeafCurlMesh,
  curlHingeRotation,
  disposeLeafCurlMesh,
  endLeafCurl,
  writeLeafCurl,
} from './leafCurlMesh';
import type { LeafCurlMesh } from './leafCurlMesh';
import { isIdle, leafAngle, renderedLeafAngle } from './pageTurn';
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
const pageCorner = new Vector3();
/** Uniform scale of the resting book; it shrinks to 1 on the way to the reading pose. */
let baseScale = 1;
/** Turned fractions last written, so a leaf is touched only when it changes. NaN forces a first write. */
const writtenLeafFractions: number[] = Array.from({ length: LEAF_COUNT }, () => Number.NaN);

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
  baseScale = root.scale.x;
  writtenLeafFractions.fill(Number.NaN);
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
  root.scale.setScalar(baseScale + (1 - baseScale) * approach);
  // A closing gesture scrubs the rigid cover about the spine; the leaves fold with it like in the closing sequence.
  const scrubbed = cover * coverOpenFraction(readingMachine.pages, appStore.getState().data.prefs.reducedMotion);
  handle.parts.cover.rotation.y = -coverAngle(scrubbed);
  applyLeaves(handle, scrubbed);
}

/** The curl geometry of the open book: made when the book leaves `closed`, disposed at `closed`. */
let curlMesh: LeafCurlMesh | null = null;

/** The leaf mesh inside a leaf hinge group. */
function leafMesh(leaf: Object3D): Mesh {
  return leaf.children[0] as Mesh;
}

/**
 * Gives the curl geometry to the turning leaf and takes it back from a leaf that no longer turns.
 * Returns the index of the leaf drawn curved, or -1. A leaf that gets its flat geometry back is
 * marked unwritten, so its hinge is written again with the usual rigid angle.
 */
function syncCurl(handle: BookHandle, cover: number): number {
  const curl = curlMesh;
  if (curl === null) return -1;
  const wanted = curledLeafIndex(readingMachine.pages, cover, appStore.getState().data.prefs.reducedMotion);
  const showing = curl.leaf === null ? -1 : handle.leaves.indexOf(curl.leaf.parent as Object3D);
  if (showing === wanted) return wanted;
  if (showing >= 0 && endLeafCurl(curl)) writtenLeafFractions[showing] = Number.NaN;
  if (wanted >= 0) beginLeafCurl(curl, leafMesh(handle.leaves[wanted]!));
  return wanted;
}

/** Returns the flat geometry to any curled leaf, then frees the curl geometry. */
function releaseCurl(): void {
  if (curlMesh === null) return;
  disposeLeafCurlMesh(curlMesh);
  curlMesh = null;
}

/** Draws the turning leaf as a strip: the hinge carries the offset, the buffers the bend. */
function applyCurledLeaf(handle: BookHandle, j: number): void {
  const curl = curlMesh!;
  const fraction = leafTurnFraction(leafAngle(readingMachine.pages, j));
  if (!writeLeafCurl(curl, fraction)) return;
  const leaf = handle.leaves[j]!;
  leaf.rotation.y = curlHingeRotation(j, fraction);
  leaf.position.z = leafHingeZ(j, fraction);
}

/**
 * Turns the leaves about the spine, like the cover, and lifts each to its height: turned leaves
 * fold back with the cover and lie above its inner face. A leaf is written only when its turned
 * fraction changed: at most two change in any one step.
 */
function applyLeaves(handle: BookHandle, cover: number): void {
  const { leaves } = handle;
  const curledIndex = syncCurl(handle, cover);
  for (let j = 0; j < leaves.length; j++) {
    if (j === curledIndex) {
      applyCurledLeaf(handle, j);
      continue;
    }
    const fraction = leafTurnFraction(renderedLeafAngle(readingMachine.pages, j, leafCoverProgress(j, cover)));
    if (fraction === writtenLeafFractions[j]) continue;
    writtenLeafFractions[j] = fraction;
    const leaf = leaves[j]!;
    leaf.rotation.y = -leafHingeAngle(j, fraction);
    leaf.position.z = leafHingeZ(j, fraction);
  }
}

/**
 * Projects the open right-hand page and the spine to screen pixels (the left zone is a mirror of
 * the page around the spine, see `mirrorPageRect`). The camera is frozen and the book rests
 * in a fixed pose, so this runs once on reaching `open` and when the canvas size changes.
 */
function projectPageRect(handle: BookHandle, camera: Camera, width: number, height: number): void {
  handle.root.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  pageCorner.set(BOOK_PAGE_FACE.minX, BOOK_PAGE_FACE.maxY, BOOK_PAGE_FACE.z);
  pageCorner.applyMatrix4(handle.root.matrixWorld).project(camera);
  const left = ((pageCorner.x + 1) / 2) * width;
  const top = ((1 - pageCorner.y) / 2) * height;
  pageCorner.set(BOOK_PAGE_FACE.maxX, BOOK_PAGE_FACE.minY, BOOK_PAGE_FACE.z);
  pageCorner.applyMatrix4(handle.root.matrixWorld).project(camera);
  const right = ((pageCorner.x + 1) / 2) * width;
  const bottom = ((1 - pageCorner.y) / 2) * height;
  pageCorner.set(BOOK_PIVOTS.frontBoard[0], BOOK_PAGE_FACE.minY, BOOK_PAGE_FACE.z);
  pageCorner.applyMatrix4(handle.root.matrixWorld).project(camera);
  const spineX = ((pageCorner.x + 1) / 2) * width;
  writePageRect(left, top, right - left, bottom - top, spineX);
}

/**
 * Plays the book sequence: ticks the reading machine each frame and moves the book from its
 * progress values. Does no work while the book is closed, or open with the pages at rest.
 * Discrete changes (start, skip, landing) and the pointer rules are handled in a listener.
 */
export default function BookSequenceDriver() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const active = useRef<BookHandle | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // The canvas fills the window, so a new canvas size is a window resize. The camera aspect is
  // updated by the renderer before this effect runs.
  useEffect(() => {
    if (readingMachine.phase() === 'open' && active.current) {
      projectPageRect(active.current, camera, size.width, size.height);
    }
  }, [camera, size]);

  useEffect(() => {
    let wasClosed = readingMachine.phase() === 'closed';
    let wasOpen = readingMachine.phase() === 'open';
    let wasReleased = readingMachine.pointerLockReleased();

    const unsubscribeMachine = readingMachine.subscribe(() => {
      const closed = readingMachine.phase() === 'closed';
      const open = readingMachine.phase() === 'open';
      if (wasClosed && !closed) {
        const id = getReadingProjectId();
        active.current = (id !== null && getBookHandle(id)) || null;
        if (active.current) {
          captureReadingPose(active.current, camera);
          curlMesh = createLeafCurlMesh();
        }
      }
      wasClosed = closed;

      const released = readingMachine.pointerLockReleased();
      if (released !== wasReleased) {
        wasReleased = released;
        if (released) releasePointer();
        else requestPointer();
      }

      if (active.current) applyPose(active.current);
      if (open && !wasOpen && active.current) {
        projectPageRect(active.current, camera, sizeRef.current.width, sizeRef.current.height);
      }
      wasOpen = open;
      if (closed) {
        active.current = null;
        clearPageRect();
        releaseCurl();
      }
    });

    // Escape leaves Pointer Lock without a key event: the lost lock reverses the opening.
    const unsubscribePointer = subscribePointerMode(() => {
      if (getPointerMode() === 'lost' && isOpening(readingMachine.phase())) closeBook();
    });

    return () => {
      unsubscribeMachine();
      unsubscribePointer();
      releaseCurl();
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
