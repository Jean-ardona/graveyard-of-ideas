import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { routeRitualKey } from '../interaction/ritualKeys';
import { ritualMachine } from '../interaction/ritualMachine';
import { getPointerMode, requestPointer, subscribePointerMode } from '../interaction/pointerLock';
import { clearRevealPending } from '../interaction/revealPending';
import { isTypingTarget } from '../interaction/typingTarget';
import { appStore } from '../store/appStore';
import { createBurialRun } from './burialRun';
import type { BurialRun } from './burialRun';
import { isLockLoss } from './resurrectionSkip';
import { wantsInstantSequence } from './resurrectionSession';

/** One running cinematic: the run, its project, and the detacher of its skip listeners. */
interface Active {
  run: BurialRun;
  projectId: string;
  detachSkip: () => void;
}

/**
 * Plays the burial cinematic in the 3D scene. It starts only on COMMIT_OK, when the project is already
 * saved and its id is in the reveal-pending flag; it never writes project data. The run claims the
 * camera with the player's pose captured once (the player's own position, yaw and pitch are never
 * written). In `useFrame` it ticks the timeline, which writes the dolly pose into the camera in
 * place. At the end, on skip (Escape, Enter or Space, or a lost pointer lock) and on unmount the run
 * releases the camera, which shows the player's own pose again; the driver then disposes the glow,
 * clears the flag, sends DONE and asks for the pointer again. A reload never replays: the flag is not
 * persisted and the machine starts idle.
 */
export default function BurialDriver() {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const activeRef = useRef<Active | null>(null);

  /** Releases the camera, disposes the run, shows the book, ends the ritual (which gives walking back) and asks for the pointer. */
  const finish = useCallback(() => {
    const active = activeRef.current;
    if (active === null) return;
    activeRef.current = null;
    active.detachSkip();
    active.run.dispose();
    clearRevealPending(active.projectId);
    ritualMachine.send({ type: 'DONE' });
    requestPointer();
  }, []);

  /** Skip: the final state at once, then the same cleanup as the natural end. */
  const skip = useCallback(() => {
    const active = activeRef.current;
    if (active === null || ritualMachine.send({ type: 'SKIP_CINEMATIC' }) !== 'skip') return;
    active.run.skip();
    finish();
  }, [finish]);

  useEffect(() => {
    /** Skip keys and a lost lock count only from the moment the cinematic starts, never for the key that sealed it. */
    const attachSkip = (): (() => void) => {
      let previous = getPointerMode();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.repeat || isTypingTarget(event.target)) return;
        const action = routeRitualKey(event.key, event.shiftKey, event.ctrlKey || event.metaKey, ritualMachine.phase());
        if (action === 'SKIP_CINEMATIC') skip();
      };
      const unsubscribe = subscribePointerMode(() => {
        const next = getPointerMode();
        const lost = isLockLoss(previous, next);
        previous = next;
        if (lost) skip();
      });
      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        unsubscribe();
      };
    };

    const startWhenSaved = (): void => {
      const { phase, committed, projectId } = ritualMachine.state;
      if (activeRef.current !== null || phase !== 'cinematic' || !committed || projectId === null) return;
      const project = appStore.getState().data.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined || project.slot === undefined) {
        clearRevealPending(projectId);
        ritualMachine.send({ type: 'DONE' });
        return;
      }
      const run = createBurialRun({
        scene,
        camera,
        projectId,
        slot: project.slot,
        instant: wantsInstantSequence(),
      });
      activeRef.current = { run, projectId, detachSkip: attachSkip() };
    };

    startWhenSaved();
    const unsubscribe = ritualMachine.subscribe(startWhenSaved);
    return () => {
      unsubscribe();
      const active = activeRef.current;
      if (active === null) return;
      // Torn down mid-run (for example the canvas is recreated): land on the final state, never replay.
      active.run.skip();
      finish();
    };
  }, [scene, camera, skip, finish]);

  useFrame((_, delta) => {
    const active = activeRef.current;
    if (active !== null && active.run.tick(delta)) finish();
  });

  return null;
}
