import { useMemo } from 'react';
import { createBookAssets } from '../book';
import { useAppStore } from '../store/appStore';
import Tomb from './Tomb';
import { createTombAssets } from './tombAssets';
import { toTombDescriptors, withHeldTombs } from './tombLogic';
import { useHeldTombs } from '../cinematics/resurrectionSession';
import { useDisposable } from './geometryUtils';

/**
 * One tomb per resting project, at its slot. Tombs are keyed by project id, so a change
 * to the projects adds or removes only the tombs that differ; the others are not rebuilt.
 * Every tomb holds a book; all books share one set of geometry and materials.
 * A tomb kept for a running resurrection stays until the sequence ends, without its prompt.
 * Empty slots keep only the mound drawn by SlotMarks.
 */
export default function Tombs() {
  const projects = useAppStore((state) => state.data.projects);
  const assets = useDisposable(createTombAssets);
  const bookAssets = useDisposable(createBookAssets);
  const held = useHeldTombs();
  const descriptors = useMemo(() => withHeldTombs(toTombDescriptors(projects), held), [projects, held]);

  return (
    <>
      {descriptors.map((descriptor) => (
        <Tomb
          key={descriptor.id}
          descriptor={descriptor}
          assets={assets}
          bookAssets={bookAssets}
          retiring={held.some((tomb) => tomb.id === descriptor.id)}
        />
      ))}
    </>
  );
}
