import { useEffect } from 'react';
import { MAX_SLOTS } from '../domain';
import { isTypingTarget } from '../interaction/typingTarget';
import { appStore } from '../store/appStore';

const DEMO_TITLES: readonly string[] = [
  'Tide Clock',
  'A Very Long Name For An Idea That Never Fit',
  'Moss Radio',
  '<b>Not HTML</b> <script>x</script>',
  'Paper Orchard',
  'Lantern Map',
  'Salt Garden',
  'Night Ledger',
  'Glass Bridge',
  'Quiet Engine',
  'Fern Archive',
  'Last Compass',
];

/** Fills every free slot with a demo project, through the same domain function the app uses. */
export function addDemoProjectsUntilFull(): number {
  const first = appStore.getState().data.projects.length;
  let added = 0;
  while (added < MAX_SLOTS) {
    const title = DEMO_TITLES[(first + added) % DEMO_TITLES.length] as string;
    const result = appStore
      .getState()
      .buryNewProject({ title, description: 'Demo project added with F3.' });
    if (!result.ok) break;
    added += 1;
  }
  return added;
}

/** Temporary developer key: F3 adds demo projects until the 12 slots are full. */
export function useDemoProjectsKey(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'F3' || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      addDemoProjectsUntilFull();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
