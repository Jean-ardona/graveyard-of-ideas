import { COLORS, FOG, MOON_DIRECTION } from './config';
import CameraRig from './CameraRig';
import DeadTrees from './DeadTrees';
import Gate from './Gate';
import Hut from './Hut';
import Mist from './Mist';
import Moon from './Moon';
import Paths from './Paths';
import StonesAndBushes from './StonesAndBushes';
import GroundMesh from './GroundMesh';

const MOONLIGHT_POSITION: [number, number, number] = [
  MOON_DIRECTION.x * 50,
  MOON_DIRECTION.y * 50,
  MOON_DIRECTION.z * 50,
];

/** The night cemetery: sky, fog, moonlight, terrain and scenery. */
export default function NightScene() {
  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.fog, FOG.near, FOG.far]} />
      <ambientLight color={COLORS.ambient} intensity={0.6} />
      <directionalLight color={COLORS.moonlight} intensity={1} position={MOONLIGHT_POSITION} />
      <CameraRig />
      <Moon />
      <GroundMesh />
      <Paths />
      <Gate />
      <Hut />
      <DeadTrees />
      <StonesAndBushes />
      <Mist />
    </>
  );
}
