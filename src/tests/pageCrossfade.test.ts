import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PAGE_FADE_SECONDS } from '../book/bookTimings';
import { INITIAL_CROSSFADE, crossfadeSeconds, overlayWanted, stepCrossfade } from '../book/pageCrossfade';
import type { CrossfadeInput, CrossfadeState } from '../book/pageCrossfade';

const phaseArb = fc.constantFrom(...(['closed', 'lifting', 'approaching', 'coverOpening', 'open', 'closing'] as const));
const statusArb = fc.constantFrom(...(['idle', 'dragging', 'settling'] as const));
const inputArb: fc.Arbitrary<CrossfadeInput> = fc.record({
  phase: phaseArb,
  status: statusArb,
  reducedMotion: fc.boolean(),
  opaqueReported: fc.boolean(),
});

const RESTING: CrossfadeInput = { phase: 'open', status: 'idle', reducedMotion: false, opaqueReported: false };
const TURNING: CrossfadeInput = { ...RESTING, status: 'settling' };

describe('page cross-fade properties', () => {
  // **Validates: Requirements 2.2, 8.3**
  it('Feature: graveyard-core, Property 27: The cross-fade never uncovers the page', () => {
    fc.assert(
      fc.property(fc.array(inputArb, { maxLength: 60 }), (inputs) => {
        let state: CrossfadeState = INITIAL_CROSSFADE;
        for (const input of inputs) {
          const before = state;
          state = stepCrossfade(before, input);
          const wanted = input.phase === 'open' && input.status === 'idle';
          // Never blank: the texture is visible or the overlay is fully opaque.
          expect(state.textureVisible || state.overlay === 'opaque').toBe(true);
          // The overlay is opaque only for an open book at rest.
          if (state.overlay === 'opaque') expect(wanted).toBe(true);
          // Turn start or leaving `open`: texture shown and overlay hidden in the same step.
          if (!wanted) expect(state).toEqual({ textureVisible: true, overlay: 'hidden' });
          // The texture goes only after the report (or at once with reduced motion).
          if (!state.textureVisible && !input.reducedMotion && before.overlay !== 'opaque') {
            expect(before.overlay).toBe('fading');
            expect(input.opaqueReported).toBe(true);
          }
          // Reduced motion: no fade and no blank frame.
          expect(crossfadeSeconds(input.reducedMotion) === 0).toBe(input.reducedMotion);
          if (wanted && input.reducedMotion) expect(state).toEqual({ textureVisible: false, overlay: 'opaque' });
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('page cross-fade ordering', () => {
  it('shows the texture and hides the overlay in the same step at turn start', () => {
    const open = stepCrossfade(stepCrossfade(INITIAL_CROSSFADE, RESTING), { ...RESTING, opaqueReported: true });
    expect(open).toEqual({ textureVisible: false, overlay: 'opaque' });
    expect(stepCrossfade(open, TURNING)).toEqual({ textureVisible: true, overlay: 'hidden' });
    expect(stepCrossfade(open, { ...RESTING, phase: 'closing' })).toEqual({ textureVisible: true, overlay: 'hidden' });
  });

  it('fades the overlay in with the texture still visible, and swaps only after the report', () => {
    let state = stepCrossfade(INITIAL_CROSSFADE, TURNING);
    state = stepCrossfade(state, RESTING);
    expect(state).toEqual({ textureVisible: true, overlay: 'fading' });
    expect(crossfadeSeconds(false)).toBe(PAGE_FADE_SECONDS);
    expect(PAGE_FADE_SECONDS).toBe(0.15);
    state = stepCrossfade(state, RESTING);
    expect(state.textureVisible).toBe(true);
    state = stepCrossfade(state, { ...RESTING, opaqueReported: true });
    expect(state).toEqual({ textureVisible: false, overlay: 'opaque' });
  });

  it('keeps the texture under the overlay when the report never arrives', () => {
    let state = stepCrossfade(INITIAL_CROSSFADE, RESTING);
    for (let i = 0; i < 20; i++) state = stepCrossfade(state, RESTING);
    expect(state).toEqual({ textureVisible: true, overlay: 'fading' });
  });

  it('ignores a report that arrives before the fade has started', () => {
    expect(stepCrossfade(INITIAL_CROSSFADE, { ...RESTING, opaqueReported: true })).toEqual({
      textureVisible: true,
      overlay: 'fading',
    });
  });

  it('has no fade and no blank frame with reduced motion', () => {
    expect(crossfadeSeconds(true)).toBe(0);
    const reduced = { ...RESTING, reducedMotion: true };
    expect(stepCrossfade(INITIAL_CROSSFADE, reduced)).toEqual({ textureVisible: false, overlay: 'opaque' });
    expect(stepCrossfade(INITIAL_CROSSFADE, { ...reduced, status: 'settling' })).toEqual({
      textureVisible: true,
      overlay: 'hidden',
    });
  });

  it('wants the overlay only for an open book at rest', () => {
    expect(overlayWanted('open', 'idle')).toBe(true);
    expect(overlayWanted('open', 'dragging')).toBe(false);
    expect(overlayWanted('coverOpening', 'idle')).toBe(false);
  });
});
