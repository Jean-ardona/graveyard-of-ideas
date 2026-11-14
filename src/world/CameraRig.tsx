import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { EYE_HEIGHT, PLAYER_LOOK_AT, PLAYER_START } from './config';

/** Places the camera at the gate at eye height, facing the cemetery. */
export default function CameraRig() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.position.set(PLAYER_START.x, EYE_HEIGHT, PLAYER_START.z);
    camera.lookAt(PLAYER_LOOK_AT.x, PLAYER_LOOK_AT.y, PLAYER_LOOK_AT.z);
  }, [camera]);

  return null;
}
