// One conflict: ours beside theirs (and the base between them, when the
// markers have it), to take one side, both, or leave for later.

import { Check } from 'lucide-react';
import { MONO } from '@hyperpane/code';
import { cn } from '@hyperpane/ui';
import type { Block, Choice } from '../../lib/conflicts.ts';
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
    <div className="rounded-surface my-2 overflow-hidden border border-[color-mix(in_srgb,var(--ansi-9)_40%,var(--node-border))] font-sans" data-block={number}>
      <div className="flex h-7 items-center gap-1 border-b border-[var(--node-border)] px-2 text-2xs" style={{ background: 'color-mix(in srgb, var(--ansi-9) 7%, transparent)' }}>
        <span className="font-semibold">Conflict {number}</span>
        <span className="text-[var(--node-muted)]">line {b.at}</span>
        <span className="flex-1" />
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
      </div>
      <div className={cn('grid', b.base ? 'grid-cols-3' : 'grid-cols-2')} style={{ fontFamily: MONO }}>
        <Side title={`Ours · ${b.oursLabel || ours}`} lines={b.ours} color="var(--ansi-4)" taken={choice === 'ours' || choice === 'both' || choice === 'bothTheirsFirst'} dropped={choice === 'theirs'} />
        {b.base && <Side title="Base" lines={b.base} color="var(--node-muted)" taken={false} dropped={!!choice} />}
        <Side title={`Theirs · ${b.theirsLabel || theirs}`} lines={b.theirs} color="var(--ansi-5)" taken={choice === 'theirs' || choice === 'both' || choice === 'bothTheirsFirst'} dropped={choice === 'ours'} />
      </div>
    </div>
  );
}

function Side({ title, lines, color, taken, dropped }: { title: string; lines: string[]; color: string; taken: boolean; dropped: boolean }) {
  return (
    <div className={cn('min-w-0 border-e border-[var(--node-border)] last:border-e-0', dropped && 'opacity-45')}>
      <div className="flex h-5 items-center gap-1 px-2 font-sans text-[10px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        <span className="truncate">{title}</span>
        {taken && <Check className="size-3 flex-none" />}
      </div>
      <div className="git-scroll overflow-x-auto py-0.5" style={{ background: taken ? `color-mix(in srgb, ${color} 9%, transparent)` : undefined }}>
        {lines.length ? lines.map((l, n) => <Code key={n} text={l} />) : <div className="px-2 font-sans text-2xs text-[var(--node-muted)] italic">(nothing)</div>}
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
        'rounded-chip h-5 px-1.5 text-2xs font-medium transition-colors duration-100',
        on ? 'bg-[var(--node-accent)] text-[var(--node-bg)]' : 'text-[var(--node-fg)] hover:bg-[var(--node-hover)]',
      )}
    >
      {children}
    </button>
  );
}
