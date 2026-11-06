// Moving through a list by the keyboard.

/** Keyboard movement in a list of `count` rows: ↑ ↓, Home, End, Page Up
 * and Down. Returns the row to go to, or null for another key. */
export function listKey(e: { key: string; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }, at: number, count: number, page: number): number | null {
  if (!count) return null;
  if (e.key === 'ArrowDown') return Math.min(count - 1, at + 1);
  if (e.key === 'ArrowUp') return at < 0 ? count - 1 : Math.max(0, at - 1);
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return count - 1;
  if (e.key === 'PageDown') return Math.min(count - 1, Math.max(0, at) + page);
  if (e.key === 'PageUp') return Math.max(0, at - page);
  return null;
}
