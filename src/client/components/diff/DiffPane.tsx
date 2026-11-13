// A file's diff with its bar: what file (renamed from what, how similar),
// how many lines came and went, unified or side by side, whitespace, the
// file's history and blame (in this window). It asks the server for the
// diff when the file or its status changes, and drops the request when the
// selection moves on (git stops). Images show before and after; binary
// files, big diffs and submodules say what changed.

import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, FileClock, MoreHorizontal, Pilcrow, Rows3, ScanSearch } from 'lucide-react';
import { formatSize } from '@hyperpane/sdk/client';
import { NodeButton, NodeMessage, ToolButton, cn, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Diff } from '../../../shared/index.ts';
import type { DiffRequest } from '../../app/api.ts';
import { useRepo } from '../../app/repo.ts';
import { useDiffMode } from '../../hooks/useDiffMode.ts';
import type { LineChecks } from '../../hooks/useLineChecks.ts';
import { copy } from '../../lib/clipboard.ts';
import type { Expansion, Gap, LineKey } from '../../lib/diff/model.ts';
import { Blank } from '../Blank.tsx';
import { DiffTitle } from './DiffTitle.tsx';
import { DiffView, type LineActions } from './DiffView.tsx';
import { ImageDiff } from './ImageDiff.tsx';

export interface DiffPaneProps {
  request: DiffRequest;
  /** Changes when the file may have: its status, its mtime. */
  stamp?: string;
  /** The revision the diff's new side is (for unchanged lines to open):
   * undefined the working tree, ':0' the index, else a commit. */
  newRev?: string;
  /** Picked lines' actions, from the diff as it is. */
  actions?(diff: Diff): LineActions | undefined;
  /** Its lines checked for the next commit, from the diff as it is (none
   * while whitespace is ignored: lines would be missing). */
  checks?(diff: Diff): LineChecks | undefined;
  /** Buttons at the bar's end (stage, discard the file). */
  tools?: ReactNode;
  /** More in the ⋯ menu. */
  menu?: (MenuEntry | null)[];
  /** Above the diff (a conflict's choices). */
  banner?: ReactNode;
  empty?: ReactNode;
  onSelection?(keys: LineKey[]): void;
}

type State = { diff?: Diff; error?: string; for: string };

