// The row style of every list in the window.

import { cn } from '@hyperpane/ui';

/** The row style every list here uses: 22px, hover, selected in the
 * accent's selection while the list has the keyboard. */
export const rowClass = (selected: boolean) =>
  cn(
    'rounded-chip flex h-full cursor-default items-center gap-1.5 px-1.5',
    selected ? 'bg-[var(--node-selection-inactive)] group-focus-within/list:bg-[var(--node-selection)]' : 'hover:bg-[var(--node-hover)]',
  );
