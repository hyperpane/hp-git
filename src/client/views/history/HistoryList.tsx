// The History tab: commits with the branch graph, a page at a time as you
// scroll (git stops once a page is full), searched by message, author, SHA,
// path or what the changes added or removed (-S / -G). A commit's menu
// checks it out, branches or tags it, picks, reverts or resets to it.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, ChevronDown, GitBranch, History, Search, TriangleAlert } from '@hyperpane/icons';
import { keys, mod } from '@hyperpane/sdk/client';
import { ToolButton, cn, menuItems, type MenuEntry, styles } from '@hyperpane/ui';
import { commitMenu } from '../../app/actions/commits.ts';
import type { LogRequest } from '../../app/api.ts';
import { useRepo } from '../../app/repo.ts';
import { Authors } from '../../components/Avatar.tsx';
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
import { authorNames } from '../../lib/people.ts';
import { ROW_H, ROW_INSET, rowClass, useRowHeight } from '../../lib/rows.ts';
import { footer, header } from '../../ui/classes.ts';
import { SearchField } from '../../ui/parts.tsx';

const ROW = ROW_H;

export function HistoryList({
  selected,
  onSelect,
  onOpen,
  filterRef,
}: {
  selected: string | null;
  onSelect: React.Dispatch<React.SetStateAction<string | null>>;
  /** A commit clicked: it, when one at a time. */
  onOpen?(): void;
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const repo = useRepo();
  const { status } = repo;
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('message');
  const [all, setAll] = useState(false);
  const list = useRef<VirtualHandle>(null);
  const rowHeight = useRowHeight(ROW);

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
      <div className={ROW_INSET} data-sha={c.sha}>
        <div
          className={cn(rowClass(isSel), 'ps-1.5')}
          onClick={() => {
            onSelect(c.sha);
            onOpen?.();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(c.sha);
            commitMenu(repo, c, e);
          }}
          title={`${c.subject}\n${authorNames(c)} · ${longDate(c.date)}\n${c.sha}`}
        >
          {showGraph && g ? <GraphCell row={g} head={isHead} height={rowHeight} width={graphWidth} /> : <span className="w-1" />}
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {c.refs.slice(0, 2).map((r) => (
              <RefBadge key={`${r.kind}:${r.name}`} refName={r} className="max-w-28 min-w-6 shrink" />
            ))}
            {c.refs.length > 2 && (
              <span
                className="flex-none text-[11px] text-[var(--node-muted)]"
                title={c.refs
                  .slice(2)
                  .map((r) => r.name)
                  .join('\n')}
              >
                +{c.refs.length - 2}
              </span>
            )}
            <span className={cn('ms-0.5 min-w-12 flex-1 truncate', isHead && 'font-medium')}>{c.subject}</span>
          </span>
          {c.unpushed && <ArrowUpFromLine variant="outline" className="size-3.5 flex-none text-[var(--node-muted)]" aria-label="Not pushed" />}
          <Authors commit={c} size={18} />
          <span className="w-8 flex-none text-right text-xs whitespace-nowrap text-[var(--node-muted)] tabular-nums" title={longDate(c.date)}>
            {shortAgo(c.date)}
          </span>
        </div>
      </div>
    );
  };

  const current = MODES.find((m) => m.id === mode)!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(header.base, 'gap-1')}>
        <button
          type="button"
          className={cn(
            'flex h-7 flex-none items-center gap-1 rounded-control ps-2 pe-1.5 text-[13px] text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:h-9',
            styles.focusRing,
          )}
          title="What to search, and which branches"
          onClick={modeMenu}
        >
          {all ? <GitBranch className="size-3.5" /> : null}
          {current.label.split(' ')[0]}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
        <SearchField
          inputRef={filterRef}
          placeholder={current.hint}
          aria-label="Search the history"
          title={`${current.hint} (${keys('⌘F')})`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClear={() => setText('')}
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
        <ToolButton label={all ? 'This branch only' : 'Every branch and tag'} icon={GitBranch} active={all} onClick={() => setAll(!all)} />
      </div>
      {log.error ? (
        <Blank icon={TriangleAlert} error title="The history can’t be read">
          {log.error}
        </Blank>
      ) : !commits.length ? (
        log.loading ? (
          <Blank>Loading the history</Blank>
        ) : searching ? (
          <Blank icon={Search} title="No matches">
            No commit matches “{query}”.
          </Blank>
        ) : (
          <Blank icon={History} title="No commits">
            {status.unborn ? 'Make the first one in Changes.' : null}
          </Blank>
        )
      ) : (
        <VirtualList
          ref={list}
          count={commits.length}
          rowHeight={rowHeight}
          row={row}
          rowKey={(n) => commits[n].sha}
          onEnd={log.loadMore}
          className="group/list git-scroll py-1.5"
          tabIndex={0}
          role="listbox"
          ariaLabel="Commits"
          onKeyDown={onKey}
        />
      )}
      {commits.length > 0 && (
        <div className={footer}>
          {commits.length.toLocaleString('en-US')}
          {log.more ? '+' : ''} commits
          {log.loading && <span>· loading</span>}
        </div>
      )}
    </div>
  );
}
