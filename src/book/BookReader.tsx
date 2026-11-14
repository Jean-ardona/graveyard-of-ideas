import BookPages from './BookPages';
import { useReadingProject } from './readingBook';

/** Shows the pages of the open book. Renders nothing while no book is open. */
export default function BookReader() {
  const project = useReadingProject();
  return project ? <BookPages key={project.id} project={project} /> : null;
}
