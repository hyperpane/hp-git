// A message in the middle of a pane, with what can be done.

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A message in the middle of a pane, with what can be done. */
export function Blank({ icon: Icon, title, children, actions }: { icon?: LucideIcon; title?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 overflow-auto p-6 text-center text-xs text-[var(--node-muted)]">
      {Icon && <Icon className="mb-1 size-8 text-[var(--node-muted)] opacity-70" strokeWidth={1.5} />}
      {title && <div className="text-sm font-semibold text-[var(--node-fg)]">{title}</div>}
      {children && <div className="max-w-96 leading-relaxed">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
