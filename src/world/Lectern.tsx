import { useEffect } from 'react';
import { useDisposable } from './geometryUtils';
import { createLecternAssets } from './lecternAssets';
import { LECTERN_POSITION, registerLectern } from './lecternLogic';
import { terrainHeight } from './terrain';

/** The grimoire's lectern on the hut's porch. One mesh, nothing lit, no shadow. */
export default function Lectern() {
  const y = terrainHeight(LECTERN_POSITION.x, LECTERN_POSITION.z);
  const assets = useDisposable(createLecternAssets);

  useEffect(() => registerLectern(y), [y]);

  return <mesh position={[LECTERN_POSITION.x, y, LECTERN_POSITION.z]} geometry={assets.geometry} material={assets.material} />;
}
