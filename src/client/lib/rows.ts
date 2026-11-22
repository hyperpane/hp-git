// The row style of every list in the window, and its height with a finger.

import { cn, useTouch } from '@hyperpane/ui';

/** The row style every list here uses: 22px, hover, selected in the
 * accent's selection while the list has the keyboard. */
export const rowClass = (selected: boolean) =>
  cn(
    'rounded-chip flex h-full cursor-default items-center gap-1.5 px-1.5',
    selected ? 'bg-[var(--node-selection-inactive)] group-focus-within/list:bg-[var(--node-selection)]' : 'hover:bg-[var(--node-hover)]',
  );

/** A list's row height: `px`, or a finger's (36px) when the frame is used
 * with one. */
export function useRowHeight(px: number): number {
  return useTouch() ? Math.max(px, 36) : px;
}
