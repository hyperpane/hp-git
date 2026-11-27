// A message in the middle of a pane, with what can be done.

import type { ReactNode } from 'react';
import type { Icon as IconComponent } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';

/** A message in the middle of a pane: an icon in a soft tile, a short
 * title, a muted line, and what can be done. `error`: the tile in red. */
export function Blank({
  icon: Icon,
  title,
  children,
  actions,
  error,
}: {
  icon?: IconComponent;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center text-[13px] text-[var(--node-muted)]">
      {Icon && (
        <div
          className={cn(
            'rounded-surface grid size-11 flex-none place-items-center ring-1 ring-inset',
            error
              ? 'bg-[color-mix(in_srgb,var(--git-deleted)_12%,transparent)] text-[var(--git-deleted)] ring-[color-mix(in_srgb,var(--git-deleted)_20%,transparent)]'
              : 'bg-[var(--git-raised)] text-[var(--node-muted)] ring-[var(--git-line)]',
          )}
        >
          <Icon aria-hidden className="size-5" />
        </div>
      )}
      {(title || children) && (
        <div className="flex max-w-72 flex-col gap-1">
          {title && <div className="text-[13px] font-medium text-[var(--node-fg)]">{title}</div>}
          {children && <div className="text-xs leading-relaxed [overflow-wrap:anywhere]">{children}</div>}
        </div>
      )}
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
