// A file's diff, drawn row by row as it scrolls into view: unified (one
// column, old and new line numbers) or side by side (old left, new right,
// scrolled together), with syntax colors, the words that changed inside a
// line, folded unchanged lines to open, and lines to pick for staging,
// unstaging or discarding (click the gutter; ⇧-click or drag for more; a
// hunk's header takes all of it), or, against HEAD, to check for the next
// commit the same way (hooks/useLineChecks.ts). The code itself is text to select with
// the mouse and copy (⌘C), a line per row.
//
// The rows' pieces are in rows.tsx, how they look in theme.ts; picking lines
// is hooks/useLinePicks.ts, their colors hooks/useDiffSpans.ts.

import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, memo, useMemo, useRef, useState } from 'react';
import { shortcutKey } from '@hyperpane/sdk/client';
import { MONO } from '@hyperpane/code';
import { cn } from '@hyperpane/ui';
import type { Diff, Line } from '../../../shared/index.ts';
import { useDiffSpans } from '../../hooks/useDiffSpans.ts';
import { type LineChecks, useLineChecks } from '../../hooks/useLineChecks.ts';
import { useLinePicks } from '../../hooks/useLinePicks.ts';
import type { Span } from '../../lib/diff/highlight.ts';
import { type Expansion, type Gap, type LineKey, type Model, keyOf, model, shown } from '../../lib/diff/model.ts';
import { selectedCode } from '../../lib/diff/selection.ts';
import { type VirtualHandle, VirtualList } from '../VirtualList.tsx';
import { PickedBar } from './PickedBar.tsx';
import { CodeCell, GapRow, Gutter, HunkRow } from './rows.tsx';
import { ADDED, CHAR, EMPTY_SIDE, REMOVED, ROW, SELECTED } from './theme.ts';

/** What can be done with picked lines, by the side the diff shows. */
export interface LineActions {
  /** “Stage”, “Unstage”. */
  primary?: { label: string; run(keys: LineKey[]): Promise<unknown> };
  /** “Discard”. */
  discard?: { label: string; run(keys: LineKey[]): Promise<unknown> };
}

export interface DiffViewProps {
  diff: Diff;
  mode: 'unified' | 'split';
  actions?: LineActions;
  expansions?: Map<number, Expansion>;
  /** Unchanged lines to fetch for a gap. */
  onExpand?(gap: Gap, how: 'up' | 'down' | 'all'): void;
  /** A line's menu (blame here, open here, copy). */
  onLineMenu?(e: ReactMouseEvent, line: { old?: number; new?: number; text: string } | null, selected: LineKey[]): void;
  /** Says the picked lines, for the window's keys. */
  onSelection?(keys: LineKey[]): void;
  /** Lines checked for the next commit: the gutter checks them instead of
   * picking them. */
  checks?: LineChecks;
  className?: string;
}

