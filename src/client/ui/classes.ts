// The Git window's patterns as class strings (DESIGN.md has the why): a
// view composes these rather than spelling out its own sizes and states.
// Tailwind reads class names from this file as it is, so each is written out
// in full.

import { styles } from '@hyperpane/ui';

/** Type: 13px body, 12px small, 11px labels (uppercase, sparingly). */
export const text = {
  base: 'text-[13px] leading-5',
  small: 'text-xs leading-4',
  label: 'text-[11px] leading-4 font-medium uppercase tracking-[0.06em] text-[var(--node-muted)]',
  muted: 'text-[var(--node-muted)]',
  mono: 'font-mono text-xs',
  num: 'tabular-nums',
} as const;

/** Icons: 16px, 14px in dense rows. */
export const icon = {
  base: 'size-4 flex-none',
  dense: 'size-3.5 flex-none',
} as const;

/** A row in a list: 32px (28px compact), a 8px corner, the window's hover. */
export const row = {
  base: 'group/row relative flex h-8 min-w-0 items-center gap-2 rounded-control px-2 text-[13px] transition-colors duration-100 hover:bg-[var(--node-hover)] touch:h-11',
  compact: 'group/row relative flex h-7 min-w-0 items-center gap-2 rounded-control px-2 text-[13px] transition-colors duration-100 hover:bg-[var(--node-hover)] touch:h-10',
  /** Picked: a soft pill in the accent, not a bar. */
  selected: 'bg-[var(--git-selected)] hover:bg-[var(--git-selected-hover)]',
  /** Picked in a list that hasn't the keys: quieter. */
  selectedQuiet: 'bg-[var(--git-selected-quiet)] hover:bg-[var(--git-selected-quiet)]',
  /** A list's inset: rows sit 6px in from its edges. */
  list: 'px-1.5 py-1',
} as const;

/** A section's header in a list: a small uppercase label, its count, its
 * actions at the end; 28px, no line under it. */
export const section = {
  header: 'flex h-7 items-center gap-1.5 px-2.5 text-[11px] leading-4 font-medium uppercase tracking-[0.06em] text-[var(--node-muted)]',
  count: 'text-[11px] font-normal tracking-normal tabular-nums opacity-75',
} as const;

/** The top bar's switcher: one pill in two halves (the repository, the
 * branch), each its own button with its own hover, clipped to the pill, and
 * a hairline between them. */
export const switcher = {
  base: 'inline-flex h-7 max-w-[min(36rem,100%)] min-w-0 shrink items-stretch overflow-hidden rounded-full bg-[var(--git-fill)] touch:h-9',
  half: cxs(
    'inline-flex min-w-0 shrink items-center gap-1.5 text-[13px] text-[var(--node-fg)] transition-colors duration-100 hover:bg-[var(--git-fill)] active:bg-[var(--git-fill-hover)]',
    styles.focusRingInset,
  ),
  open: 'bg-[var(--git-fill-hover)] hover:bg-[var(--git-fill-hover)]',
  hairline: 'my-1.5 w-px flex-none bg-[color-mix(in_srgb,var(--node-fg)_12%,transparent)]',
} as const;

/** A chip: a small tinted label (a ref, a count, a state). 20px, 6px corner.
 * Its colour comes from `--chip` (style={{ '--chip': 'var(--git-added)' }}). */
export const chip = {
  base: 'inline-flex h-5 flex-none items-center gap-1 rounded-chip px-1.5 text-[11px] leading-none font-medium tabular-nums whitespace-nowrap',
  tinted: 'bg-[color-mix(in_srgb,var(--chip,var(--node-fg))_14%,transparent)] text-[var(--chip,var(--node-muted))]',
  neutral: 'bg-[var(--git-fill)] text-[var(--node-muted)]',
} as const;

/** Buttons: primary (the accent, one per place), secondary (a soft fill),
 * ghost (nothing until hovered), danger. 28px; `lg` 32px. */
const buttonBase = cxs(
  'inline-flex h-7 flex-none items-center justify-center gap-1.5 rounded-control px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,filter,scale] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 touch:h-9 [&_svg]:size-4 [&_svg]:flex-none',
  styles.focusRing,
);
export const button = {
  base: buttonBase,
  lg: 'h-8 px-3.5',
  icon: 'w-7 px-0 touch:w-9',
  /** Disabled, it greys to a quiet fill rather than a dim accent. */
  primary:
    'bg-[var(--node-accent)] text-white shadow-[0_1px_0_0_color-mix(in_srgb,white_18%,transparent)_inset,0_1px_2px_0_color-mix(in_srgb,black_25%,transparent)] hover:brightness-110 active:brightness-95 disabled:bg-[var(--git-fill)] disabled:text-[var(--node-muted)] disabled:shadow-none disabled:opacity-100',
  secondary: 'bg-[var(--git-fill)] text-[var(--node-fg)] hover:bg-[var(--git-fill-hover)] active:bg-[var(--git-fill-active)]',
  ghost: 'text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] active:bg-[var(--node-active)]',
  danger: 'bg-[color-mix(in_srgb,var(--git-deleted)_14%,transparent)] text-[var(--git-deleted)] hover:bg-[color-mix(in_srgb,var(--git-deleted)_22%,transparent)]',
} as const;

/** A pane's header: 44px, so a list's and its detail's lines meet; a
 * hairline under it. Title 13px medium, meta 12px muted. */
export const header = {
  base: 'flex h-11 min-w-0 flex-none items-center gap-1.5 border-b border-[var(--git-line)] px-2 touch:h-12',
  title: 'min-w-0 truncate text-[13px] font-medium',
  meta: 'min-w-0 truncate text-xs text-[var(--node-muted)]',
} as const;

/** A list's foot (how many): 32px, 12px muted, no line over it. */
export const footer = 'flex h-8 flex-none items-center gap-1.5 px-3.5 text-xs text-[var(--node-muted)] tabular-nums';

/** A key's hint (⌘↵) in a button or a field: small, in the text's colour, faded. */
export const kbd = 'font-sans text-[11px] font-medium tracking-wide opacity-60';

/** A card: a raised surface with a hairline, 12px corners. */
export const card = 'rounded-surface bg-[var(--git-raised)] ring-1 ring-[var(--git-line)] ring-inset';

/** A hairline, for the few places spacing can't separate. */
export const divider = {
  x: 'h-px flex-none bg-[var(--git-line)]',
  y: 'w-px flex-none self-stretch bg-[var(--git-line)]',
} as const;

/** A field: 28px, a soft fill, the accent's ring while it has the keys. */
export const field =
  'h-7 min-w-0 rounded-control bg-[var(--git-fill)] px-2.5 text-[13px] text-[var(--node-fg)] outline-none placeholder:text-[var(--node-muted)] transition-[background-color,box-shadow] duration-100 hover:bg-[var(--git-fill-hover)] focus:bg-transparent focus:shadow-[0_0_0_1.5px_var(--node-accent)] touch:h-9';

function cxs(...parts: string[]) {
  return parts.join(' ');
}
