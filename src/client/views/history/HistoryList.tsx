// The History tab: commits with the branch graph, a page at a time as you
// scroll (git stops once a page is full), searched by message, author, SHA,
// path or what the changes added or removed (-S / -G). A commit's menu
// checks it out, branches or tags it, picks, reverts or resets to it.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, ChevronDown, GitBranch, Search, X } from 'lucide-react';
import { keys, mod } from '@hyperpane/sdk/client';
import { NodeInput, ToolButton, cn, menuItems, type MenuEntry } from '@hyperpane/ui';
import { commitMenu } from '../../app/actions/commits.ts';
import type { LogRequest } from '../../app/api.ts';
import { useRepo } from '../../app/repo.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { Blank } from '../../components/Blank.tsx';
import { GraphCell } from '../../components/GraphCell.tsx';
import { RefBadge } from '../../components/RefBadge.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { useLog } from '../../hooks/useLog.ts';
import { copy } from '../../lib/clipboard.ts';
import { longDate, shortAgo } from '../../lib/format.ts';
import { LANE_WIDTH, MAX_LANES } from '../../lib/graph.ts';
import { listKey } from '../../lib/listKey.ts';
import { MODES, type SearchMode } from '../../lib/logSearch.ts';

const ROW = 26;

export function HistoryList({
  selected,
  onSelect,
  filterRef,
}: {
  selected: string | null;
  onSelect: React.Dispatch<React.SetStateAction<string | null>>;
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const repo = useRepo();
  const { status } = repo;
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('message');
  const [all, setAll] = useState(false);
  const list = useRef<VirtualHandle>(null);

  // Typing settles before git is asked.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const request = useMemo((): Omit<LogRequest, 'skip' | 'limit'> => {
    const q = query;
    const base = { all: all || undefined };
    if (!q) return base;
    if (mode === 'message') return { ...base, search: q };
    if (mode === 'author') return { ...base, author: q };
    if (mode === 'sha') return { ...base, sha: q };
    if (mode === 'path') return { ...base, path: q };
    if (mode === 'added') return { ...base, pickaxe: { text: q } };
    return { ...base, pickaxe: { text: q, regex: true } };
  }, [query, mode, all]);
  const searching = !!query;
  // A new search starts at the top.
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    list.current?.scrollToIndex(0, 'start');
  }, [requestKey]);
  const log = useLog(repo, request, !searching || mode === 'path');
  const { commits, graph } = log;
  const at = commits.findIndex((c) => c.sha === selected);

  // The first commit when nothing (that's there) is picked.
  useEffect(() => {
    if (commits.length) onSelect((cur) => (cur && commits.some((c) => c.sha === cur) ? cur : commits[0].sha));
  }, [commits]); // eslint-disable-line react-hooks/exhaustive-deps

  const graphWidth = (Math.min(graph.width, MAX_LANES) + 0.5) * LANE_WIDTH;
  const showGraph = !searching || mode === 'path';

  const onKey = (e: KeyboardEvent) => {
    const next = listKey(e, at, commits.length, 15);
    if (next !== null) {
      onSelect(commits[next].sha);
      list.current?.scrollToIndex(next);
    } else if (e.key === 'Enter') {
      (document.querySelector('[data-commit-files] [tabindex="0"]') as HTMLElement | null)?.focus();
    } else if (e.key === 'c' && mod(e) && selected) {
      copy(selected, repo.toast);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const modeMenu = (e: ReactMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: (MenuEntry | null)[] = [
      ...MODES.map((m) => ({ label: `${m.id === mode ? '✓ ' : ''}${m.label}`, run: () => setMode(m.id) })),
      null,
      { label: `${all ? '✓ ' : ''}Every Branch and Tag`, run: () => setAll(!all) },
    ];
    repo.host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      item?.run();
    });
  };

  const row = (n: number) => {
    const c = commits[n];
    const g = graph.rows[n];
    const isSel = c.sha === selected;
    const isHead = c.sha === status.head;
    return (
      <div className="h-full px-1" data-sha={c.sha}>
        <div
          className={cn(
            'rounded-chip flex h-full cursor-default items-center gap-1.5 pe-1.5',
            isSel ? 'bg-[var(--node-selection-inactive)] group-focus-within/list:bg-[var(--node-selection)]' : 'hover:bg-[var(--node-hover)]',
          )}
          onClick={() => onSelect(c.sha)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(c.sha);
            commitMenu(repo, c, e);
          }}
          title={`${c.subject}\n${c.author} · ${longDate(c.date)}\n${c.sha}`}
        >
          {showGraph && g ? <GraphCell row={g} head={isHead} height={ROW} width={graphWidth} /> : <span className="w-1" />}
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {c.refs.slice(0, 2).map((r) => (
              <RefBadge key={`${r.kind}:${r.name}`} refName={r} className="max-w-28 min-w-6 shrink" />
            ))}
            {c.refs.length > 2 && (
              <span className="flex-none text-[10px] text-[var(--node-muted)]" title={c.refs.slice(2).map((r) => r.name).join('\n')}>
                +{c.refs.length - 2}
              </span>
            )}
            <span className={cn('min-w-12 flex-1 truncate', isHead && 'font-semibold')}>{c.subject}</span>
          </span>
          {c.unpushed && <ArrowUpFromLine className="size-3 flex-none text-[var(--node-muted)]" aria-label="Not pushed" />}
          <Avatar name={c.author} email={c.email} size={16} />
          <span className="w-7 flex-none text-right text-2xs whitespace-nowrap text-[var(--node-muted)] tabular-nums" title={longDate(c.date)}>
            {shortAgo(c.date)}
          </span>
        </div>
      </div>
    );
  };

  const current = MODES.find((m) => m.id === mode)!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] px-1.5">
        <button
          type="button"
          className="rounded-control flex h-6 flex-none items-center gap-0.5 px-1.5 text-2xs text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
          title="What to search, and which branches"
          onClick={modeMenu}
        >
          {all ? <GitBranch className="size-3" /> : null}
          {current.label.split(' ')[0]}
          <ChevronDown className="size-3" />
        </button>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput
            ref={filterRef}
            className="w-full ps-6 pe-6"
            placeholder={`${current.hint} (${keys('⌘F')})`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText('');
                list.current?.element?.focus();
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                list.current?.element?.focus();
                e.preventDefault();
              }
            }}
          />
          {text && (
            <button type="button" aria-label="Clear" className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-[var(--node-muted)] hover:text-[var(--node-fg)]" onClick={() => setText('')}>
              <X className="size-3" />
            </button>
          )}
        </div>
        <ToolButton label={all ? 'This branch only' : 'Every branch and tag'} icon={GitBranch} active={all} onClick={() => setAll(!all)} />
      </div>
      {log.error ? (
        <Blank>
          <span className="text-[var(--ansi-1)]">{log.error}</span>
        </Blank>
      ) : !commits.length ? (
        <Blank>{log.loading ? 'Loading the history…' : searching ? 'No commit matches.' : status.unborn ? 'No commits yet: make the first one in Changes.' : 'No commits.'}</Blank>
      ) : (
        <VirtualList
          ref={list}
          count={commits.length}
          rowHeight={ROW}
          row={row}
          rowKey={(n) => commits[n].sha}
          onEnd={log.loadMore}
          className="group/list git-scroll py-1"
          tabIndex={0}
          role="listbox"
          ariaLabel="Commits"
          onKeyDown={onKey}
        />
      )}
      {commits.length > 0 && (
        <div className="flex h-6 flex-none items-center gap-2 border-t border-[var(--node-border)] px-2 text-2xs text-[var(--node-muted)] tabular-nums">
          {commits.length.toLocaleString('en-US')}
          {log.more ? '+' : ''} commits
          {log.loading && <span>· loading…</span>}
        </div>
      )}
    </div>
  );
}
