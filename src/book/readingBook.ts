import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Project } from '../domain';
import { useAppStore } from '../store/appStore';

/** Which book is open for reading, if any. Only the id lives here; the project data stays in the saved store. */
const readingStore = createStore<{ projectId: string | null }>()(() => ({ projectId: null }));

export function openBook(projectId: string): void {
  readingStore.setState({ projectId });
}

export function closeBook(): void {
  readingStore.setState({ projectId: null });
}

/** The resting project whose book is open, or null (also when that project no longer rests). */
export function useReadingProject(): Project | null {
  const projectId = useStore(readingStore, (state) => state.projectId);
  return useAppStore((state) => {
    if (projectId === null) return null;
    const project = state.data.projects.find((p) => p.id === projectId);
    return project?.status === 'resting' ? project : null;
  });
}
