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
export const PLAYER_START = { x: 0, z: 31 } as const;

export const GATE_POSITION = { x: 0, z: 24 } as const;
export const HUT_POSITION = { x: 0, z: -16 } as const;

/** Direction from the origin toward the moon; the moonlight shares it. */
export const MOON_DIRECTION = { x: -0.35, y: 0.5, z: -0.8 } as const;
export const MOON_DISTANCE = 100;

export const COLORS = {
  sky: '#1a2238',
  fog: '#1a2238',
  ground: '#33415a',
  path: '#5a6a84',
  moon: '#d6e4ff',
  moonHalo: '#7f9ad0',
  moonlight: '#8fa8d8',
  ambient: '#4a5a7c',
  hemiGround: '#2a3548',
  stone: '#7a8498',
  stoneDark: '#656f84',
  ironDark: '#171d2b',
  wood: '#252d3d',
  hutWall: '#6b7487',
  hutRoof: '#1a2130',
  bush: '#1d2c36',
  mist: '#7f93b8',
  windowGlow: '#a8c8ff',
  moonPool: '#9db4e0',
  star: '#dfe8ff',
  mound: '#1f2838',
  /** The only warm tone in the scene. */
  lantern: '#ffe9a8',
} as const;

export const FOG = { near: 12, far: 60 } as const;

/** Three paths leave the gate: a central one to the hut and two curving sideways. */
export const PATHS: readonly PathDef[] = [
  {
    width: 2.4,
    points: [
      { x: 0, z: 22 },
      { x: 0, z: 10 },
      { x: 0, z: -2 },
      { x: 0, z: -13.5 },
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

/** Oriented box on the ground plane, used as a walking obstacle. */
export interface BoxCollider {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  /** Rotation around Y in radians, same convention as GraveSlot. */
  rotation: number;
}

/** Walking area. It extends past the terrain at the gate so the start point is inside. */
export const PLAYER_BOUNDS = { minX: -28, maxX: 28, minZ: -28, maxZ: 32 } as const;
export const PLAYER_RADIUS = 0.35;

const GATE_PILLAR_X = 4.5;
const GATE_WALL_X = 8.5;

const GATE_COLLIDERS: readonly BoxCollider[] = [-1, 1].flatMap((side) => [
  { x: side * GATE_PILLAR_X, z: GATE_POSITION.z, halfWidth: 0.95, halfDepth: 0.95, rotation: 0 },
  { x: side * GATE_WALL_X, z: GATE_POSITION.z, halfWidth: 3.25, halfDepth: 0.3, rotation: 0 },
]);

const HUT_COLLIDER: BoxCollider = {
  x: HUT_POSITION.x,
  z: HUT_POSITION.z,
  halfWidth: 2.5,
  halfDepth: 2,
  rotation: 0,
};

/** Footprint a tomb will occupy on its slot. */
const SLOT_COLLIDERS: readonly BoxCollider[] = GRAVE_SLOTS.map((slot) => ({
  x: slot.x,
  z: slot.z,
  halfWidth: 0.8,
  halfDepth: 1.3,
  rotation: slot.rotation,
}));

export const COLLIDERS: readonly BoxCollider[] = [
  ...GATE_COLLIDERS,
  HUT_COLLIDER,
  ...SLOT_COLLIDERS,
];
