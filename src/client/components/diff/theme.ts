// How diffs look: the row's height, a character's width (near enough), and
// the tints of added, removed and picked lines, hunk headers and the empty
// side of a side-by-side row.

/** Every row of a diff (code, hunk header, folded lines) and of blame: one
 * fixed height, as the virtual lists need it. 22px: room for a hunk's bar. */
export const ROW = 22;
export const CHAR = 7.2; // a 12px monospace character, near enough for the width

export const ADDED = 'var(--git-diff-add)';
export const ADDED_GUTTER = 'var(--git-diff-add-gutter)';
export const REMOVED = 'var(--git-diff-del)';
export const REMOVED_GUTTER = 'var(--git-diff-del-gutter)';
export const SELECTED = 'var(--git-diff-pick)';
export const HUNK = 'var(--git-diff-bar)';
export const EMPTY_SIDE = 'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--node-fg) 4%, transparent) 4px 5px)';
