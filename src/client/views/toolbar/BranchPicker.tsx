// The branch dropdown under the toolbar: the current branch, recent ones,
// the rest, then remote ones; type to find one, ↑ ↓ and ↵ to switch, or
// make one.

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Plus, Search } from 'lucide-react';
import { keys } from '@hyperpane/sdk/client';
import { NodeInput, cn, styles } from '@hyperpane/ui';
import type { Branches } from '../../../shared/index.ts';
import { createBranch } from '../../app/actions/branches.ts';
import { useRepo } from '../../app/repo.ts';
import { ago, plural } from '../../lib/format.ts';

type PickRow = { t: 'head'; label: string } | { t: 'branch'; name: string; remote: boolean; current: boolean; sub: string; ahead?: number; behind?: number };

/** The branch dropdown: type to find one; ↑ ↓ and ↵ to switch. */
export function BranchPicker({ branches, onClose }: { branches: Branches | null; onClose(): void }) {
  const repo = useRepo();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const rows = useMemo((): PickRow[] => {
    if (!branches) return [];
    const query = q.trim().toLowerCase();
    const match = (n: string) => !query || n.toLowerCase().includes(query);
    const out: PickRow[] = [];
    const locals = new Map(branches.local.map((b) => [b.name, b]));
    const recent = branches.recent.filter((n) => locals.has(n) && n !== branches.current && match(n)).slice(0, 5);
    const local = (n: string): PickRow => {
      const b = locals.get(n)!;
      return { t: 'branch', name: n, remote: false, current: b.current, sub: `${ago(b.date)} · ${b.subject}`, ahead: b.ahead, behind: b.behind };
    };
    const cur = branches.current && locals.get(branches.current);
    if (cur && match(cur.name)) out.push({ t: 'head', label: 'Current' }, local(cur.name));
    if (recent.length) out.push({ t: 'head', label: 'Recent' }, ...recent.map(local));
    const rest = branches.local.filter((b) => !b.current && !recent.includes(b.name) && match(b.name));
    if (rest.length) out.push({ t: 'head', label: 'Local' }, ...rest.map((b) => local(b.name)));
    const remote = branches.remote.filter((b) => match(b.name) && !locals.has(b.branch));
    if (remote.length) out.push({ t: 'head', label: 'Remote' }, ...remote.slice(0, 200).map((b) => ({ t: 'branch' as const, name: b.name, remote: true, current: false, sub: `${ago(b.date)} · ${b.subject}` })));
    return out;
  }, [branches, q]);
  const choices = rows.map((r, i) => (r.t === 'branch' ? i : -1)).filter((i) => i >= 0);
  const sel = choices[Math.min(at, choices.length - 1)] ?? -1;
  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-pick="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (r: PickRow) => {
    if (r.t !== 'branch') return;
    onClose();
    if (!r.current) repo.run(() => repo.api.checkout(r.name));
  };
  const create = () => {
    onClose();
    createBranch(repo);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setAt((a) => Math.min(choices.length - 1, a + 1));
    else if (e.key === 'ArrowUp') setAt((a) => Math.max(0, a - 1));
    else if (e.key === 'Enter') {
      if (sel >= 0) choose(rows[sel]);
      else if (q.trim()) create();
    } else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div className="flex flex-none items-center gap-1 border-b border-[var(--node-border)] p-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput ref={input} className="h-7 w-full ps-6" placeholder="Find a branch" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        </div>
        <button
          type="button"
          className={cn('rounded-control flex h-7 flex-none items-center gap-1 border border-[var(--node-border)] px-2 text-xs hover:bg-[var(--node-hover)]', styles.focusRing)}
          onClick={create}
          title="New branch from the current one"
        >
          <Plus className="size-3.5" />
          New
        </button>
      </div>
      <div ref={listRef} className="git-scroll min-h-0 flex-1 overflow-auto p-1">
        {!branches ? (
          <div className="p-3 text-center text-[var(--node-muted)]">Loading…</div>
        ) : !rows.length ? (
          <div className="p-3 text-center text-[var(--node-muted)]">{q ? `No branch matches. ${keys('↵')} makes ${q.trim()}.` : 'No branches.'}</div>
        ) : (
          rows.map((r, i) =>
            r.t === 'head' ? (
              <div key={`h${i}`} className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-[var(--node-muted)] uppercase">
                {r.label}
              </div>
            ) : (
              <button
                key={`${r.remote}:${r.name}`}
                type="button"
                data-pick={i}
                className={cn('rounded-chip flex h-9 w-full items-center gap-2 px-2 text-left', i === sel ? 'bg-[var(--node-selection)]' : 'hover:bg-[var(--node-hover)]')}
                onMouseEnter={() => setAt(choices.indexOf(i))}
                onClick={() => choose(r)}
              >
                <GitBranch className={cn('size-3.5 flex-none', r.current ? 'text-[var(--node-accent)]' : 'text-[var(--node-muted)]')} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={cn('truncate', r.current && 'font-semibold')}>{r.name}</span>
                  <span className="truncate text-[10px] text-[var(--node-muted)]">{r.sub}</span>
                </span>
                {(r.ahead || r.behind) && (
                  <span className="flex-none text-[10px] text-[var(--node-muted)] tabular-nums">
                    {r.behind ? `↓${r.behind} ` : ''}
                    {r.ahead ? `↑${r.ahead}` : ''}
                  </span>
                )}
              </button>
            ),
          )
        )}
      </div>
      <div className="flex-none border-t border-[var(--node-border)] px-2 py-1 text-[10px] text-[var(--node-muted)]">
        {branches ? `${plural(branches.local.length, 'local branch', 'local branches')}, ${branches.remote.length} remote` : ''} · {keys('↵')} switches
      </div>
    </>
  );
}