export const DiffView = memo(function DiffView({ diff, mode, actions, expansions, onExpand, onLineMenu, onSelection, checks, className }: DiffViewProps) {
  const m = useMemo(() => model(diff, expansions), [diff, expansions]);
  const { spans, ctxSpans } = useDiffSpans(diff, m, expansions);
  const canPick = !checks && !!(actions?.primary || actions?.discard);
  const picks = useLinePicks(diff, canPick, onSelection);
  const { selected, setSelected, hunkKeys, pickHunk } = picks;
  const checking = useLineChecks(diff, checks);
  const { press, dragTo } = checks ? checking : picks;
  /** Left out of the next commit: drawn faint. */
  const isOut = (key: LineKey | null) => !!checks && !!key && !checks.isIn(key);
  const [busy, setBusy] = useState(false);

  const run = async (action: { run(keys: LineKey[]): Promise<unknown> } | undefined, keys: LineKey[]) => {
    if (!action || !keys.length || busy) return;
    setBusy(true);
    try {
      await action.run(keys);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const list = useRef<VirtualHandle>(null);
  const right = useRef<VirtualHandle>(null);
  const rows = mode === 'split' ? m.split : m.unified;

  // n / p: the next and previous change.
  const jump = (dir: 1 | -1) => {
    const [first] = list.current?.visible() ?? [0];
    const isChange = (k: number) => {
      const r = rows[k];
      if (r.t === 'hunk') return true;
      return false;
    };
    for (let k = first + dir; k >= 0 && k < rows.length; k += dir) {
      if (isChange(k)) {
        list.current?.scrollToIndex(k, 'start');
        right.current?.scrollToIndex(k, 'start');
        return;
      }
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = shortcutKey(e);
    if (e.key === 'Escape' && selected.size) setSelected(new Set());
    else if (k === 'n' && !e.metaKey && !e.ctrlKey) jump(1);
    else if (k === 'p' && !e.metaKey && !e.ctrlKey) jump(-1);
    else if (k === 'a' && (e.metaKey || e.ctrlKey) && canPick) setSelected(new Set(diff.hunks.flatMap((_, h) => hunkKeys(h))));
    else if (e.key === ' ' && selected.size && actions?.primary) run(actions.primary, [...selected]);
    else if ((e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) && selected.size && actions?.discard) run(actions.discard, [...selected]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const digits = Math.max(2, String(m.maxLine).length);
  const gutter = Math.ceil(digits * CHAR + 10);
  const codeWidth = Math.ceil(Math.min(m.longest, 4001) * CHAR + 24);

  const lineOf = (h: number, i: number): Line => diff.hunks[h].lines[i];
  const menuFor = (e: ReactMouseEvent, line: { old?: number; new?: number; text: string } | null) => {
    if (!onLineMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onLineMenu(e, line, [...selected]);
  };

  const hunkRow = (h: number, withActions: boolean) => {
    const keys = hunkKeys(h);
    const has = (k: LineKey) => (checks ? checks.isIn(k) : selected.has(k));
    const all = keys.length > 0 && keys.every(has);
    return (
      <HunkRow
        hunk={diff.hunks[h]}
        keys={keys}
        all={all}
        some={!all && keys.some(has)}
        canPick={canPick || !!checks}
        checking={!!checks}
        withActions={withActions}
        actions={actions}
        busy={busy}
        onPick={() => (checks ? checks.set(keys, !all) : pickHunk(h))}
        onRun={run}
      />
    );
  };

  const gapRow = (gap: Gap, hidden: number | null, withActions: boolean) => <GapRow gap={gap} hidden={hidden} withActions={withActions} onExpand={onExpand} />;

  const numbers = (old: number | undefined, now: number | undefined, kind: Line['kind'] | 'ctx', key: LineKey | null, isSelected: boolean, both = true) => (
    <Gutter old={old} now={now} kind={kind} lineKey={key} selected={isSelected} out={isOut(key)} checking={!!checks} both={both} width={gutter} canPick={canPick || !!checks} onPress={press} onEnter={dragTo} />
  );

  const code = (text: string, s: Span[] | undefined, words: ReturnType<Model['words']>, kind: Line['kind'] | 'ctx', noNewline?: boolean) => (
    <CodeCell text={text} spans={s} words={words} kind={kind} noNewline={noNewline} />
  );

  const unifiedRow = (k: number): ReactNode => {
    const r = m.unified[k];
    if (r.t === 'hunk') return hunkRow(r.h, true);
    if (r.t === 'gap') return gapRow(r.gap, r.hidden, true);
    if (r.t === 'ctx')
      return (
        <div className="flex h-full" onContextMenu={(e) => menuFor(e, { old: r.old, new: r.new, text: r.text })}>
          {numbers(r.old, r.new, 'ctx', null, false)}
          {code(shown(r.text), ctxSpans.get(r.new), null, 'ctx')}
        </div>
      );
    const line = lineOf(r.h, r.i);
    const key = line.kind === ' ' ? null : keyOf(r.h, r.i);
    const isSel = !!key && selected.has(key);
    const bg = line.kind === '+' ? ADDED : line.kind === '-' ? REMOVED : undefined;
    return (
      <div
        className="flex h-full"
        style={{ background: isSel ? `linear-gradient(${SELECTED}, ${SELECTED}), ${bg}` : isOut(key) ? undefined : bg }}
        onContextMenu={(e) => menuFor(e, { old: line.old, new: line.new, text: line.text })}
      >
        {numbers(line.old, line.new, line.kind, key, isSel)}
        {code(shown(line), spans?.get(keyOf(r.h, r.i)), key ? m.words(r.h, r.i) : null, line.kind, line.noNewline)}
      </div>
    );
  };

  const half = (side: 'left' | 'right') => (k: number): ReactNode => {
    const r = m.split[k];
    if (r.t === 'hunk') return hunkRow(r.h, side === 'left');
    if (r.t === 'gap') return gapRow(r.gap, r.hidden, side === 'left');
    if (r.t === 'ctx')
      return (
        <div className="flex h-full" onContextMenu={(e) => menuFor(e, { old: r.old, new: r.new, text: r.text })}>
          {numbers(side === 'left' ? r.old : r.new, undefined, 'ctx', null, false, false)}
          {code(shown(r.text), ctxSpans.get(r.new), null, 'ctx')}
        </div>
      );
    const i = side === 'left' ? r.left : r.right;
    if (i === null) return <div className="h-full" style={{ background: EMPTY_SIDE }} />;
    const line = lineOf(r.h, i);
    const key = line.kind === ' ' ? null : keyOf(r.h, i);
    const isSel = !!key && selected.has(key);
    const bg = line.kind === '+' ? ADDED : line.kind === '-' ? REMOVED : undefined;
    return (
      <div
        className="flex h-full"
        style={{ background: isSel ? `linear-gradient(${SELECTED}, ${SELECTED}), ${bg}` : isOut(key) ? undefined : bg }}
        onContextMenu={(e) => menuFor(e, { old: line.old, new: line.new, text: line.text })}
      >
        {numbers(side === 'left' ? line.old : line.new, undefined, line.kind, key, isSel, false)}
        {code(shown(line), spans?.get(keyOf(r.h, i)), key ? m.words(r.h, i) : null, line.kind, line.noNewline)}
      </div>
    );
  };

  // Side by side: both halves scroll together.
  const syncing = useRef(false);
  const follow = (from: 'left' | 'right') => (top: number) => {
    if (syncing.current) return;
    const other = (from === 'left' ? right : list).current?.element;
    if (other && Math.abs(other.scrollTop - top) > 0.5) {
      syncing.current = true;
      other.scrollTop = top;
      requestAnimationFrame(() => (syncing.current = false));
    }
  };

  // ⌘C: the code selected, without the gutter, a line per row.
  const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = selectedCode(e.currentTarget, e.currentTarget.ownerDocument.getSelection());
    if (text === null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  };

  const font: CSSProperties = { fontFamily: MONO, fontSize: 12, lineHeight: `${ROW}px` };
  const n = selected.size;

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)} tabIndex={-1} onKeyDown={onKey} onCopy={onCopy} data-diff={diff.path}>
      {mode === 'unified' ? (
        <VirtualList
          ref={list}
          count={m.unified.length}
          rowHeight={ROW}
          row={unifiedRow}
          width={gutter * 2 + 16 + codeWidth}
          style={font}
          className="git-scroll"
          tabIndex={0}
          ariaLabel={`Changes in ${diff.path}`}
          onContextMenu={(e) => menuFor(e, null)}
        />
      ) : (
        <div className="flex min-h-0 flex-1" style={font}>
          <VirtualList
            ref={list}
            count={m.split.length}
            rowHeight={ROW}
            row={half('left')}
            width={gutter + 16 + codeWidth}
            className="git-scroll w-1/2 flex-none border-e border-[var(--node-border)]"
            onScroll={follow('left')}
            tabIndex={0}
            ariaLabel={`Before, in ${diff.path}`}
          />
          <VirtualList
            ref={right}
            count={m.split.length}
            rowHeight={ROW}
            row={half('right')}
            width={gutter + 16 + codeWidth}
            className="git-scroll w-1/2 flex-none"
            onScroll={follow('right')}
            tabIndex={0}
            ariaLabel={`After, in ${diff.path}`}
          />
        </div>
      )}
      {n > 0 && (actions?.primary || actions?.discard) && (
        <PickedBar n={n} actions={actions} busy={busy} onRun={(action) => run(action, [...selected])} onClear={() => setSelected(new Set())} />
      )}
      {diff.truncated && (
        <div className="flex h-7 flex-none items-center gap-2 border-t border-[var(--node-border)] px-3 text-2xs text-[var(--node-muted)]">
          The diff was cut here: it’s longer than this window shows.
        </div>
      )}
    </div>
  );
});
