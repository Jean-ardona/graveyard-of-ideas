import BookPages from './BookPages';
import { useReadingProject } from './readingBook';
import { useReadingPhase } from './useReadingPhase';

/** Shows the pages of the open book. Renders nothing until the cover is fully open. */
export default function BookReader() {
  const project = useReadingProject();
  const phase = useReadingPhase();
  return project && phase === 'open' ? <BookPages key={project.id} project={project} /> : null;
}
