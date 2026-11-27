// One conflict: ours beside theirs (and the base between them, when the
// markers have it), to take one side, both, or leave for later.

import { Check } from '@hyperpane/icons';
import { MONO } from '@hyperpane/code';
import { cn } from '@hyperpane/ui';
import type { Block, Choice } from '../../lib/conflicts.ts';
import { Dot } from '../../ui/parts.tsx';
import { Code } from './Code.tsx';

export function ConflictBlock({
  b,
  number,
  choice,
  onChoose,
  ours,
  theirs,
}: {
  b: Extract<Block, { t: 'conflict' }>;
  number: number;
  choice: Choice | undefined;
  onChoose(x: Choice | null): void;
  ours: string;
  theirs: string;
}) {
  return (
    <div
      className="rounded-surface my-3 overflow-hidden bg-[var(--git-raised)] font-sans ring-1 ring-[color-mix(in_srgb,var(--git-conflicted)_35%,transparent)] ring-inset"
      data-block={number}
    >
      <div className="flex h-10 items-center gap-1.5 ps-3 pe-1.5 text-xs touch:h-11 max-sm:h-auto max-sm:min-h-10 max-sm:flex-wrap max-sm:py-1.5">
        <Dot color="var(--git-conflicted)" className="size-2" />
        <span className="font-medium">Conflict {number}</span>
        <span className="text-[var(--node-muted)]">line {b.at}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-0.5 rounded-control bg-[var(--git-fill)] p-0.5">
        <Pick on={choice === 'ours'} onClick={() => onChoose('ours')}>
          Ours
        </Pick>
        <Pick on={choice === 'theirs'} onClick={() => onChoose('theirs')}>
          Theirs
        </Pick>
        <Pick on={choice === 'both'} onClick={() => onChoose('both')}>
          Both
        </Pick>
        <Pick on={choice === 'bothTheirsFirst'} onClick={() => onChoose('bothTheirsFirst')}>
          Theirs, Then Ours
        </Pick>
        </span>
      </div>
      <div className={cn('grid max-sm:grid-cols-1', b.base ? 'grid-cols-3' : 'grid-cols-2')} style={{ fontFamily: MONO }}>
        <Side
          title={`Ours · ${b.oursLabel || ours}`}
          lines={b.ours}
          color="var(--git-ours)"
          taken={choice === 'ours' || choice === 'both' || choice === 'bothTheirsFirst'}
          dropped={choice === 'theirs'}
        />
        {b.base && <Side title="Base" lines={b.base} color="var(--node-muted)" taken={false} dropped={!!choice} />}
        <Side
          title={`Theirs · ${b.theirsLabel || theirs}`}
          lines={b.theirs}
          color="var(--git-theirs)"
          taken={choice === 'theirs' || choice === 'both' || choice === 'bothTheirsFirst'}
          dropped={choice === 'ours'}
        />
      </div>
    </div>
  );
}

function Side({ title, lines, color, taken, dropped }: { title: string; lines: string[]; color: string; taken: boolean; dropped: boolean }) {
  return (
    <div
      className={cn(
        'min-w-0 border-t border-e border-[var(--git-line)] transition-opacity duration-150 last:border-e-0 max-sm:border-e-0',
        dropped && 'opacity-40',
      )}
    >
      <div
        className="flex h-7 items-center gap-1.5 px-3 font-sans text-[11px] font-medium"
        style={{ color }}
      >
        <span className="truncate">{title}</span>
        {taken && <Check className="size-3 flex-none motion-safe:animate-[git-pop_150ms_ease-out]" />}
      </div>
      <div
        className="git-scroll overflow-x-auto px-1 pb-2 transition-[background-color] duration-150"
        style={{ background: taken ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined }}
      >
        {lines.length ? (
          lines.map((l, n) => <Code key={n} text={l} />)
        ) : (
          <div className="px-2 font-sans text-xs text-[var(--node-muted)] italic">(nothing)</div>
        )}
      </div>
    </div>
  );
}

function Pick({ on, onClick, children }: { on: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-6 rounded-[6px] px-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 touch:h-8 touch:px-2.5',
        on
          ? 'bg-[var(--node-bg)] text-[var(--node-accent)] shadow-[0_1px_2px_0_color-mix(in_srgb,black_25%,transparent)]'
          : 'text-[var(--node-muted)] hover:text-[var(--node-fg)]',
      )}
    >
      {children}
    </button>
  );
}
