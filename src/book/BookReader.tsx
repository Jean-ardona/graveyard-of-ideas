import type { ResurrectInput } from '../domain';
import { startResurrection } from '../cinematics/resurrectionSession';
import BookPageOverlay from './BookPageOverlay';
import { useReadingProject } from './readingBook';
import { useReadingPhase } from './useReadingPhase';

/** Shows the pages of the open book. Renders nothing until the cover is fully open. */
export default function BookReader() {
  const project = useReadingProject();
  const phase = useReadingPhase();
  if (!project || phase !== 'open') return null;
  // The session saves status Resurrected first, then the embers and specter sequence represents it.
  const resurrect = (input: ResurrectInput): void => {
    startResurrection(project.id, input);
  };
  return <BookPageOverlay key={project.id} project={project} onResurrect={resurrect} />;
}
