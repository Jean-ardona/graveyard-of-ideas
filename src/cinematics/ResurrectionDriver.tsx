import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getBookHandle } from '../book/bookHandles';
import { requestPointer } from '../interaction/pointerLock';
import { appStore } from '../store/appStore';
import { createResurrectionRun } from './resurrectionRun';
import type { ResurrectionRun } from './resurrectionRun';
import {
  endResurrection,
  getHeldTombs,
  isResurrectionRunning,
  subscribeResurrection,
  wantsInstantSequence,
} from './resurrectionSession';
import { attachResurrectionSkip } from './resurrectionSkip';

/**
 * Plays the resurrection in the 3D scene. It starts when the session reports that the project is
 * saved as Resurrected, ticks the timeline in `useFrame`, and at the end disposes every temporary
 * object and releases the held tomb (which removes the tomb, its book and its collider). Nothing here
 * writes project data: the save came first. Escape, Enter, Space or a lost pointer lock skips to the
 * final state with the same cleanup. A reload never replays: the held tomb is not persisted.
 */
export default function ResurrectionDriver() {
  const scene = useThree((state) => state.scene);
  const runRef = useRef<ResurrectionRun | null>(null);
  const detachSkipRef = useRef<(() => void) | null>(null);

  /** Disposes the run, lets the tomb go (which unlocks the input) and asks for the pointer again. */
  const finishRun = useCallback(() => {
    detachSkipRef.current?.();
    detachSkipRef.current = null;
    runRef.current?.dispose();
    runRef.current = null;
    endResurrection();
    requestPointer();
  }, []);

  /** Skip: the final state at once (book gone, specter gone), then the same cleanup as the natural end. */
  const skipRun = useCallback(() => {
    runRef.current?.skip();
    finishRun();
  }, [finishRun]);

  useEffect(() => {
    const startWhenSaved = (): void => {
      const tomb = getHeldTombs()[0];
      if (runRef.current !== null || !isResurrectionRunning() || tomb === undefined) return;
      runRef.current = createResurrectionRun({
        scene,
        tomb,
        book: getBookHandle(tomb.id),
        quality: appStore.getState().data.prefs.quality,
        instant: wantsInstantSequence(),
      });
      detachSkipRef.current = attachResurrectionSkip(skipRun);
    };
    startWhenSaved();
    const unsubscribe = subscribeResurrection(startWhenSaved);
    return () => {
      unsubscribe();
      if (runRef.current !== null) finishRun();
    };
  }, [scene, finishRun, skipRun]);

  useFrame((_, delta) => {
    const run = runRef.current;
    if (run !== null && run.tick(delta)) finishRun();
  });

  return null;
}
