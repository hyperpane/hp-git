// The style sheet the window adds for diffs.

/** The window's style sheet for diffs: changed words, keyframes, thin
 * scrollbars. */
export const DIFF_CSS = `
.git-word-added { background: var(--git-diff-add-word); border-radius: 2px; }
.git-word-removed { background: var(--git-diff-del-word); border-radius: 2px; }
.git-scroll { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--node-fg) 22%, transparent) transparent; }
@keyframes git-spin { to { transform: rotate(360deg); } }
`;
