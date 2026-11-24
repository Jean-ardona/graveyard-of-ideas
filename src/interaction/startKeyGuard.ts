/**
 * UI-only guard for the key press that opens a page (never persisted). When E starts the ritual, the page
 * mounts and focuses its first field during that same key event, so the browser could still type the
 * letter into it. `markStartTurn` is called when an E action runs; until the current task ends,
 * `isStartTurn` is true and the page drops any input it receives.
 */
let startTurn = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function markStartTurn(): void {
  startTurn = true;
  if (timer !== null) return;
  timer = setTimeout(() => {
    startTurn = false;
    timer = null;
  }, 0);
}

/** True from an E start until the end of the event turn it happened in. */
export function isStartTurn(): boolean {
  return startTurn;
}
