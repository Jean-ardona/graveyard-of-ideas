import type { RitualPhase } from './ritualMachine';

export type RitualKeyEvent = 'NEXT' | 'SEAL' | 'CANCEL' | 'SKIP_CINEMATIC';

/**
 * Maps a key press to a ritual event, or null when it means nothing here.
 * While writing: Enter validates the page, Ctrl+Enter seals the tomb, Shift+Enter is a new line
 * (left to the field) and Escape cancels. During the cinematic Escape, Enter or Space skips it.
 */
export function routeRitualKey(key: string, shift: boolean, ctrl: boolean, phase: RitualPhase): RitualKeyEvent | null {
  if (phase === 'writing') {
    if (key === 'Escape') return 'CANCEL';
    if (key !== 'Enter') return null;
    if (ctrl) return 'SEAL';
    return shift ? null : 'NEXT';
  }
  if (phase === 'cinematic' && (key === 'Escape' || key === 'Enter' || key === ' ')) return 'SKIP_CINEMATIC';
  return null;
}
