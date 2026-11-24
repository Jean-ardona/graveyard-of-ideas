import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { LANDING_MARGIN_SECONDS } from '../ui/summon/SummonedPage';
import { SUMMON_TIMINGS } from '../ui/summon/summonTimings';
import type { SummonKind } from '../ui/summon/summonTimings';

/** A few frames: enough for the loop to reach the end, always shorter than the landing margin. */
const FRAME_SLACK_MS = 50;

/** A recording stand-in for the 2D context, shared by every canvas the code under test creates. */
export interface FakeContext {
  fillStyle: string;
  globalAlpha: number;
  clearRect: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
}

export interface FrameClock {
  context: FakeContext;
  /** Number of `requestAnimationFrame` calls so far. */
  requests: () => number;
  /** Number of callbacks waiting for the next frame. */
  pending: () => number;
  /** Moves the clock forward and runs the pending frame callbacks once. */
  advance: (ms: number) => void;
  restore: () => void;
}

/** Fakes `requestAnimationFrame`, `cancelAnimationFrame`, `performance.now` and the canvas 2D context. */
export function installFrameClock(): FrameClock {
  let now = 1000;
  let nextId = 0;
  let requests = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const context: FakeContext = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const contextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    requests += 1;
    nextId += 1;
    callbacks.set(nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    callbacks.delete(id);
  });
  return {
    context,
    requests: () => requests,
    pending: () => callbacks.size,
    advance: (ms) => {
      now += ms;
      const due = [...callbacks.values()];
      callbacks.clear();
      act(() => {
        for (const callback of due) callback(now);
      });
    },
    restore: () => {
      nowSpy.mockRestore();
      contextSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

/** Test times derived from the summon constants, never written as numbers in the tests. */
export const SUMMON_MS = {
  /** Milliseconds a summon of `kind` takes. */
  in: (kind: SummonKind): number => SUMMON_TIMINGS[kind].inSeconds * 1000,
  /** Milliseconds a dismissal of `kind` takes. */
  out: (kind: SummonKind): number => SUMMON_TIMINGS[kind].outSeconds * 1000,
  /** Comfortably past the end of a summon of `kind`, but before its landing deadline. */
  afterIn: (kind: SummonKind): number => SUMMON_TIMINGS[kind].inSeconds * 1000 + FRAME_SLACK_MS,
  /** Comfortably past the end of a dismissal of `kind`, but before its deadline. */
  afterOut: (kind: SummonKind): number => SUMMON_TIMINGS[kind].outSeconds * 1000 + FRAME_SLACK_MS,
  /** Past the landing deadline of a summon of `kind` (in-duration plus the margin). */
  afterDeadline: (kind: SummonKind): number =>
    (SUMMON_TIMINGS[kind].inSeconds + LANDING_MARGIN_SECONDS) * 1000 + FRAME_SLACK_MS,
  /** Past the deadline of a dismissal of `kind`. */
  afterOutDeadline: (kind: SummonKind): number =>
    (SUMMON_TIMINGS[kind].outSeconds + LANDING_MARGIN_SECONDS) * 1000 + FRAME_SLACK_MS,
  /** Past a whole swap of `kind`: the old page dissolves, then the new one rises. */
  afterSwap: (kind: SummonKind): number =>
    (SUMMON_TIMINGS[kind].outSeconds + SUMMON_TIMINGS[kind].inSeconds) * 1000 + FRAME_SLACK_MS,
  /** A point inside a summon of `kind`, as a fraction of its duration. */
  during: (kind: SummonKind, fraction: number): number => SUMMON_TIMINGS[kind].inSeconds * 1000 * fraction,
  /** A point inside a dismissal of `kind`, as a fraction of its duration. */
  duringOut: (kind: SummonKind, fraction: number): number => SUMMON_TIMINGS[kind].outSeconds * 1000 * fraction,
};
