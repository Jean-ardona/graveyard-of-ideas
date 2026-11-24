import { registerCollider } from '../interaction/colliderRegistry';
import { registerActionHandler, registerInteractable } from '../interaction/interactionState';
import { startRitual } from '../interaction/ritualSession';
import { COPY } from '../ui/copy';
import { HUT_POSITION } from './config';
import type { BoxCollider } from './config';
import { LECTERN_DESK_HEIGHT } from './lecternAssets';

export const LECTERN_ID = 'hut-lectern';
export const LECTERN_ACTION = 'write-new-project';
const LECTERN_REACH = 2.4;

/** The lectern stands on the porch of the hut, right of the door, facing the gate (+z). */
export const LECTERN_OFFSET = { x: 1.6, z: 2.8 } as const;

export const LECTERN_POSITION = {
  x: HUT_POSITION.x + LECTERN_OFFSET.x,
  z: HUT_POSITION.z + LECTERN_OFFSET.z,
} as const;

export const LECTERN_COLLIDER: BoxCollider = {
  x: LECTERN_POSITION.x,
  z: LECTERN_POSITION.z,
  halfWidth: 0.4,
  halfDepth: 0.3,
  rotation: 0,
};

/**
 * Makes the lectern real: its collider, its prompt and the handler that starts the burial ritual.
 * `groundY` is the terrain height under it. Returns a function that undoes all three.
 */
export function registerLectern(groundY: number): () => void {
  const removeCollider = registerCollider(LECTERN_COLLIDER);
  const removeInteractable = registerInteractable({
    id: LECTERN_ID,
    position: { x: LECTERN_POSITION.x, y: groundY + LECTERN_DESK_HEIGHT, z: LECTERN_POSITION.z },
    radius: LECTERN_REACH,
    label: COPY.ritual.promptLabel,
    action: LECTERN_ACTION,
    enabled: true,
  });
  const removeHandler = registerActionHandler(LECTERN_ACTION, () => {
    startRitual();
  });
  return () => {
    removeCollider();
    removeInteractable();
    removeHandler();
  };
}
