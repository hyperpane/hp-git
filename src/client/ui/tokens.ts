// The Git window's own design tokens (DESIGN.md): CSS variables built on the
// window's theme (--node-*, --ansi-*), so every theme, light or dark, gets
// them without a rebuild. Added once per frame (hooks/useGitStyles.ts), on
// :root so a dialog's frame has them too.

/** The tokens, as a style sheet. */
export const GIT_TOKENS_CSS = `
:root {
  /* What a change is: one colour each, everywhere (letters, dots, counts). */
  --git-added: var(--ansi-2);
  --git-modified: var(--ansi-3);
  --git-deleted: var(--ansi-1);
  --git-renamed: var(--ansi-4);
  --git-copied: var(--ansi-6);
  --git-conflicted: color-mix(in srgb, var(--ansi-1) 55%, var(--ansi-3));
  --git-ignored: var(--node-muted);
  --git-typechange: var(--ansi-5);

  /* Refs and the two sides of a conflict: one colour each. */
  --git-branch: var(--ansi-2);
  --git-remote: var(--ansi-4);
  --git-tag: var(--ansi-3);
  --git-stash: var(--ansi-5);
  --git-ours: var(--ansi-4);
  --git-theirs: var(--ansi-5);

  /* Diffs: a line's tint, its gutter's (a step more), a changed word's;
     hunk headers and folded lines a quiet bar. */
  --git-diff-add: color-mix(in srgb, var(--git-added) 9%, transparent);
  --git-diff-add-gutter: color-mix(in srgb, var(--git-added) 16%, transparent);
  --git-diff-add-word: color-mix(in srgb, var(--git-added) 30%, transparent);
  --git-diff-del: color-mix(in srgb, var(--git-deleted) 9%, transparent);
  --git-diff-del-gutter: color-mix(in srgb, var(--git-deleted) 16%, transparent);
  --git-diff-del-word: color-mix(in srgb, var(--git-deleted) 30%, transparent);
  --git-diff-pick: color-mix(in srgb, var(--node-accent) 26%, transparent);
  --git-diff-bar: color-mix(in srgb, var(--node-fg) 3.5%, transparent);

  /* Surfaces: the window is --node-bg; the rail a step off it; a card or a
     raised field a step more. Lines are hairlines, softer than --node-border,
     and used sparingly: spacing separates first. */
  --git-rail: color-mix(in srgb, var(--node-fg) 3.5%, var(--node-bg));
  --git-raised: color-mix(in srgb, var(--node-fg) 4%, var(--node-bg));
  --git-line: color-mix(in srgb, var(--node-fg) 8%, transparent);

  /* Fills: a quiet control's rest and hover, a pressed one. */
  --git-fill: color-mix(in srgb, var(--node-fg) 6%, transparent);
  --git-fill-hover: color-mix(in srgb, var(--node-fg) 10%, transparent);
  --git-fill-active: color-mix(in srgb, var(--node-fg) 14%, transparent);

  /* Picked: a soft pill in the accent (a list's row); the rail's is neutral. */
  --git-selected: color-mix(in srgb, var(--node-accent) 16%, transparent);
  --git-selected-hover: color-mix(in srgb, var(--node-accent) 22%, transparent);
  --git-selected-quiet: color-mix(in srgb, var(--node-fg) 8%, transparent);
  --git-accent-soft: color-mix(in srgb, var(--node-accent) 14%, transparent);

  /* Motion: what moves (the rail's width) eases out over 220ms. */
  --git-ease: cubic-bezier(0.22, 0.8, 0.24, 1);
  --git-move: 220ms;

  /* The rail's two widths. */
  --git-rail-open: 184px;
  --git-rail-closed: 52px;
}
@keyframes git-spin { to { transform: rotate(360deg); } }
@keyframes git-pop { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  :root { --git-move: 0ms; }
}
`;
