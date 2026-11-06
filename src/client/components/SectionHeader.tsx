// A header in a list: a section's name, its count, and what it can do.

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@hyperpane/ui';

/** A header in a list: a section's name, its count, and what it can do. */
export function SectionHeader({
  label,
  count,
  open,
  onToggle,
  children,
  className,
}: {
  label: string;
  count?: number;
  open?: boolean;
  onToggle?(): void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full items-center gap-1 px-1 text-2xs font-semibold tracking-wide text-[var(--node-muted)] uppercase', className)}>
      {onToggle ? (
        <button type="button" tabIndex={-1} className="flex min-w-0 items-center gap-1 hover:text-[var(--node-fg)]" onClick={onToggle}>
          <ChevronRight className={cn('size-3 flex-none transition-transform duration-150', open && 'rotate-90')} />
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <span className="truncate px-1">{label}</span>
      )}
      {count !== undefined && <span className="font-normal tabular-nums normal-case">{count.toLocaleString('en-US')}</span>}
      <span className="flex-1" />
      {children}
    </div>
  );
}
