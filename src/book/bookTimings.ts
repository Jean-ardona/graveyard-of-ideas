/** Durations in seconds of the three opening steps. The closing sequence plays them in reverse. */
export const SEQUENCE_TIMINGS = { liftSeconds: 1.0, approachSeconds: 1.2, coverSeconds: 1.2 } as const;

/** Time on the forward timeline when the lift ends. */
export const LIFT_END = SEQUENCE_TIMINGS.liftSeconds;
/** Time on the forward timeline when the approach ends. */
export const APPROACH_END = LIFT_END + SEQUENCE_TIMINGS.approachSeconds;
/** Length of the whole opening sequence. */
export const TOTAL_SECONDS = APPROACH_END + SEQUENCE_TIMINGS.coverSeconds;

/** Longest frame step the book accepts, the same clamp as the player controller. */
export const MAX_FRAME_DELTA = 0.05;

/** Meters the book rises above its base pose. */
export const LIFT_HEIGHT = 0.15;

/** Reading pose in camera space, tuned on the target machine. */
export const READING_POSE = { distance: 0.55, down: 0.04 } as const;

/** Front board angle in radians when the cover is fully open (about 175 degrees). */
export const COVER_OPEN_ANGLE = 3.05;

export const PAGE_TURN = {
  deadzonePx: 4,
  fullTurnRatio: 0.8,
  commitThreshold: 0.5,
  settleSeconds: 0.3,
} as const;

/**
 * Curved page turn. `segments` is the number of equal pieces of the bending leaf; `tipLag` is the
 * most, in radians, by which the free edge trails the spine. Below 1, so every angle stays in [0, pi].
 */
export const LEAF_CURL = { segments: 12, tipLag: 0.8 } as const;

/**
 * How much of `LEAF_CURL.tipLag` the bend uses, 0 to 1. 0 keeps the leaf rigid, 1 bends it by the
 * full tip lag. The default is a gentler bend than the full one.
 */
export const CURL_STRENGTH = 0.6;

/** CSS fade of the page content after a turn. */
export const PAGE_FADE_SECONDS = 0.15;
