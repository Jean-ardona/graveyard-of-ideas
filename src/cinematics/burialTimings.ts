/**
 * Constants of the burial cinematic: the camera dolly and the reveal of the tomb's book. Data only:
 * no React, Three.js, DOM, store or timers. Tuned on the target machine.
 */

/** Seconds the camera takes to travel from the player to the hold spot. */
export const DOLLY_IN = 1.8;
/** Seconds the camera rests at the hold spot while the book is revealed. */
export const HOLD = 1.6;
/** Seconds the camera takes to travel back to the player. */
export const RETURN = 1.4;
/** Total length of the cinematic: `DOLLY_IN + HOLD + RETURN`. */
export const TOTAL_SECONDS = 4.8;
/** Elapsed time at which the hold ends and the return starts. */
export const HOLD_END = DOLLY_IN + HOLD;

/** Seconds the book takes to appear, counted from the start of the hold. */
export const APPEAR_SECONDS = 1.0;
/** Seconds the glow takes to fade, ending with the hold. */
export const GLOW_FADE_SECONDS = 0.6;
/** Elapsed time at which the glow starts to fade. */
export const GLOW_FADE_START = HOLD_END - GLOW_FADE_SECONDS;

/** Meters between the hold eye and the slab point, measured on the ground plane. */
export const HOLD_DISTANCE = 3.0;
/** Meters the camera rises at the middle of the dolly and of the return. */
export const DOLLY_ARC_HEIGHT = 1.5;
