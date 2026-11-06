// How diffs look: the row's height, a character's width (near enough), and
// the tints of added, removed and picked lines, hunk headers and the empty
// side of a side-by-side row.

export const ROW = 20;
export const CHAR = 7.2; // a 12px monospace character, near enough for the width

export const ADDED = 'color-mix(in srgb, var(--ansi-2) 13%, transparent)';
export const ADDED_GUTTER = 'color-mix(in srgb, var(--ansi-2) 22%, transparent)';
export const REMOVED = 'color-mix(in srgb, var(--ansi-1) 13%, transparent)';
export const REMOVED_GUTTER = 'color-mix(in srgb, var(--ansi-1) 22%, transparent)';
export const SELECTED = 'color-mix(in srgb, var(--node-accent) 30%, transparent)';
export const HUNK = 'color-mix(in srgb, var(--node-accent) 8%, transparent)';
export const EMPTY_SIDE =
  'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--node-fg) 4%, transparent) 4px 5px)';
