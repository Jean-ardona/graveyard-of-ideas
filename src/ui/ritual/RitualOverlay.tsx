import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RITUAL_STEPS, canSeal } from '../../domain';
import { routeRitualKey } from '../../interaction/ritualKeys';
import { ritualMachine } from '../../interaction/ritualMachine';
import type { RitualAction, RitualMachine } from '../../interaction/ritualMachine';
import { useAppStore } from '../../store/appStore';
import { COPY, errorMessage, pageCaptionText } from '../copy';
import { Button, InkField, Panel, Prompt } from '../kit';

/** Each half of a page swap: the old page fades out, then the new one fades in. */
export const PAGE_FADE_MS = 180;

interface RitualOverlayProps {
  /** The machine to read and drive. It is the app's one machine unless a test passes another. */
  machine?: RitualMachine;
}

/**
 * One parchment page in front of the player. It shows the machine's state and sends only machine events:
 * it never commits, never touches the store's projects and never makes a link clickable.
 */
export default function RitualOverlay({ machine = ritualMachine }: RitualOverlayProps) {
  useSyncExternalStore(machine.subscribe, machine.version);
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const calmMode = useAppStore((state) => state.data.prefs.calmMode);
  const still = reducedMotion || calmMode;

  const { phase, step, draft, error } = machine.state;
  const [shown, setShown] = useState(step);
  const [swap, setSwap] = useState<'in' | 'out'>('in');
  const viewStep = still || phase !== 'writing' ? step : shown;
  const swapping = viewStep !== step;
  const swappingRef = useRef(false);
  swappingRef.current = swapping;

  useEffect(() => {
    if (phase !== 'writing' || still) {
      setShown(step);
      setSwap('in');
      return undefined;
    }
    if (shown === step) return undefined;
    setSwap('out');
    const timer = setTimeout(() => {
      setShown(step);
      setSwap('in');
    }, PAGE_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, step, shown, still]);

  const writing = phase === 'writing';
  useEffect(() => {
    if (!writing) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      const action = routeRitualKey(event.key, event.shiftKey, event.ctrlKey || event.metaKey, 'writing');
      if (!action) return;
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (action === 'NEXT' && !inField) return;
      event.preventDefault();
      if (swappingRef.current && action !== 'CANCEL') return;
      machine.send({ type: action } as RitualAction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [writing, machine]);

  const current = RITUAL_STEPS[viewStep];
  if (phase === 'cinematic' && machine.state.committed) {
    return <Prompt place="bottom">{COPY.ritual.cinematicHint}</Prompt>;
  }
  if (!writing || !current) return null;

  const copy = COPY.ritual.steps[current.id];
  const send = (action: RitualAction): void => {
    if (!swapping) machine.send(action);
  };
  const shownError = swapping ? null : error;

  return (
    <div className="ritual-layer">
      <Panel
        className="ritual-page"
        role="dialog"
        aria-label={COPY.ritual.dialog}
        data-testid="ritual-page"
        data-still={still ? 'true' : 'false'}
      >
        <div className="ritual-sheet" data-testid="ritual-sheet" data-phase={swap} data-step={viewStep}>
          <h2>{copy.title}</h2>
          <label htmlFor="ritual-field">{copy.label}</label>
          <p className="ritual-hint" id="ritual-hint">
            {copy.hint}
          </p>
          <InkField
            id="ritual-field"
            value={draft[current.id]}
            onValueChange={(text) => send({ type: 'EDIT', text })}
            multiline={current.kind === 'multiline'}
            rows={5}
            still={still}
            focusKey={viewStep}
            aria-describedby={shownError ? 'ritual-hint ritual-error' : 'ritual-hint'}
            aria-invalid={shownError !== null}
          />
          {shownError ? (
            <p className="ritual-error" id="ritual-error" role="alert">
              {errorMessage(shownError)}
            </p>
          ) : null}
          <p className="ritual-caption">{pageCaptionText(viewStep + 1, RITUAL_STEPS.length)}</p>
          <div className="ritual-controls">
            <Button disabled={step === 0} onClick={() => send({ type: 'BACK' })}>
              {COPY.ritual.back}
            </Button>
            {current.required ? null : <Button onClick={() => send({ type: 'SKIP_STEP' })}>{COPY.ritual.skip}</Button>}
            <Button onClick={() => send({ type: 'CANCEL' })}>{COPY.ritual.cancel}</Button>
            <Button onClick={() => send({ type: 'NEXT' })}>{COPY.ritual.next}</Button>
            <Button disabled={!canSeal(draft)} onClick={() => send({ type: 'SEAL' })}>
              {COPY.ritual.seal}
            </Button>
          </div>
          <p className="ritual-hint">{COPY.ritual.skipHint}</p>
        </div>
      </Panel>
    </div>
  );
}
