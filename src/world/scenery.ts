import { scatter } from './layout';

/** Deterministic spots for the instanced scenery. */
export const TREE_PLACEMENTS = scatter(12, 11, { slot: 5, path: 3.5, hut: 7 }, 5, [0.9, 1.4]);
export const STONE_PLACEMENTS = scatter(28, 23, { slot: 2.5, path: 1.6, hut: 4.5 }, 1.5, [0.6, 1.3]);
export const BUSH_PLACEMENTS = scatter(14, 37, { slot: 3, path: 2, hut: 4.5 }, 2.5, [0.8, 1.4]);
