// The row of tabs over the window's list (Changes, History, Branches,
// Stashes, Tags), narrow ones as icons.

import type { LucideIcon } from 'lucide-react';
import { cn, styles } from '@hyperpane/ui';

export interface TabSpec<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
  /** Something needs looking at (conflicts). */
  alert?: boolean;
}

/** A row of tabs over a list. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: TabSpec<T>[]; value: T; onChange(t: T): void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex h-8 flex-none items-stretch border-b border-[var(--node-border)] px-1', className)}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={t.id}
            title={t.label}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const at = tabs.findIndex((x) => x.id === value);
              if (e.key === 'ArrowRight') onChange(tabs[(at + 1) % tabs.length].id);
              else if (e.key === 'ArrowLeft') onChange(tabs[(at - 1 + tabs.length) % tabs.length].id);
              else return;
              e.preventDefault();
            }}
            className={cn(
              'relative flex min-w-0 items-center justify-center gap-1 px-1.5 text-xs font-medium transition-colors duration-100',
              on ? 'flex-[1_0_auto]' : 'flex-1',
              on ? 'text-[var(--node-fg)]' : 'text-[var(--node-muted)] hover:text-[var(--node-fg)]',
              styles.focusRingInset,
            )}
          >
            {Icon && <Icon className="size-3.5 flex-none" />}
            {/* Narrow: the picked tab's name, the others' icons. */}
            <span className={cn('truncate', !on && '@max-[379px]/side:hidden')}>{t.label}</span>
            {!!t.count && (
              <span
                className={cn(
                  'rounded-full px-1 text-[10px] leading-4 tabular-nums',
                  t.alert ? 'bg-[color-mix(in_srgb,var(--ansi-9)_22%,transparent)] text-[var(--ansi-9)]' : 'bg-[var(--node-hover)] text-[var(--node-muted)]',
                )}
              >
                {t.count > 9999 ? '9k+' : t.count}
              </span>
            )}
            <span className={cn('absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-colors duration-150', on ? 'bg-[var(--node-accent)]' : 'bg-transparent')} />
          </button>
        );
      })}
    </div>
  );
}
