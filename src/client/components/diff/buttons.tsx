// The small buttons in a diff's rows: a hunk's actions, and opening the
// lines folded between hunks.

import type { ReactNode } from 'react';
import type { Ellipsis } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';

export function HunkButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick(): void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-[18px] flex-none rounded-full px-2 text-[11px] leading-none font-medium transition-colors duration-100 disabled:opacity-40',
        // Discard is quiet until it's under the pointer: red then, never
        // shouting from every hunk.
        danger
          ? 'text-[var(--node-muted)] hover:bg-[color-mix(in_srgb,var(--git-deleted)_16%,transparent)] hover:text-[var(--git-deleted)]'
          : 'bg-[var(--git-fill)] text-[var(--node-fg)] hover:bg-[var(--git-fill-hover)]',
      )}
    >
      {children}
    </button>
  );
}

export function GapButton({ title, icon: Icon, onClick }: { title: string; icon: typeof Ellipsis; onClick(): void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-[18px] items-center justify-center rounded-full transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)]"
    >
      <Icon className="size-3" />
    </button>
  );
}
