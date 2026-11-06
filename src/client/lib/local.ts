// What this machine remembers of a Git window.

/** What this machine keeps of a window: pane sizes, its tab. In the
 * plugin's own origin, so it survives the frame. */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`git.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`git.${key}`, JSON.stringify(value));
    } catch {
      // Full or refused: it's only a preference.
    }
  },
};
