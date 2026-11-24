import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RITUAL_STEPS, canSeal } from '../../domain';
import { routeRitualKey } from '../../interaction/ritualKeys';
import { ritualMachine } from '../../interaction/ritualMachine';
import { isStartTurn } from '../../interaction/startKeyGuard';
import type { RitualAction, RitualMachine } from '../../interaction/ritualMachine';
import { useAppStore } from '../../store/appStore';
import { COPY, errorMessage, pageCaptionText } from '../copy';
import { Button, InkField, Panel, Prompt } from '../kit';
import { SummonedPage } from '../summon';

interface RitualOverlayProps {
  /** The machine to read and drive. It is the app's one machine unless a test passes another. */
  machine?: RitualMachine;
}

/**
 * One parchment page in front of the player. It shows the machine's state and sends only machine events:
 * it never commits, never touches the store's projects and never makes a link clickable.
 * The page is summoned (full for the first page, short between steps) and dissolves when the ritual is
 * cancelled or sealed; the machine and the store never wait for that. Before the page has landed, Escape,
 * Enter and Space only land it.
 */
export default function RitualOverlay({ machine = ritualMachine }: RitualOverlayProps) {
  useSyncExternalStore(machine.subscribe, machine.version);
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const calmMode = useAppStore((state) => state.data.prefs.calmMode);
  const quality = useAppStore((state) => state.data.prefs.quality);
  const instant = reducedMotion || calmMode;
  const { phase, step, draft, error } = machine.state;
  const writing = phase === 'writing';
  // The page stays mounted while it dissolves, after the machine has left `writing`.
  const [present, setPresent] = useState(false);
  const landedRef = useRef(true);
  // Escapes pressed before the page landed: a second one always cancels (the safety rule of `routeRitualKey`).
  const escapesRef = useRef(0);
  const page = useRef<SummonedPage>(null);
  useEffect(() => {
    if (writing) setPresent(true);
  }, [writing]);
  useEffect(() => {
    if (!writing) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      const action = routeRitualKey(
        event.key,
        event.shiftKey,
        event.ctrlKey || event.metaKey,
        'writing',
        landedRef.current,
        escapesRef.current,
      );
      if (!action) return;
      if (action === 'LAND') {
        // In the field, a Space or a Shift+Enter is still typed; anywhere else the key only lands the page.
        const inText = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
        if (!inText || (event.key !== ' ' && !(event.key === 'Enter' && event.shiftKey))) event.preventDefault();
        page.current?.land();
        // Counted after landing, which resets the count: it only stays above 0 if the page did not land.
        if (event.key === 'Escape') escapesRef.current += 1;
        return;
      }
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (action === 'NEXT' && !inField) return;
      event.preventDefault();
      machine.send({ type: action } as RitualAction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [writing, machine]);
  const hint =
    phase === 'cinematic' && machine.state.committed ? <Prompt place="bottom">{COPY.ritual.cinematicHint}</Prompt> : null;
  if (!writing && !present) return hint;
  const current = RITUAL_STEPS[step];
  const copy = current ? COPY.ritual.steps[current.id] : null;
  // Typing always reaches the machine; the buttons act only once the page has landed.
  const send = (action: RitualAction): void => {
    if (landedRef.current) machine.send(action);
  };
  return (
    <>
      {hint}
      <div className="ritual-layer">
        <SummonedPage
          ref={page}
          pageKey={step}
          open={writing}
          instant={instant}
          quality={quality}
          onLandedChange={(landed) => {
            landedRef.current = landed;
            escapesRef.current = 0;
          }}
          onDismissed={() => setPresent(false)}
        >
          {writing && current && copy ? (
            <Panel
              className="ritual-page"
              role="dialog"
              aria-label={COPY.ritual.dialog}
              data-testid="ritual-page"
              data-still={instant ? 'true' : 'false'}
            >
              <div className="ritual-sheet" data-testid="ritual-sheet" data-step={step}>
                <h2>{copy.title}</h2>
                <label htmlFor="ritual-field">{copy.label}</label>
                <p className="ritual-hint" id="ritual-hint">
                  {copy.hint}
                </p>
                <InkField
                  id="ritual-field"
                  value={draft[current.id]}
                  onValueChange={(text) => {
                    // Input in the same event turn as the E that started the ritual is that E: drop it.
                    if (!isStartTurn()) machine.send({ type: 'EDIT', text });
                  }}
                  multiline={current.kind === 'multiline'}
                  rows={5}
                  still={instant}
                  focusKey={step}
                  aria-describedby={error ? 'ritual-hint ritual-error' : 'ritual-hint'}
                  aria-invalid={error !== null}
                />
                {error ? (
                  <p className="ritual-error" id="ritual-error" role="alert">
                    {errorMessage(error)}
                  </p>
                ) : null}
                <p className="ritual-caption">{pageCaptionText(step + 1, RITUAL_STEPS.length)}</p>
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
          ) : null}
        </SummonedPage>
      </div>
    </>
  );
}
