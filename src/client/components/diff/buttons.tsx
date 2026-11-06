// The small buttons in a diff's rows: a hunk's actions, and opening the
// lines folded between hunks.

import type { ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { cn } from '@hyperpane/ui';

export function HunkButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick(): void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-chip h-4 flex-none px-1.5 text-[10px] font-medium transition-colors duration-100 disabled:opacity-40',
        danger ? 'text-[var(--ansi-1)] hover:bg-[color-mix(in_srgb,var(--ansi-1)_16%,transparent)]' : 'text-[var(--node-fg)] hover:bg-[var(--node-hover)]',
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
      className="rounded-chip flex size-4 items-center justify-center transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
    >
      <Icon className="size-3" />
    </button>
  );
}
