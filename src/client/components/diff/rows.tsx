// The pieces of a diff's rows: a hunk's header (pick all of it, stage,
// unstage or discard it), the unchanged lines folded between hunks (to
// open), a line's numbers (press them to pick the line, or to check it for
// the next commit; drag for more) and its code (select it with the mouse
// and copy it).

import { ArrowDownToLine, ArrowUpToLine, Ellipsis, UnfoldVertical } from 'lucide-react';
import { cn } from '@hyperpane/ui';
import type { Hunk, Line } from '../../../shared/index.ts';
import type { Span } from '../../lib/diff/highlight.ts';
import type { Gap, LineKey, Model } from '../../lib/diff/model.ts';
import { paint } from '../../lib/diff/paint.tsx';
import { plural } from '../../lib/format.ts';
import { GapButton, HunkButton } from './buttons.tsx';
import type { LineActions } from './DiffView.tsx';
import { ADDED_GUTTER, HUNK, REMOVED_GUTTER, SELECTED } from './theme.ts';

/** A hunk's header: where it is, its section, a box that picks all of its
 * changed lines, and its actions. */
export function HunkRow({
  hunk,
  keys,
  all,
  some,
  canPick,
  checking,
  withActions,
  actions,
  busy,
  onPick,
  onRun,
}: {
  hunk: Hunk;
  keys: LineKey[];
  all: boolean;
  /** Some of its lines, not all. */
  some?: boolean;
  canPick: boolean;
  /** Its box checks it for the next commit rather than picking it. */
  checking?: boolean;
  withActions: boolean;
  actions?: LineActions;
  busy: boolean;
  onPick(): void;
  onRun(action: LineActions['primary'], keys: LineKey[]): void;
}) {
  return (
    <div className="flex h-full items-center font-sans text-2xs text-[var(--node-muted)]" style={{ background: HUNK }}>
      <div className="sticky left-0 flex h-full max-w-full min-w-0 items-center gap-2 px-2">
        {canPick && withActions && (
          <button
            type="button"
            tabIndex={-1}
            title={checking ? (all ? 'Leave this hunk out of the commit' : 'Commit all of this hunk') : all ? 'Unpick this hunk' : 'Pick every changed line of this hunk'}
            aria-label={checking ? (all ? 'Leave this hunk out' : 'Commit this hunk') : undefined}
            className={cn('h-4 rounded-chip px-1 font-mono text-[10px] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]', (all || some) && 'text-[var(--node-accent)]')}
            onClick={onPick}
          >
            {all ? '■' : some ? '▣' : '□'}
          </button>
        )}
        <span className="truncate font-mono">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          {hunk.section ? <span className="ms-2 text-[var(--node-fg)] opacity-80">{hunk.section}</span> : null}
        </span>
        {withActions && actions?.primary && (
          <HunkButton disabled={busy || !keys.length} onClick={() => onRun(actions.primary, keys)}>
            {actions.primary.label} hunk
          </HunkButton>
        )}
        {withActions && actions?.discard && (
          <HunkButton danger disabled={busy || !keys.length} onClick={() => onRun(actions.discard, keys)}>
            {actions.discard.label} hunk
          </HunkButton>
        )}
      </div>
    </div>
  );
}

/** Unchanged lines folded above a hunk (or below the last one). */
export function GapRow({ gap, hidden, withActions, onExpand }: { gap: Gap; hidden: number | null; withActions: boolean; onExpand?(gap: Gap, how: 'up' | 'down' | 'all'): void }) {
  return (
    <div className="flex h-full items-center font-sans text-2xs text-[var(--node-muted)]" style={{ background: 'color-mix(in srgb, var(--node-fg) 3%, transparent)' }}>
      <div className="sticky left-0 flex h-full items-center gap-1 px-2">
        <Ellipsis className="size-3.5" />
        <span className="me-1">{hidden === null ? 'More of the file below' : `${plural(hidden, 'unchanged line')}`}</span>
        {withActions && onExpand && (
          <>
            {gap.h > 0 && (
              <GapButton title="Show 20 more lines below the hunk above" icon={ArrowDownToLine} onClick={() => onExpand(gap, 'down')} />
            )}
            {gap.to !== null && <GapButton title="Show 20 more lines above the hunk below" icon={ArrowUpToLine} onClick={() => onExpand(gap, 'up')} />}
            <GapButton title={hidden === null ? 'Show the rest of the file' : 'Show them all'} icon={UnfoldVertical} onClick={() => onExpand(gap, 'all')} />
          </>
        )}
      </div>
    </div>
  );
}

/** A line's numbers (old and new, or one side's) and its + or −. */
export function Gutter({
  old,
  now,
  kind,
  lineKey,
  selected,
  out,
  checking,
  both = true,
  width,
  canPick,
  onPress,
  onEnter,
}: {
  old: number | undefined;
  now: number | undefined;
  kind: Line['kind'] | 'ctx';
  lineKey: LineKey | null;
  selected: boolean;
  /** Left out of the next commit. */
  out?: boolean;
  /** The press checks the line for the next commit rather than picking it. */
  checking?: boolean;
  both?: boolean;
  width: number;
  canPick: boolean;
  onPress(key: LineKey, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void;
  onEnter(key: LineKey): void;
}) {
  const bg = selected ? SELECTED : out ? 'var(--node-bg)' : kind === '+' ? ADDED_GUTTER : kind === '-' ? REMOVED_GUTTER : 'var(--node-bg)';
  return (
    <div
      className={cn('sticky left-0 z-[1] flex h-full flex-none select-none', lineKey && canPick && 'cursor-pointer')}
      style={{ background: `linear-gradient(${bg}, ${bg}), var(--node-bg)` }}
      onPointerDown={(e) => {
        if (!lineKey || e.button !== 0) return;
        e.preventDefault();
        onPress(lineKey, e);
      }}
      onPointerEnter={() => lineKey && onEnter(lineKey)}
      title={lineKey && canPick ? (checking ? `${out ? 'Commit' : 'Leave out'} this line (⇧ for a range, drag for several)` : 'Pick this line (⇧ for a range, drag for several)') : undefined}
      data-out={checking && lineKey ? String(!!out) : undefined}
    >
      <span className="pe-1.5 text-right text-[var(--node-muted)] tabular-nums" style={{ width }}>
        {old ?? ''}
      </span>
      {both && (
        <span className="pe-1.5 text-right text-[var(--node-muted)] tabular-nums" style={{ width }}>
          {now ?? ''}
        </span>
      )}
      <span className="w-4 text-center" style={{ color: out ? 'var(--node-muted)' : kind === '+' ? 'var(--ansi-2)' : kind === '-' ? 'var(--ansi-1)' : undefined }}>
        {selected ? '●' : kind === '+' || kind === '-' ? kind : ''}
      </span>
    </div>
  );
}

/** A line's code: its syntax colors and the words that changed. Its text
 * can be selected and copied (the window's text can't, but this is what
 * people want out of a diff); the gutter beside it picks lines. */
export function CodeCell({ text, spans, words, kind, noNewline }: { text: string; spans: Span[] | undefined; words: ReturnType<Model['words']>; kind: Line['kind'] | 'ctx'; noNewline?: boolean }) {
  return (
    <div className="flex-none cursor-text ps-1 pe-6 whitespace-pre select-text">
      <span data-code>
        {paint(text, spans, words, kind === '+' ? 'git-word-added' : 'git-word-removed')}
      </span>
      {noNewline && <span className="ms-2 text-[10px] text-[var(--node-muted)] italic select-none" title="No newline at end of file">⏎̸</span>}
    </div>
  );
}
