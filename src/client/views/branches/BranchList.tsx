// The Branches tab's list: local branches (the current one first, then
// recent ones, then the rest) with their upstream and how far ahead or
// behind, then the remote branches.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, GitBranch, Plus, Search } from 'lucide-react';
import { keys } from '@hyperpane/sdk/client';
import { NodeInput, NodeMessage, ToolButton, cn, menuItems } from '@hyperpane/ui';
import type { Branches, LocalBranch, RemoteBranch } from '../../../shared/index.ts';
import { type BranchPick, branchActions, createBranch } from '../../app/actions/branches.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { AheadBehind } from '../../components/Count.tsx';
import { SectionHeader } from '../../components/SectionHeader.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { ago, longDate } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { rowClass } from '../../lib/rows.ts';

type Row = { t: 'section'; label: string; count: number } | { t: 'local'; b: LocalBranch; recent: boolean } | { t: 'remote'; b: RemoteBranch };

export function BranchList({
  branches,
  error,
  picked,
  onPick,
  filterRef,
}: {
  branches: Branches | null;
  error: string | null;
  picked: BranchPick | null;
  onPick: React.Dispatch<React.SetStateAction<BranchPick | null>>;
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const repo = useRepo();
  const [filter, setFilter] = useState('');
  const list = useRef<VirtualHandle>(null);

  const rows = useMemo((): Row[] => {
    if (!branches) return [];
    const q = filter.trim().toLowerCase();
    const match = (n: string) => !q || n.toLowerCase().includes(q);
    const recent = new Set(branches.recent.slice(0, 5));
    const local = branches.local.filter((b) => match(b.name));
    const order = (b: LocalBranch) => (b.current ? 0 : recent.has(b.name) ? 1 : 2);
    local.sort((a, b) => order(a) - order(b) || (order(a) === 1 ? branches.recent.indexOf(a.name) - branches.recent.indexOf(b.name) : a.name.localeCompare(b.name)));
    const remote = branches.remote.filter((b) => match(b.name));
    const out: Row[] = [];
    if (local.length) {
      out.push({ t: 'section', label: 'Local', count: local.length });
      for (const b of local) out.push({ t: 'local', b, recent: recent.has(b.name) && !b.current });
    }
    if (remote.length) {
      out.push({ t: 'section', label: 'Remote', count: remote.length });
      for (const b of remote) out.push({ t: 'remote', b });
    }
    return out;
  }, [branches, filter]);

  const keyOf = (r: Row) => (r.t === 'section' ? `s:${r.label}` : `${r.t}:${r.b.name}`);
  const at = rows.findIndex((r) => picked && r.t === picked.kind && r.b.name === picked.name);

  useEffect(() => {
    if (!rows.length) return;
    const first = rows.find((r) => r.t === 'local' && r.b.current) ?? rows.find((r) => r.t !== 'section');
    if (!first || first.t === 'section') return;
    // Only when what's picked is gone (or nothing is): a pick made meanwhile stays.
    onPick((cur) => (cur && rows.some((r) => r.t === cur.kind && r.b.name === cur.name) ? cur : { kind: first.t as 'local' | 'remote', name: first.b.name }));
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (e: ReactMouseEvent, r: Row) => {
    e.preventDefault();
    e.stopPropagation();
    if (r.t === 'section') return;
    const b: BranchPick = { kind: r.t, name: r.b.name };
    onPick(b);
    const items = branchActions(repo, b, r.t === 'local' ? r.b : undefined);
    repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  const onKey = (e: KeyboardEvent) => {
    let next = listKey(e, at, rows.length, 12);
    const cur = rows[at];
    if (next !== null) {
      const dir = next >= at ? 1 : -1;
      while (rows[next]?.t === 'section') next += dir;
      const r = rows[next];
      if (r && r.t !== 'section') {
        onPick({ kind: r.t, name: r.b.name });
        list.current?.scrollToIndex(next);
      }
    } else if (e.key === 'Enter' && cur && cur.t !== 'section') {
      if (!(cur.t === 'local' && cur.b.current)) repo.run(() => repo.api.checkout(cur.b.name));
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (error && !branches) return <NodeMessage error>{error}</NodeMessage>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] px-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput ref={filterRef} className="w-full ps-6" placeholder={`Filter branches (${keys('⌘F')})`} value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === 'ArrowDown' && (list.current?.element?.focus(), e.preventDefault())} />
        </div>
        <ToolButton label="New branch" icon={Plus} onClick={() => createBranch(repo)} />
      </div>
      {!branches ? (
        <NodeMessage>Loading…</NodeMessage>
      ) : !rows.length ? (
        <Blank>{filter ? 'No branch matches.' : 'No branches yet: make the first commit.'}</Blank>
      ) : (
        <VirtualList
          ref={list}
          count={rows.length}
          rowHeight={36}
          rowKey={(n) => keyOf(rows[n])}
          className="group/list git-scroll py-1"
          tabIndex={0}
          role="listbox"
          ariaLabel="Branches"
          onKeyDown={onKey}
          row={(n) => {
            const r = rows[n];
            if (r.t === 'section')
              return (
                <div className="flex h-full items-end px-1.5 pb-1">
                  <SectionHeader label={r.label} count={r.count} className="h-5" />
                </div>
              );
            const isPicked = !!picked && picked.kind === r.t && picked.name === r.b.name;
            const current = r.t === 'local' && r.b.current;
            return (
              <div className="h-full px-1 py-px" data-branch={r.b.name}>
                <div
                  className={cn(rowClass(isPicked), 'items-center')}
                  onClick={() => onPick({ kind: r.t, name: r.b.name })}
                  onDoubleClick={() => !current && repo.run(() => repo.api.checkout(r.b.name))}
                  onContextMenu={(e) => menu(e, r)}
                  title={`${r.b.name}\n${r.b.subject}\n${r.b.author} · ${longDate(r.b.date)}`}
                >
                  {r.t === 'remote' ? <Cloud className="size-3.5 flex-none text-[var(--node-muted)]" /> : <GitBranch className={cn('size-3.5 flex-none', current ? 'text-[var(--node-accent)]' : 'text-[var(--node-muted)]')} />}
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('truncate', current && 'font-semibold')}>{r.b.name}</span>
                      {current && <span className="flex-none text-[10px] text-[var(--node-accent)]">current</span>}
                      {r.t === 'local' && r.recent && <span className="flex-none text-[10px] text-[var(--node-muted)]">recent</span>}
                      {r.t === 'local' && r.b.gone && <span className="flex-none text-[10px] text-[var(--ansi-3)]">upstream gone</span>}
                    </span>
                    <span className="truncate text-[10px] text-[var(--node-muted)]">
                      {r.t === 'local' && r.b.upstream ? `${r.b.upstream} · ` : ''}
                      {r.b.subject}
                    </span>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-0.5 leading-tight">
                    {r.t === 'local' && <AheadBehind ahead={r.b.ahead} behind={r.b.behind} />}
                    <span className="text-[10px] text-[var(--node-muted)] tabular-nums">{ago(r.b.date)}</span>
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
