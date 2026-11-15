import BookPageOverlay from './BookPageOverlay';
import { useReadingProject } from './readingBook';
import { useReadingPhase } from './useReadingPhase';

/** Shows the pages of the open book. Renders nothing until the cover is fully open. */
export default function BookReader() {
  const project = useReadingProject();
  const phase = useReadingPhase();
  return project && phase === 'open' ? <BookPageOverlay key={project.id} project={project} /> : null;
}
