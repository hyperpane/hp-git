// The row style of every list in the window, and its height with a finger.

import { cn, useTouch } from '@hyperpane/ui';

/** The row style every list here uses (28px, from the list's height):
 * the control's corners, hover, selected in the accent's selection while
 * the list has the keyboard, quieter while it hasn't. */
export const rowClass = (selected: boolean) =>
  cn(
    'rounded-control flex h-full cursor-default items-center gap-2 px-2',
    selected ? 'bg-[var(--node-selection-inactive)] group-focus-within/list:bg-[var(--node-selection)]' : 'hover:bg-[var(--node-hover)]',
  );

/** A list's row height: `px`, or a finger's (36px) when the frame is used
 * with one. */
export function useRowHeight(px: number): number {
  return useTouch() ? Math.max(px, 36) : px;
}
