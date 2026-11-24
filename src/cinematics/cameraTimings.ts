/**
 * Camera constants shared by the burial dolly and the resurrection follow. Data only: no React,
 * Three.js, DOM, store or timers.
 */

/** Seconds the camera takes to turn from the player's look to the specter. */
export const FOLLOW_IN_SECONDS = 2.0;

/** Seconds the aim point lags behind the specter, so the look is smoothed without stored state. */
export const LOOK_LAG = 0.35;

/** Meters the aim point sits below the specter center, so the figure rides above the screen center. */
export const FRAME_DROP = 0.8;

/** Radians (about 26 degrees): the specter stays inside this angle around the view direction. */
export const FRAME_CONE = 0.45;

/** Radians per second: the most the camera yaw or pitch may turn. */
export const MAX_CAMERA_RATE = 3.5;

/** Seconds the camera takes to turn back to the player's look. Shared with the specter timings. */
export const RETURN_SECONDS = 1.6;
