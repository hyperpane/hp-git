// The top bar's sync button: what fits now, styled by what it is (Fetch
// quiet; Pull ↓n, Push ↑n and Publish in the accent, as they're what's
// waiting), with a menu of the rest beside it; while a sync runs, a spinner,
// what it's doing and how far, a thin progress line, and a cancel.

import { ChevronDown, X } from '@hyperpane/icons';
import { cn, styles } from '@hyperpane/ui';
import type { SyncKind, syncChoice } from '../../app/actions/sync.ts';
import { useRepo } from '../../app/repo.ts';

type Choice = ReturnType<typeof syncChoice>;

const SHORT: Record<SyncKind, string> = { remote: 'Add remote', fetch: 'Fetch', publish: 'Publish branch', pull: 'Pull', push: 'Push' };

export function SyncButton({ choice, onMenu }: { choice: Choice; onMenu(el: HTMLElement): void }) {
  const repo = useRepo();
  const { status } = repo;
  const sync = repo.sync;
  const loud = !sync && (choice.kind === 'pull' || choice.kind === 'push' || choice.kind === 'publish');
  const Icon = choice.icon;
  // One pill in two halves, as the switcher: the accent when something
  // waits; else quiet (no fill until hovered, muted text), as fetching or
  // adding a remote is nothing to push you to. Busy, a soft fill.
  const half = cn(
    'flex h-full flex-none items-center transition-[background-color,color,filter] duration-100',
    styles.focusRingInset,
    loud
      ? 'text-white hover:bg-white/12 active:bg-black/10'
      : 'text-[var(--node-muted)] hover:bg-[var(--git-fill)] hover:text-[var(--node-fg)] active:bg-[var(--git-fill-hover)]',
  );
  const phase = sync ? (sync.phase ? `${sync.phase}${sync.percent !== null ? ` ${Math.round(sync.percent)}%` : ''}` : 'Starting') : '';
  return (
    <div
      className={cn(
        'flex h-7 min-w-0 flex-none items-stretch overflow-hidden rounded-full touch:h-9',
        loud ? 'bg-[var(--node-accent)] shadow-[0_1px_0_0_color-mix(in_srgb,white_18%,transparent)_inset]' : sync && 'bg-[var(--git-fill)]',
      )}
      data-sync={sync ? 'busy' : choice.kind}
    >
      <button
        type="button"
        onClick={sync ? undefined : () => choice.run?.()}
        title={sync ? sync.text || sync.label : `${choice.label} · ${choice.sub}`}
        aria-busy={!!sync || undefined}
        className={cn(half, 'relative min-w-0 gap-1.5 overflow-hidden rounded-s-full ps-2.5 pe-2 text-[13px] font-medium max-sm:pe-1.5', sync && 'cursor-default text-[var(--node-fg)]')}
      >
        {sync ? (
          <span aria-hidden className="size-3.5 flex-none animate-[git-spin_0.8s_linear_infinite] rounded-full border-[1.5px] border-current border-e-transparent opacity-80" />
        ) : (
          <Icon aria-hidden className="size-4 flex-none" />
        )}
        {sync ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate max-sm:sr-only">{sync.label}</span>
            <span className="truncate text-xs font-normal tabular-nums opacity-70">{phase}</span>
          </span>
        ) : (
          <span className="truncate max-sm:sr-only">{SHORT[choice.kind]}</span>
        )}
        {!sync && choice.kind === 'pull' && status.behind > 0 && <Count loud>↓{status.behind}</Count>}
        {!sync && choice.kind === 'push' && status.ahead > 0 && <Count loud>↑{status.ahead}</Count>}
        {!sync && choice.kind === 'pull' && status.ahead > 0 && <Count loud>↑{status.ahead}</Count>}
        {sync && (
          <span className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_18%,transparent)]" aria-hidden>
            <span
              className={cn('block h-full rounded-full bg-[var(--node-accent)] transition-[width] duration-300', sync.percent === null && 'w-1/3 animate-pulse')}
              style={sync.percent !== null ? { width: `${Math.max(4, sync.percent)}%` } : undefined}
            />
          </span>
        )}
      </button>
      {loud && <span aria-hidden className="my-1.5 w-px flex-none bg-white/25" />}
      {sync ? (
        <button type="button" title="Cancel" aria-label="Cancel" className={cn(half, 'w-7 justify-center rounded-e-full pe-0.5 touch:w-9')} onClick={() => sync.cancel()}>
          <X className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          title="More: fetch, pull, push, force push, remotes"
          aria-label="More sync actions"
          className={cn(half, 'w-6.5 justify-center rounded-e-full pe-0.5 touch:w-9')}
          onClick={(e) => onMenu(e.currentTarget)}
        >
          <ChevronDown className="size-3.5 opacity-80" />
        </button>
      )}
    </div>
  );
}

function Count({ children, loud }: { children: React.ReactNode; loud?: boolean }) {
  return (
    <span className={cn('flex-none rounded-full px-1.5 text-xs leading-4 font-semibold tabular-nums', loud ? 'bg-white/18' : 'bg-[var(--git-fill)]')}>{children}</span>
  );
}
