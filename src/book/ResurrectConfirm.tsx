import { COPY } from '../ui/copy';
import { Button, Panel } from '../ui/kit';
import type { ResurrectRequest } from './resurrectRequest';

interface ResurrectConfirmProps {
  request: Extract<ResurrectRequest, { ok: true }>;
  onConfirm: () => void;
  onBack: () => void;
}

/** The last question before a resurrection: shows the first step, encourages a smaller version, never forces one. */
export default function ResurrectConfirm({ request, onConfirm, onBack }: ResurrectConfirmProps) {
  const { nextAction, reducedVersion } = request.input;
  return (
    <div className="resurrect-layer">
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
    </div>
  );
}
