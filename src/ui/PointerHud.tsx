import { usePointerMode } from '../interaction/pointerLock';
import { COPY } from './copy';
import { Prompt } from './kit';

/** Center dot while the pointer is locked; a resume prompt when the lock was lost. */
export default function PointerHud() {
  const mode = usePointerMode();
  if (mode === 'locked') return <div className="hud-dot" aria-hidden="true" />;
  if (mode === 'lost') return <Prompt place="center">{COPY.prompts.resume}</Prompt>;
  return null;
}
