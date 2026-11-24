import { Component, createRef } from 'react';
import type { ReactNode } from 'react';
import type { QualityLevel } from '../../domain/types';
import { summonDurations } from './pageSummon';
import { summonController } from './summonController';
import type { SummonController } from './summonController';
import type { SummonKind } from './summonTimings';

/** Seconds after the end of a summon or a dismissal at which the page is settled even if no frame came. */
export const LANDING_MARGIN_SECONDS = 0.25;

export interface SummonedPageProps {
  /** Identifies the page shown. When it changes, the old page dissolves as a frozen copy and the new one is summoned. */
  pageKey: string | number;
  /** False dissolves the page (the last children stay shown meanwhile) and then calls `onDismissed`. Default true. */
  open?: boolean;
  /** Timing of the first summon and of the final dismissal. Default `full`. */
  kind?: SummonKind;
  /** Timing of a swap between two pages. Default `short`. */
  swapKind?: SummonKind;
  /** Reduced animations or calm mode: no controller, the page is landed from its first frame and leaves at once. */
  instant: boolean;
  quality: QualityLevel;
  /** The controller to animate with. It is the app's one controller unless a test passes another. */
  controller?: SummonController;
  className?: string;
  /** Called after mount and whenever the page lands (true) or a new summon starts (false). */
  onLandedChange?: (landed: boolean) => void;
  onDismissed?: () => void;
  children: ReactNode;
}

interface SummonedPageState {
  landed: boolean;
  /** The children of the last open render, kept while the page dissolves. */
  frozen: ReactNode;
}

/** React 18 has no `inert` prop: the plain attribute does the job. */
const INERT_ATTRIBUTES: Record<string, string> = { inert: '' };

/**
 * Wraps one page of the ritual or the resurrection dialog. It mounts the page at the start of its rise,
 * focuses the first field at once, keeps the page unclickable until it has landed, and keeps the outgoing
 * content as a frozen `inert` copy during a swap. A click anywhere lands the page and does nothing else. It never waits for the
 * animation to do its job: the owner decides what is shown and the state it shows is already saved.
 */
export default class SummonedPage extends Component<SummonedPageProps, SummonedPageState> {
  static getDerivedStateFromProps(props: SummonedPageProps, state: SummonedPageState): Partial<SummonedPageState> | null {
    const open = props.open !== false;
    const landed = state.landed || props.instant;
    if (open) return { frozen: props.children, landed };
    return landed === state.landed ? null : { landed };
  }

  override state: SummonedPageState = { landed: this.props.instant, frozen: this.props.children };

  private readonly page = createRef<HTMLDivElement>();
  private readonly retiring = createRef<HTMLDivElement>();
  private listening = false;
  private unmounted = false;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private dismissPending = false;

  override componentDidMount(): void {
    // StrictMode unmounts and mounts the same instance again in development: this instance is live again.
    this.unmounted = false;
    if (!this.props.instant && this.isOpen()) this.beginSummon(this.props.kind ?? 'full', 0);
    this.props.onLandedChange?.(this.state.landed);
  }

  override getSnapshotBeforeUpdate(previous: SummonedPageProps): HTMLElement | null {
    const page = this.page.current;
    if (this.props.instant || page === null || !this.isOpen() || previous.open === false) return null;
    if (previous.pageKey === this.props.pageKey) return null;
    this.controller.cancel(page);
    return page.cloneNode(true) as HTMLElement;
  }

  override componentDidUpdate(previous: SummonedPageProps, _state: SummonedPageState, snapshot: HTMLElement | null): void {
    const open = this.isOpen();
    const wasOpen = previous.open !== false;
    if (this.props.instant) {
      this.settleInstant();
      if (wasOpen && !open) this.props.onDismissed?.();
      return;
    }
    if (wasOpen && !open) {
      this.beginDismiss();
    } else if (!wasOpen && open) {
      this.beginSummon(this.props.kind ?? 'full', 0);
    } else if (open && snapshot !== null) {
      this.beginSwap(snapshot);
    }
  }

  override componentWillUnmount(): void {
    this.unmounted = true;
    this.clearDeadline();
    this.dismissPending = false;
    this.stopListening();
    const page = this.page.current;
    if (page !== null) this.controller.cancel(page);
    this.cancelRetiring();
  }

  /**
   * Lands the page and its dissolving copy at once. If the controller no longer animates the page (no frame
   * came, or the animation was cancelled), the page is still marked landed, so it can never stay locked.
   */
  land = (): void => {
    const page = this.page.current;
    const copy = this.retiring.current?.firstElementChild;
    if (copy instanceof HTMLElement) this.controller.land(copy);
    this.cancelRetiring();
    if (page !== null) this.controller.land(page);
    if (this.isOpen() && !this.state.landed) this.handleLanded();
  };

  private get controller(): SummonController {
    return this.props.controller ?? summonController;
  }