export function DiffPane({ request, stamp, newRev, actions, checks, tools, menu, banner, empty, onSelection }: DiffPaneProps) {
  const repo = useRepo();
  const { api, host } = repo;
  const [mode, setMode] = useDiffMode();
  const [ignoreWs, setIgnoreWs] = useState<boolean>(() => host.settings.get<boolean>('ignoreWhitespace') === true);
  const context = Math.max(0, Math.min(100, Number(host.settings.get('contextLines') ?? 3)));
  const [full, setFull] = useState(false);
  const key = JSON.stringify(request);
  const [state, setState] = useState<State>({ for: '' });
  const [expansions, setExpansions] = useState<Map<number, Expansion>>(new Map());
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setFull(false);
    setExpansions(new Map());
  }, [key]);

  // Fetch, a moment after the selection settles; dropped when it moves.
  const fetchKey = `${key}|${stamp ?? ''}|${ignoreWs}|${full}|${context}|${repo.version}`;
  useEffect(() => {
    let pending: { cancel(): void } | null = null;
    let live = true;
    const timer = setTimeout(() => {
      const p = api.diff({ ...request, context, ignoreWhitespace: ignoreWs || undefined, full: full || undefined });
      pending = p;
      p.promise.then(
        (diff) => live && setState({ diff, for: key }),
        (e: Error) => live && e.message !== 'Cancelled.' && setState({ error: e.message, for: key }),
      );
    }, 30);
    return () => {
      live = false;
      clearTimeout(timer);
      pending?.cancel();
    };
  }, [fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const diff = state.for === key ? state.diff : undefined;
  const error = state.for === key ? state.error : undefined;
  const lineActions = useMemo(() => (diff && actions ? actions(diff) : undefined), [diff, actions]);
  const lineChecks = useMemo(() => (diff && checks ? checks(diff) : undefined), [diff, checks]);

  // Unchanged lines between hunks: 20 at a time, or all of them.
  const expand = async (gap: Gap, how: 'up' | 'down' | 'all') => {
    if (!diff) return;
    const was = expansions.get(gap.h) ?? { above: [], below: [] };
    const hiddenFrom = gap.from + was.above.length;
    const hiddenTo = gap.to === null ? null : gap.to - was.below.length;
    let start: number;
    let count: number;
    if (how === 'all') {
      start = hiddenFrom;
      count = hiddenTo === null ? 100_000 : hiddenTo - hiddenFrom;
    } else if (how === 'down' || hiddenTo === null) {
      start = hiddenFrom;
      count = hiddenTo === null ? 20 : Math.min(20, hiddenTo - hiddenFrom);
    } else {
      count = Math.min(20, hiddenTo - hiddenFrom);
      start = hiddenTo - count;
    }
    if (count <= 0) return;
    const got = await repo.run(() => api.blob(diff.path, { rev: newRev, start, count }));
    const lines = got?.lines ?? [];
    setExpansions((all) => {
      const next = new Map(all);
      const e = { ...(next.get(gap.h) ?? { above: [], below: [] }) };
      if (how === 'up' && hiddenTo !== null) e.below = [...lines, ...e.below];
      else e.above = [...e.above, ...lines];
      if (gap.to === null && lines.length < count) e.done = true;
      next.set(gap.h, e);
      return next;
    });
  };

  const path = request.path;
  const shownMode = narrow ? 'unified' : mode;
  const moreMenu = (e: ReactMouseEvent) => {
    const items: (MenuEntry | null)[] = [
      ...(menu ?? []),
      ...(menu?.length ? [null] : []),
      { label: 'File History', run: () => repo.open({ kind: 'fileHistory', path }) },
      { label: 'Blame', run: () => repo.open({ kind: 'blame', path, rev: request.commit ?? request.to }) },
      null,
      { label: 'Copy Path', run: () => copy(path, repo.toast) },
      { label: 'Copy Full Path', run: () => copy(`${repo.root}/${path}`, repo.toast) },
      { label: 'Open in Editor', run: () => repo.openInEditor(path) },
      { label: 'Reveal in Explorer', run: () => repo.reveal(path) },
    ];
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  const onLineMenu = (e: ReactMouseEvent, line: { old?: number; new?: number; text: string } | null, picked: LineKey[]) => {
    const items: (MenuEntry | null)[] = [];
    if (picked.length && lineActions?.primary) items.push({ label: `${lineActions.primary.label} Picked Lines`, run: () => lineActions.primary!.run(picked) });
    if (picked.length && lineActions?.discard) items.push({ label: `${lineActions.discard.label} Picked Lines…`, danger: true, run: () => lineActions.discard!.run(picked) });
    if (items.length) items.push(null);
    if (line) {
      items.push({ label: 'Copy Line', run: () => copy(line.text.replace(/\r$/, ''), repo.toast) });
      if (line.new) items.push({ label: `Blame Line ${line.new}`, run: () => repo.open({ kind: 'blame', path, rev: request.commit ?? request.to, line: line.new }) });
      if (line.new && !request.commit && !request.staged) items.push({ label: `Open in Editor at Line ${line.new}`, run: () => repo.openInEditor(path, line.new) });
      items.push(null);
    }
    items.push({ label: 'File History', run: () => repo.open({ kind: 'fileHistory', path }) });
    host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  let body: ReactNode;
  if (error) body = <NodeMessage error>{error}</NodeMessage>;
  else if (!diff) body = <NodeMessage>Loading the diff…</NodeMessage>;
  else if (diff.image) body = <ImageDiff diff={diff} />;
  else if (diff.submodule)
    body = (
      <Blank title="Submodule changed">
        <span className="font-mono">{diff.submodule.before?.slice(0, 10) ?? 'nothing'}</span> → <span className="font-mono">{diff.submodule.after?.slice(0, 10) ?? 'nothing'}</span>
      </Blank>
    );
  else if (diff.tooLarge)
    body = (
      <Blank title="This diff is big" actions={<NodeButton onClick={() => setFull(true)}>Show It Anyway</NodeButton>}>
        Its changes come to {formatSize(diff.size)}
        {diff.additions + diff.deletions > 0 ? ` (${(diff.additions + diff.deletions).toLocaleString('en-US')} lines)` : ''}. Showing it may take a moment.
      </Blank>
    );
  else if (diff.binary) body = <Blank title="Binary file">{`It changed (${formatSize(diff.size)}); there are no lines to show.`}</Blank>;
  else if (!diff.hunks.length)
    body = (
      empty ?? (
        <Blank title={diff.oldPath ? 'Renamed, with no changes inside' : diff.oldMode && diff.newMode && diff.oldMode !== diff.newMode ? 'Only its mode changed' : 'No changes to show'}>
          {diff.oldPath ? `${diff.oldPath} → ${diff.path}${diff.similarity !== undefined ? ` (${diff.similarity}% similar)` : ''}` : diff.oldMode && diff.newMode && diff.oldMode !== diff.newMode ? `${diff.oldMode} → ${diff.newMode}` : ignoreWs ? 'Only whitespace changed, and whitespace is ignored.' : null}
        </Blank>
      )
    );
  else
    body = (
      <DiffView
        key={`${key}|${shownMode}`}
        diff={diff}
        mode={shownMode}
        actions={ignoreWs ? undefined : lineActions}
        checks={ignoreWs ? undefined : lineChecks}
        expansions={expansions}
        onExpand={expand}
        onLineMenu={onLineMenu}
        onSelection={onSelection}
      />
    );

  return (
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col" data-diff-pane={path}>
      <div className="flex h-8 flex-none items-center gap-1.5 border-b border-[var(--node-border)] px-2">
        <DiffTitle diff={diff} path={path} />
        {tools}
        <span className="mx-0.5 h-4 w-px flex-none bg-[var(--node-border)]" />
        <ToolButton
          label={shownMode === 'split' ? 'Unified diff' : narrow ? 'Side by side (the window is too narrow)' : 'Side by side'}
          icon={shownMode === 'split' ? Rows3 : Columns2}
          disabled={narrow}
          onClick={() => setMode(mode === 'split' ? 'unified' : 'split')}
        />
        <ToolButton label={ignoreWs ? 'Show whitespace changes' : 'Ignore whitespace changes'} icon={Pilcrow} active={ignoreWs} onClick={() => setIgnoreWs(!ignoreWs)} />
        <ToolButton label="File history" icon={FileClock} onClick={() => repo.open({ kind: 'fileHistory', path })} />
        <ToolButton label="Blame" icon={ScanSearch} onClick={() => repo.open({ kind: 'blame', path, rev: request.commit ?? request.to })} />
        <ToolButton label="More" icon={MoreHorizontal} onClick={moreMenu} />
      </div>
      {banner}
      <div className={cn('flex min-h-0 flex-1 flex-col')}>{body}</div>
    </div>
  );
}
