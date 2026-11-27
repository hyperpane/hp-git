// The row style of every list in the window, and its height with a finger.

import { cn, useTouch } from '@hyperpane/ui';

/** The row style every list here uses (DESIGN.md, list row), as tall as
 * the list's row: the control's corners, the window's hover; picked, a soft
 * pill in the accent while the list has the keys, a neutral one while it
 * hasn't. Put it in a `ROW_INSET` box so the pill keeps off the edges. */
export const rowClass = (selected: boolean) =>
  cn(
    'group/row relative flex h-full min-w-0 cursor-default items-center gap-2 rounded-control px-2 text-[13px] transition-colors duration-100',
    selected
      ? 'bg-[var(--git-selected-quiet)] group-focus-within/list:bg-[var(--git-selected)]'
      : 'hover:bg-[var(--node-hover)]',
  );

/** The box around a row: 6px in from the list's edges. */
export const ROW_INSET = 'h-full px-1.5';
/** Around a two-line row: 1px between pills too. */
export const ROW_INSET_TALL = 'h-full px-1.5 py-px';

/** A list row's height (DESIGN.md): 32px; two lines 46 (a 44px pill). */
export const ROW_H = 32;
export const ROW_H_TALL = 46;

/** A list's row height: `px`, or a finger's (36px) when the frame is used
 * with one. */
export function useRowHeight(px: number): number {
  return useTouch() ? Math.max(px, 36) : px;
}
