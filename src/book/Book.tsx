import { memo, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { BookAssets } from './bookAssets';
import { registerBookHandle } from './bookHandles';

interface BookProps {
  /** Id of the project this book holds. */
  id: string;
  assets: BookAssets;
}

/**
 * A closed book. Cover, spine, page block and pages are separate groups, registered under
 * the project id so a later effect (the ember dissolve) can reach each one. Geometry and
 * materials are shared; nothing here is allocated per book.
 */
function Book({ id, assets }: BookProps) {
  const cover = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Group>(null);
  const pageBlock = useRef<THREE.Group>(null);
  const pages = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!cover.current || !spine.current || !pageBlock.current || !pages.current) return undefined;
    return registerBookHandle({
      id,
      parts: { cover: cover.current, spine: spine.current, pageBlock: pageBlock.current, pages: pages.current },
    });
  }, [id]);

  return (
    <group>
      <group ref={cover}>
        <mesh geometry={assets.cover} material={assets.coverMaterial} />
      </group>
      <group ref={spine}>
        <mesh geometry={assets.spine} material={assets.spineMaterial} />
      </group>
      <group ref={pageBlock}>
        <mesh geometry={assets.pageBlock} material={assets.pageBlockMaterial} />
      </group>
      <group ref={pages}>
        <mesh geometry={assets.pages} material={assets.pagesMaterial} />
      </group>
    </group>
  );
}

export default memo(Book);
