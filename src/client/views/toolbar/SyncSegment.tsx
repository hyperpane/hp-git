// The toolbar's sync button: what fits now, or the sync under way with its
// progress and a cancel; and a menu with the rest.

import type { ReactNode } from 'react';
import { ChevronDown, X, type LucideIcon } from 'lucide-react';
import { Progress, cn, styles } from '@hyperpane/ui';
import { useRepo } from '../../app/repo.ts';
import { SegmentText, narrowSegment, segmentButton } from './Segment.tsx';

export function SyncSegment({
  icon: Icon,
  label,
  sub,
  badge,
  onClick,
  onMenu,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  badge: ReactNode;
  onClick(): void;
  onMenu(el: HTMLElement): void;
}) {
  const repo = useRepo();
  const sync = repo.sync;
  return (
    <div className={cn('rounded-control relative flex h-8 flex-none items-stretch overflow-hidden touch:h-10', narrowSegment('w-[28%] max-w-72 min-w-36'))}>
      <button
        type="button"
        onClick={sync ? undefined : onClick}
        className={cn(segmentButton, 'h-full flex-1 rounded-e-none touch:h-full', styles.focusRingInset)}
        title={sync ? sync.text || sync.label : label}
      >
        <Icon className={cn('size-4 flex-none text-[var(--node-muted)]', sync && 'animate-[git-spin_1s_linear_infinite]')} />
        <SegmentText
          title={sync ? (sync.phase ? `${sync.phase}${sync.percent !== null ? ` ${Math.round(sync.percent)}%` : ''}` : 'Starting') : sub}
          value={sync ? sync.label : label}
        />
        {!sync && badge}
      </button>
      {sync ? (
        <button
          type="button"
          title="Cancel"
          aria-label="Cancel"
          className={cn(
            'rounded-e-control flex w-7 flex-none items-center justify-center text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:w-10',
            styles.focusRingInset,
          )}
          onClick={() => sync.cancel()}
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          title="More: fetch, pull, push, force push, remotes"
          aria-label="More sync actions"
          className={cn(
            'rounded-e-control flex w-6 flex-none items-center justify-center text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:w-10',
            styles.focusRingInset,
          )}
          onClick={(e) => onMenu(e.currentTarget)}
        >
          <ChevronDown className="size-3.5" />
        </button>
      )}
      {sync && <Progress value={sync.percent} size="xs" label={sync.label} className="absolute inset-x-0 bottom-0 rounded-none" />}
    </div>
  );
}
