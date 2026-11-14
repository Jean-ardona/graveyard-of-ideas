import { COLORS, FOG, MOON_DIRECTION } from './config';
import PlayerController from '../interaction/PlayerController';
import InteractionController from '../interaction/InteractionController';
import DeadTrees from './DeadTrees';
import Gate from './Gate';
import Hut from './Hut';
import Mist from './Mist';
import Moon from './Moon';
import Paths from './Paths';
import MoonPool from './MoonPool';
import SlotMarks from './SlotMarks';
import Stars from './Stars';
import StonesAndBushes from './StonesAndBushes';
import GroundMesh from './GroundMesh';

const MOONLIGHT_POSITION: [number, number, number] = [
  MOON_DIRECTION.x * 50,
  MOON_DIRECTION.y * 50,
  MOON_DIRECTION.z * 50,
];

/** The night cemetery: sky, fog, moonlight, terrain and scenery. */
export default function NightScene({ playerEnabled = true }: { playerEnabled?: boolean }) {
  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.fog, FOG.near, FOG.far]} />
      <ambientLight color={COLORS.ambient} intensity={0.9} />
      <hemisphereLight args={[COLORS.moonlight, COLORS.hemiGround, 0.5]} />
      <directionalLight color={COLORS.moonlight} intensity={1} position={MOONLIGHT_POSITION} />
      <PlayerController enabled={playerEnabled} />
      <InteractionController enabled={playerEnabled} />
      <Stars />
      <Moon />
      <GroundMesh />
      <Paths />
      <MoonPool />
      <SlotMarks />
      <Gate />
      <Hut />
      <DeadTrees />
      <StonesAndBushes />
      <Mist />
    </>
  );
}
