/**
 * Newer Node versions define a global `localStorage` that throws or returns nothing unless
 * `--localstorage-file` is given, and it hides the jsdom one. When the storage is unusable,
 * install a small in-memory one so the tests run the same on every Node version.
 */
function storageWorks(): boolean {
  try {
    window.localStorage.setItem('probe', '1');
    const ok = window.localStorage.getItem('probe') === '1';
    window.localStorage.removeItem('probe');
    return ok;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined' && !storageWorks()) {
  const items = new Map<string, string>();
  const memory = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memory });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
}
