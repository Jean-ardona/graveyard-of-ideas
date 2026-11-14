/** Static layout and palette of the night cemetery. Pure data, no Three.js. */

export interface GraveSlot {
  x: number;
  z: number;
  /** Rotation around Y in radians. The tomb front faces (sin r, cos r). */
  rotation: number;
}

export interface PathPoint {
  x: number;
  z: number;
}

export interface PathDef {
  width: number;
  points: PathPoint[];
}

export const TERRAIN_SIZE = 60;
export const EYE_HEIGHT = 1.7;

/** The player starts just outside the gate and looks through it. */
export const PLAYER_START = { x: 0, z: 27 } as const;
export const PLAYER_LOOK_AT = { x: 0, y: 1.2, z: 0 } as const;

export const GATE_POSITION = { x: 0, z: 24 } as const;
export const HUT_POSITION = { x: 0, z: -22 } as const;

/** Direction from the origin toward the moon; the moonlight shares it. */
export const MOON_DIRECTION = { x: -0.35, y: 0.5, z: -0.8 } as const;
export const MOON_DISTANCE = 100;

export const COLORS = {
  sky: '#1a2238',
  fog: '#1a2238',
  ground: '#2a3548',
  path: '#3c4456',
  moon: '#d6e4ff',
  moonlight: '#8fa8d8',
  ambient: '#34425e',
  stone: '#4a5568',
  ironDark: '#171d2b',
  wood: '#252d3d',
  hutWall: '#2f3846',
  hutRoof: '#1e2634',
  bush: '#1d2c36',
  mist: '#7f93b8',
  windowGlow: '#a8c8ff',
} as const;

export const FOG = { near: 12, far: 45 } as const;

/** Three paths leave the gate: a central one to the hut and two curving sideways. */
export const PATHS: readonly PathDef[] = [
  {
    width: 2.4,
    points: [
      { x: 0, z: 22 },
      { x: 0, z: 10 },
      { x: 0, z: -2 },
      { x: 0, z: -18.5 },
    ],
  },
  {
    width: 1.8,
    points: [
      { x: 0, z: 20 },
      { x: -7, z: 14 },
      { x: -14, z: 8 },
      { x: -20, z: 0 },
      { x: -22, z: -10 },
    ],
  },
  {
    width: 1.8,
    points: [
      { x: 0, z: 20 },
      { x: 7, z: 14 },
      { x: 14, z: 8 },
      { x: 20, z: 0 },
      { x: 22, z: -10 },
    ],
  },
];

/** 12 grave slots, each beside a path and facing it. Tombs are not rendered yet. */
export const GRAVE_SLOTS: readonly GraveSlot[] = [
  { x: -3.2, z: 12, rotation: 1.57 },
  { x: 3.2, z: 12, rotation: -1.57 },
  { x: -3.2, z: 3, rotation: 1.57 },
  { x: 3.2, z: 3, rotation: -1.57 },
  { x: -3.2, z: -6, rotation: 1.57 },
  { x: 3.2, z: -6, rotation: -1.57 },
  { x: -9, z: 8, rotation: -0.46 },
  { x: 9, z: 8, rotation: 0.46 },
  { x: -16.5, z: 0, rotation: -1.57 },
  { x: 16.5, z: 0, rotation: 1.57 },
  { x: -18.5, z: -9, rotation: -1.85 },
  { x: 18.5, z: -9, rotation: 1.85 },
];

export const MIN_SLOT_SPACING = 4;
