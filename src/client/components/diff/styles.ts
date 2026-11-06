// The style sheet the window adds for diffs.

/** The window's style sheet for diffs: changed words, keyframes, thin
 * scrollbars. */
export const DIFF_CSS = `
.git-word-added { background: color-mix(in srgb, var(--ansi-2) 34%, transparent); border-radius: 2px; }
.git-word-removed { background: color-mix(in srgb, var(--ansi-1) 34%, transparent); border-radius: 2px; }
.git-scroll { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--node-fg) 22%, transparent) transparent; }
@keyframes git-indeterminate { 0% { left: -33%; } 100% { left: 100%; } }
@keyframes git-spin { to { transform: rotate(360deg); } }
`;
