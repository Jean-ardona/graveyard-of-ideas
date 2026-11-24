import type { RitualPhase } from './ritualMachine';

export type RitualKeyEvent = 'NEXT' | 'SEAL' | 'CANCEL' | 'SKIP_CINEMATIC' | 'LAND';

/**
 * Maps a key press to a ritual event, or null when it means nothing here.
 * While writing: Enter validates the page, Ctrl+Enter seals the tomb, Shift+Enter is a new line
 * (left to the field) and Escape cancels. During the cinematic Escape, Enter or Space skips it.
 * Before the page has landed (`landed` false) Escape, Enter and Space only land it: they return `LAND`
 * and nothing else happens, so a typed character is kept and the next Escape cancels as before.
 * Safety rule: a second Escape before landing (`escapesBeforeLanding` at least 1) always cancels, so a page that
 * never lands can still be closed.
 */
export function routeRitualKey(
  key: string,
  shift: boolean,
  ctrl: boolean,
  phase: RitualPhase,
  landed: boolean,
  escapesBeforeLanding = 0,
): RitualKeyEvent | null {
  const escapeThrough = key === 'Escape' && escapesBeforeLanding >= 1;
  if (!landed && !escapeThrough && phase !== 'idle' && (key === 'Escape' || key === 'Enter' || key === ' ')) return 'LAND';
  if (phase === 'writing') {
    if (key === 'Escape') return 'CANCEL';
    if (key !== 'Enter') return null;
    if (ctrl) return 'SEAL';
    return shift ? null : 'NEXT';
  }
  if (phase === 'cinematic' && (key === 'Escape' || key === 'Enter' || key === ' ')) return 'SKIP_CINEMATIC';
  return null;
}
