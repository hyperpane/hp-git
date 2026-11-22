// A message in the middle of a pane, with what can be done.

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
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
  icon?: LucideIcon;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-auto p-6 text-center text-xs text-[var(--node-muted)]">
      {Icon && (
        <div
          className={cn(
            'rounded-surface grid size-9 flex-none place-items-center',
            error ? 'bg-[color-mix(in_srgb,var(--ansi-1)_12%,transparent)] text-[var(--ansi-1)]' : 'bg-[var(--node-hover)] text-[var(--node-muted)]',
          )}
        >
          <Icon aria-hidden className="size-4" />
        </div>
      )}
      {(title || children) && (
        <div className="flex max-w-80 flex-col gap-1">
          {title && <div className="font-medium text-[var(--node-fg)]">{title}</div>}
          {children && <div className="leading-relaxed [overflow-wrap:anywhere]">{children}</div>}
        </div>
      )}
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
