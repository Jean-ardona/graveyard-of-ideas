import { useRitualPhase } from '../interaction/ritualSession';
import { LECTERN_DESK_HEIGHT, LECTERN_DESK_TILT } from './lecternAssets';
import { LECTERN_POSITION } from './lecternLogic';
import { useDisposable } from './geometryUtils';
import { createQuillAssets } from './quillAssets';
import { terrainHeight } from './terrain';

/** Yaw of the quill on the desk, so it does not lie square to the board. */
const QUILL_YAW = 0.35;

/**
 * A quill resting on the lectern's desk. One mesh, nothing lit, no shadow. It is hidden while the
 * burial ritual runs and comes back when the ritual ends (cancelled or saved).
 */
export default function Quill() {
  const y = terrainHeight(LECTERN_POSITION.x, LECTERN_POSITION.z);
  const assets = useDisposable(createQuillAssets);
  const ritualRunning = useRitualPhase() !== 'idle';

  return (
    <mesh
      visible={!ritualRunning}
      position={[LECTERN_POSITION.x, y + LECTERN_DESK_HEIGHT, LECTERN_POSITION.z]}
      rotation={[LECTERN_DESK_TILT, QUILL_YAW, 0]}
      geometry={assets.geometry}
      material={assets.material}
    />
  );
}
