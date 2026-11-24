/**
 * UI-only link between the resurrection dialog and the reading keys (never persisted). The dialog registers
 * a function that lands its page and reports whether it has landed; the key router asks before it acts.
 * It also counts the Escapes pressed before landing, so a second one always closes (the safety rule).
 */
let landNow: (() => void) | null = null;
let landed = true;
let escapes = 0;

export const resurrectGate = {
  attach(land: () => void): void {
    landNow = land;
    escapes = 0;
  },
  detach(): void {
    landNow = null;
    landed = true;
    escapes = 0;
  },
  setLanded(next: boolean): void {
    landed = next;
    escapes = 0;
  },
  /** null when no dialog is registered, otherwise whether it has landed. */
  landed(): boolean | null {
    return landNow === null ? null : landed;
  },
  /** Escapes pressed since the dialog started rising. */
  escapes(): number {
    return escapes;
  },
  noteEscape(): void {
    escapes += 1;
  },
  land(): void {
    landNow?.();
  },
};
