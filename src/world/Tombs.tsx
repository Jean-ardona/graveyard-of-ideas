import { useMemo } from 'react';
import { createBookAssets } from '../book';
import { useAppStore } from '../store/appStore';
import Tomb from './Tomb';
import { createTombAssets } from './tombAssets';
import { toTombDescriptors } from './tombLogic';
import { useDisposable } from './geometryUtils';

/**
 * One tomb per resting project, at its slot. Tombs are keyed by project id, so a change
 * to the projects adds or removes only the tombs that differ; the others are not rebuilt.
 * Every tomb holds a book; all books share one set of geometry and materials.
 * Empty slots keep only the mound drawn by SlotMarks.
 */
export default function Tombs() {
  const projects = useAppStore((state) => state.data.projects);
  const assets = useDisposable(createTombAssets);
  const bookAssets = useDisposable(createBookAssets);
  const descriptors = useMemo(() => toTombDescriptors(projects), [projects]);

  return (
    <>
      {descriptors.map((descriptor) => (
        <Tomb key={descriptor.id} descriptor={descriptor} assets={assets} bookAssets={bookAssets} />
      ))}
    </>
  );
}
