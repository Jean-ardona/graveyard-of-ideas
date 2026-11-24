import { useRef } from 'react';
import { useFocused } from '../interaction/interactionState';
import { COPY } from './copy';
import { Prompt } from './kit';

/**
 * Discreet "E — label" prompt below the crosshair. Fades out while nothing is in reach
 * and stays hidden while `inputLocked` (a book sequence is running).
 */
export default function InteractionPrompt({ inputLocked = false }: { inputLocked?: boolean }) {
  const focused = useFocused();
  const lastLabel = useRef('');
  if (focused) lastLabel.current = focused.label;
  const shown = focused !== null && !inputLocked;
  return (
    <Prompt place="below" style={{ opacity: shown ? 1 : 0 }} aria-hidden={shown ? undefined : true}>
      {COPY.prompts.key}
      {lastLabel.current}
    </Prompt>
  );
}
