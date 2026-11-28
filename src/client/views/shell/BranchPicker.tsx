// The branch dropdown under the top bar's branch pill: the current branch, recent ones,
// the rest, then remote ones; type to find one, ↑ ↓ and ↵ to switch, or
// make one.

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, GitBranch, Plus, Search } from '@hyperpane/icons';
import { keys } from '@hyperpane/sdk/client';
import { cn, isComposing } from '@hyperpane/ui';
import { field } from '../../ui/classes.ts';
import { Button } from '../../ui/parts.tsx';
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
    if (remote.length)
      out.push(
        { t: 'head', label: 'Remote' },
        ...remote.slice(0, 200).map((b) => ({ t: 'branch' as const, name: b.name, remote: true, current: false, sub: `${ago(b.date)} · ${b.subject}` })),
      );
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
    else if (e.key === 'Enter' && !isComposing(e)) {
      if (sel >= 0) choose(rows[sel]);
      else if (q.trim()) create();
    } else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div className="flex flex-none items-center gap-1.5 p-2 pb-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--node-muted)]" />
          <input
            ref={input}
            spellCheck={false}
            className={cn(field, 'w-full ps-8')}
            placeholder="Find a branch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <Button onClick={create} title="New branch from the current one">
          <Plus />
          New
        </Button>
      </div>
      <div ref={listRef} className="git-scroll min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
        {!branches ? (
          <div className="p-6 text-center text-[13px] text-[var(--node-muted)]">Loading</div>
        ) : !rows.length ? (
          <div className="p-6 text-center text-[13px] text-[var(--node-muted)]">{q ? `No branch matches. ${keys('↵')} makes ${q.trim()}.` : 'No branches'}</div>
        ) : (
          rows.map((r, i) =>
            r.t === 'head' ? (
              <div key={`h${i}`} className="flex h-8 items-end px-2 pb-1.5 text-[11px] leading-4 font-medium tracking-[0.06em] text-[var(--node-muted)] uppercase">
                {r.label}
              </div>
            ) : (
              <button
                key={`${r.remote}:${r.name}`}
                type="button"
                data-pick={i}
                className={cn(
                  'rounded-control flex h-11 w-full items-center gap-2.5 px-2 text-left text-[13px] transition-colors duration-75 touch:h-12',
                  i === sel ? 'bg-[var(--git-selected)]' : 'hover:bg-[var(--node-hover)]',
                )}
                onMouseEnter={() => setAt(choices.indexOf(i))}
                onClick={() => choose(r)}
              >
                {r.current ? (
                  <Check className="size-4 flex-none text-[var(--node-accent)]" />
                ) : (
                  <GitBranch className="size-4 flex-none text-[var(--node-muted)]" variant="outline" />
                )}
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={cn('truncate', r.current && 'font-medium')}>{r.name}</span>
                  <span className="truncate text-xs text-[var(--node-muted)]">{r.sub}</span>
                </span>
                {(r.ahead || r.behind) && (
                  <span className="flex-none text-xs text-[var(--node-muted)] tabular-nums">
                    {r.behind ? `↓${r.behind} ` : ''}
                    {r.ahead ? `↑${r.ahead}` : ''}
                  </span>
                )}
              </button>
            ),
          )
        )}
      </div>
      <div className="flex h-8 flex-none items-center border-t border-[var(--git-line)] px-3 text-xs text-[var(--node-muted)]">
        {branches ? `${plural(branches.local.length, 'local branch', 'local branches')}, ${branches.remote.length} remote` : ''} · {keys('↵')} switches
      </div>
    </>
  );
}
