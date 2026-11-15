import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Book, BOOK_REST_FOOTPRINT, openBook } from '../book';
import type { BookAssets } from '../book';
import { registerActionHandler, registerCollider, registerInteractable } from '../interaction';
import { createEngravingTexture } from './engravingTexture';
import { useDisposable } from './geometryUtils';
import { terrainHeight } from './terrain';
import { PLINTH } from './tombAssets';
import type { TombAssets } from './tombAssets';
import { registerTombHandle } from './tombHandles';
import { sameTomb, slabOffset, tombCollider } from './tombLogic';
import type { TombDescriptor } from './tombLogic';

const PROMPT_HEIGHT = 0.9;
/** The prompt point is this far in front of the tomb center: the middle of the resting book. */
const PROMPT_FRONT = PLINTH.bookZ - BOOK_REST_FOOTPRINT.length / 2;
const REACH = 2.6;
/** The book lies on top of the plinth; its origin is the bottom edge, the book extends toward the tomb. */
const BOOK_POSITION: [number, number, number] = [0, PLINTH.topY, PLINTH.bookZ];

interface TombProps {
  descriptor: TombDescriptor;
  assets: TombAssets;
  bookAssets: BookAssets;
}

/**
 * One tomb: stone body with a sliding front slab, a low plinth in front with the project's
 * book lying on it, and the name engraved on its face. Geometry and materials (stone and book) are shared;
 * only the name texture and its material belong to this tomb and are disposed with it.
 */
function Tomb({ descriptor, assets, bookAssets }: TombProps) {
  const { id, title, label, x, z, rotation, lean, shape } = descriptor;
  const slabRef = useRef<THREE.Mesh>(null);
  const openProgress = useRef(0);
  const y = terrainHeight(x, z);

  const texture = useDisposable(() => createEngravingTexture(title), [title]);
  const nameMaterial = useDisposable(
    () => new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }),
    [texture],
  );

  useEffect(() => {
    const action = `open-tomb:${id}`;
    const removeInteractable = registerInteractable({
      id: `tomb-${id}`,
      position: {
        x: x + Math.sin(rotation) * PROMPT_FRONT,
        y: y + PROMPT_HEIGHT,
        z: z + Math.cos(rotation) * PROMPT_FRONT,
      },
      radius: REACH,
      label,
      action,
      enabled: true,
    });
    // E starts the book sequence: the book lifts, comes to the player and opens.
    const removeHandler = registerActionHandler(action, () => openBook(id));
    const removeCollider = registerCollider(tombCollider(descriptor, PLINTH.backZ + PLINTH.depth));
    const removeHandle = registerTombHandle({
      id,
      setOpenProgress(progress) {
        const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
        openProgress.current = clamped;
        if (slabRef.current) slabRef.current.position.x = slabOffset(clamped);
      },
      getOpenProgress: () => openProgress.current,
    });
    return () => {
      removeInteractable();
      removeHandler();
      removeCollider();
      removeHandle();
    };
    // The descriptor is fully described by the fields below.
  }, [id, title, label, x, z, rotation, y]);

  return (
    <group position={[x, y, z]} rotation={[0, rotation, 0]}>
      <group rotation={[0, 0, lean]}>
        <mesh geometry={assets.bodies[shape]} material={assets.stone} />
        <mesh geometry={assets.plinth} material={assets.stone} />
        <group position={BOOK_POSITION}>
          <Book id={id} assets={bookAssets} />
        </group>
        <mesh ref={slabRef} geometry={assets.slab} material={assets.slabStone} />
        <mesh geometry={assets.namePlane} material={nameMaterial} />
      </group>
    </group>
  );
}

export default memo(Tomb, (previous, next) => sameTomb(previous.descriptor, next.descriptor));
