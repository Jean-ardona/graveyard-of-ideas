import type { QualityLevel } from '../domain/types';
import { TOKENS } from '../ui/theme/tokens';
import { SPECTER_PHASES, SPECTER_TOTAL } from './specterTimings';

/**
 * What the specter looks like, as numbers. Data only: no React, Three.js, DOM, store or timers.
 * Colors come from the tokens; no amber (amber is reserved for the embers).
 */

/** Near-black body of every particle (also the center of the dot texture). */
export const SPECTER_BODY_COLOR: string = TOKENS.color.specterBody;

/** Point size in meters per quality: a smaller budget needs bigger points to read as a mass. */
export const SPECTER_POINT_SIZE: Readonly<Record<QualityLevel, number>> = {
  low: 0.07,
  medium: 0.06,
  high: 0.05,
};

/** Highest alpha of a body particle. Low on purpose: overlapping soft points build up like smoke. */
export const BODY_ALPHA = 0.45;

/** Highest alpha of a shed particle, lower than the body so the smoke stays thin. */
export const SHED_ALPHA = 0.3;

/** Share of the particles that leave the body one by one as smoke during the departure. */
export const SHED_FRACTION = 0.35;

/** Seconds a shed particle drifts before it is gone. */
export const SHED_LIFE = 1.2;

/** A shed particle leaves the body no earlier than this (inside depart). */
export const SHED_EARLIEST = 3.7;

/** ... and no later than this, so its whole life ends by `SPECTER_TOTAL`. */
export const SHED_LATEST = SPECTER_TOTAL - SHED_LIFE;

/** Meters per second a shed particle drifts along the wind, and meters per second it rises. */
export const SHED_DRIFT = 2.0;
export const SHED_RISE = 0.5;

/** Radius in meters of the loose cloud around each silhouette point, and its turning speed. */
export const SWIRL_RADIUS = 0.9;
export const SWIRL_SPEED = 3.0;

/** Half-size in meters of the small shimmer on every particle. */
export const JITTER_AMPLITUDE = 0.03;

/** Fixed wind: a unit vector on the ground plane (x, z). */
export const WIND = { x: 0.6, z: 0.8 } as const;

/** Meters the silhouette travels away from the tomb, climbs, drifts with the wind, and sways sideways. */
export const DEPART_DISTANCE = 30;
export const DEPART_CLIMB = 7;
export const WIND_DRIFT = 6;
export const SWAY = 0.8;

/** Height in meters of the hem over the tomb when the specter starts and when it is formed. */
export const HOVER_START = 0.3;
export const HOVER_END = 1.2;

/** Where a particle is born: a disc of this radius over the tomb, at this height range. */
export const START_RADIUS = 0.9;
export const START_MIN_HEIGHT = 0.1;
export const START_HEIGHT_RANGE = 0.5;

/** Latest birth delay, and the seconds a particle needs to reach its place and to fade in. */
export const BIRTH_DELAY_MAX = 0.5;
export const GATHER_RISE_SECONDS = SPECTER_PHASES.gather.duration - BIRTH_DELAY_MAX;
export const FADE_IN_SECONDS = 0.6;

/** Seconds the silhouette takes to turn its back to the tomb's front when it departs. */
export const TURN_SECONDS = 1.2;

/** Seconds the lowest part of the cloak trails behind the center. */
export const TRAIL_LAG = 0.6;

/** Vanish: the dissolve of a particle starts after its own delay and lasts this long. */
export const VANISH_STAGGER = 0.6;
export const VANISH_DISSOLVE = SPECTER_PHASES.vanish.duration - VANISH_STAGGER;

/** Meters a dissolving particle rises. */
export const VANISH_RISE = 0.4;
