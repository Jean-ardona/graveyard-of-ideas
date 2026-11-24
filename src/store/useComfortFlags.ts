import { useMemo } from 'react';
import { comfortFlags } from '../domain/comfort';
import type { ComfortFlags } from '../domain/comfort';
import { useAppStore } from './appStore';

/** The comfort flags for the saved prefs. Reads two booleans, so it rerenders only when one changes. */
export function useComfortFlags(): ComfortFlags {
  const calmMode = useAppStore((state) => state.data.prefs.calmMode);
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  return useMemo(() => comfortFlags({ calmMode, reducedMotion }), [calmMode, reducedMotion]);
}
