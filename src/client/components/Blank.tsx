// A message in the middle of a pane, with what can be done.

import type { ReactNode } from 'react';
import type { Icon as IconComponent } from '@hyperpane/icons';
import { IconTile } from '@hyperpane/ui';

/** A message in the middle of a pane: an icon in the kit's tile (as
 * Explorer's and the Editor's are, flat), a short title, a muted line, and
 * what can be done. `error`: the tile in red. */
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
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-auto p-6 text-center text-[13px] text-[var(--node-muted)]">
      {Icon && <IconTile size="lg" tint={error ? 'var(--git-deleted)' : undefined} icon={<Icon aria-hidden />} />}
      {(title || children) && (
        <div className="flex max-w-72 flex-col gap-1">
          {title && <div className="text-[13px] font-medium text-[var(--node-fg)]">{title}</div>}
          {children && <div className="text-xs leading-relaxed [overflow-wrap:anywhere]">{children}</div>}
        </div>
      )}
      {actions && <div className="flex flex-wrap justify-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
