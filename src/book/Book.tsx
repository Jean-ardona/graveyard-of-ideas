import { memo, useEffect, useMemo } from 'react';
import type { BookAssets } from './bookAssets';
import { registerBookHandle } from './bookHandles';
import { applyRestPose, createBookModel } from './bookModel';

interface BookProps {
  /** Id of the project this book holds. */
  id: string;
  assets: BookAssets;
}

/**
 * A closed book lying flat on its parent surface: a hinged front board, a spine, a page block and a stack of leaves, registered
 * under the project id so later effects (the page turns, the ember dissolve) can reach each part.
 * Geometry, materials and texture are shared; only the lightweight objects are per book.
 */
function Book({ id, assets }: BookProps) {
  const model = useMemo(() => {
    const built = createBookModel(assets);
    applyRestPose(built.root);
    return built;
  }, [assets]);

  useEffect(
    () => registerBookHandle({ id, root: model.root, parts: model.parts, leaves: model.leaves }),
    [id, model],
  );

  return <primitive object={model.root} />;
}

export default memo(Book);
