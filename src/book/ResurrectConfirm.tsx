import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { COPY } from '../ui/copy';
import { Button, Panel } from '../ui/kit';
import { SummonedPage } from '../ui/summon';
import type { ResurrectRequest } from './resurrectRequest';
import { resurrectGate } from './resurrectGate';

interface ResurrectConfirmProps {
  /** The request to show. It may be null while the dialog dissolves: the last content stays. */
  request: Extract<ResurrectRequest, { ok: true }> | null;
  /** False dissolves the dialog and then calls `onDismissed`. */
  open: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onDismissed: () => void;
}

/**
 * The last question before a resurrection: shows the first step, encourages a smaller version, never forces one.
 * The dialog is summoned like a page and dissolves when it is answered; the answer itself never waits for it.
 */
export default function ResurrectConfirm({ request, open, onConfirm, onBack, onDismissed }: ResurrectConfirmProps) {
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const calmMode = useAppStore((state) => state.data.prefs.calmMode);
  const quality = useAppStore((state) => state.data.prefs.quality);
  const page = useRef<SummonedPage>(null);
  useEffect(() => {
    resurrectGate.attach(() => page.current?.land());
    return () => resurrectGate.detach();
  }, []);
  const nextAction = request?.input.nextAction;
  const reducedVersion = request?.input.reducedVersion;
  return (
    <div className="resurrect-layer">
      <SummonedPage
        ref={page}
        pageKey="resurrect"
        open={open}
        instant={reducedMotion || calmMode}
        quality={quality}
        onLandedChange={resurrectGate.setLanded}
        onDismissed={onDismissed}
      >
        {request === null ? null : (
          <Panel className="resurrect-panel" role="dialog" aria-label={COPY.resurrection.dialog} data-testid="resurrect-confirm">
            <h2>{COPY.resurrection.dialog}</h2>
            <p>{COPY.resurrection.intro}</p>
            <p className="resurrect-label">{COPY.resurrection.nextActionLabel}</p>
            <p data-testid="resurrect-next-action">{nextAction}</p>
            {reducedVersion === undefined ? (
              <p className="resurrect-hint" data-testid="resurrect-encouragement">
                {COPY.resurrection.reducedEncouragement}
              </p>
            ) : (
              <>
                <p className="resurrect-label">{COPY.resurrection.reducedLabel}</p>
                <p data-testid="resurrect-reduced">{reducedVersion}</p>
              </>
            )}
            <div className="resurrect-controls">
              <Button onClick={onBack}>{COPY.resurrection.back}</Button>
              <Button onClick={onConfirm} data-testid="resurrect-confirm-button">
                {COPY.resurrection.confirm}
              </Button>
            </div>
          </Panel>
        )}
      </SummonedPage>
    </div>
  );
}