  private isOpen(): boolean {
    return this.props.open !== false;
  }

  private beginSummon(kind: SummonKind, delaySeconds: number): void {
    const page = this.page.current;
    if (page === null) return;
    this.dismissPending = false;
    if (this.state.landed) {
      this.setState({ landed: false });
    }
    this.props.onLandedChange?.(false);
    this.startListening();
    this.controller.start(page, kind, 'summon', this.props.quality, { delaySeconds, onDone: this.handleLanded });
    this.setDeadline(delaySeconds + summonDurations(kind, false).inSeconds, this.land);
    page.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
  }

  private beginDismiss(): void {
    const page = this.page.current;
    this.stopListening();
    if (page === null) return;
    this.controller.cancel(page);
    this.dismissPending = true;
    const kind = this.props.kind ?? 'full';
    this.controller.start(page, kind, 'dismiss', this.props.quality, { onDone: this.handleDismissed });
    this.setDeadline(summonDurations(kind, false).outSeconds, this.finishDismiss);
  }

  /** The dismissal deadline: ends the dissolve at once and reports it, whether or not a frame came. */
  private readonly finishDismiss = (): void => {
    const page = this.page.current;
    if (page !== null) this.controller.land(page);
    this.handleDismissed();
  };

  /** Settles the page after `seconds` plus the margin, with a plain timer that does not depend on frames. */
  private setDeadline(seconds: number, action: () => void): void {
    this.clearDeadline();
    this.deadline = setTimeout(() => {
      this.deadline = null;
      action();
    }, (seconds + LANDING_MARGIN_SECONDS) * 1000);
  }

  private clearDeadline(): void {
    if (this.deadline === null) return;
    clearTimeout(this.deadline);
    this.deadline = null;
  }

  private beginSwap(snapshot: HTMLElement): void {
    const host = this.retiring.current;
    if (host === null) return;
    const swapKind = this.props.swapKind ?? 'short';
    this.cancelRetiring();
    snapshot.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    snapshot.removeAttribute('data-landed');
    snapshot.setAttribute('inert', '');
    snapshot.setAttribute('aria-hidden', 'true');
    snapshot.style.pointerEvents = 'none';
    host.appendChild(snapshot);
    this.controller.start(snapshot, swapKind, 'dismiss', this.props.quality, {
      onDone: () => {
        if (snapshot.parentNode === host) host.removeChild(snapshot);
      },
    });
    this.beginSummon(swapKind, summonDurations(swapKind, false).outSeconds);
  }

  private settleInstant(): void {
    const page = this.page.current;
    this.clearDeadline();
    this.dismissPending = false;
    this.stopListening();
    if (page !== null) this.controller.cancel(page);
    this.cancelRetiring();
    if (!this.state.landed) this.setState({ landed: true });
    this.props.onLandedChange?.(true);
  }

  private cancelRetiring(): void {
    const host = this.retiring.current;
    if (host === null) return;
    const copy = host.firstElementChild;
    if (copy instanceof HTMLElement) this.controller.cancel(copy);
    host.replaceChildren();
  }

  private readonly handleLanded = (): void => {
    this.stopListening();
    this.clearDeadline();
    const page = this.page.current;
    if (page !== null) {
      page.style.removeProperty('transform');
      page.style.removeProperty('opacity');
    }
    if (this.unmounted || !this.isOpen()) return;
    if (!this.state.landed) this.setState({ landed: true });
    this.props.onLandedChange?.(true);
  };

  /** Reports the end of a dismissal once, from the frame loop or from the deadline, whichever comes first. */
  private readonly handleDismissed = (): void => {
    if (!this.dismissPending) return;
    this.dismissPending = false;
    this.clearDeadline();
    if (!this.unmounted) this.props.onDismissed?.();
  };

  /** The first click while a page rises only lands it: it never reaches a button under the page. */
  private readonly handleClick = (event: MouseEvent): void => {
    if (this.state.landed && this.isOpen()) {
      this.stopListening();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.land();
  };

  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('click', this.handleClick, true);
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('click', this.handleClick, true);
  }

  override render(): ReactNode {
    const open = this.isOpen();
    if (!open && this.props.instant) return null;
    const landed = this.state.landed && open;
    const { className, pageKey } = this.props;
    return (
      <div className={className ? `summon-stage ${className}` : 'summon-stage'}>
        <div ref={this.retiring} className="summon-retiring" aria-hidden="true" />
        <div
          key={pageKey}
          ref={this.page}
          className="summon-page"
          data-landed={landed ? 'true' : 'false'}
          style={{ pointerEvents: landed ? 'auto' : 'none' }}
          aria-hidden={open ? undefined : true}
          {...(open ? null : INERT_ATTRIBUTES)}
        >
          {this.state.frozen}
        </div>
      </div>
    );
  }
}
