// The toolbar's sync button: what fits now, or the sync under way with its
// progress and a cancel; and a menu with the rest.

import type { ReactNode } from 'react';
import { ChevronDown, X, type LucideIcon } from 'lucide-react';
import { cn, styles } from '@hyperpane/ui';
import { useRepo } from '../../app/repo.ts';
import { Progress } from '../../components/Progress.tsx';

export function SyncSegment({ icon: Icon, label, sub, badge, onClick, onMenu }: { icon: LucideIcon; label: string; sub: string; badge: ReactNode; onClick(): void; onMenu(el: HTMLElement): void }) {
  const repo = useRepo();
  const sync = repo.sync;
  return (
    <div className="relative flex w-[28%] max-w-72 min-w-36 flex-none items-stretch border-e border-[var(--node-border)]">
      <button
        type="button"
        onClick={sync ? undefined : onClick}
        className={cn('flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left transition-colors duration-100 hover:bg-[var(--node-hover)]', styles.focusRingInset)}
        title={sync ? sync.text || sync.label : label}
      >
        <Icon className={cn('size-4 flex-none text-[var(--node-muted)]', sync && 'animate-[git-spin_1s_linear_infinite]')} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-xs font-semibold">{sync ? `${sync.label}…` : label}</span>
          <span className="truncate text-[10px] text-[var(--node-muted)]">
            {sync ? (sync.phase ? `${sync.phase}${sync.percent !== null ? ` ${Math.round(sync.percent)}%` : ''}` : 'Starting…') : sub}
          </span>
        </span>
        {!sync && badge}
      </button>
      {sync ? (
        <button type="button" title="Cancel" aria-label="Cancel" className="flex w-7 flex-none items-center justify-center text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]" onClick={() => sync.cancel()}>
          <X className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          title="More: fetch, pull, push, force push, remotes"
          aria-label="More sync actions"
          className="flex w-6 flex-none items-center justify-center border-s border-[var(--node-border)] text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
          onClick={(e) => onMenu(e.currentTarget)}
        >
          <ChevronDown className="size-3.5" />
        </button>
      )}
      {sync && <Progress percent={sync.percent} className="absolute inset-x-0 bottom-0 rounded-none" />}
    </div>
  );
}
