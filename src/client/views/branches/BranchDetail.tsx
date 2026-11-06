// The picked branch: what it is (who, when, its upstream, merged or not),
// what can be done with it, and how it compares with the current branch.

import type { MouseEvent as ReactMouseEvent } from 'react';
import { Cloud, GitBranch, GitMerge } from 'lucide-react';
import { NodeButton, NodeMessage, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Branches } from '../../../shared/index.ts';
import { type BranchPick, branchActions } from '../../app/actions/branches.ts';
import { useRepo } from '../../app/repo.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { Blank } from '../../components/Blank.tsx';
import { ago, shortSha } from '../../lib/format.ts';
import { CompareView } from './CompareView.tsx';

/** The picked branch: what it is, what can be done, and how it compares
 * with the current branch. */
export function BranchDetail({ pick, branches }: { pick: BranchPick | null; branches: Branches | null }) {
  const repo = useRepo();
  if (!pick) return <Blank icon={GitBranch}>Pick a branch.</Blank>;
  if (!branches) return <NodeMessage>Loading…</NodeMessage>;
  const local = pick.kind === 'local' ? branches.local.find((b) => b.name === pick.name) : undefined;
  const remote = pick.kind === 'remote' ? branches.remote.find((b) => b.name === pick.name) : undefined;
  const b = local ?? remote;
  if (!b) return <Blank>That branch is gone.</Blank>;
  const current = !!local?.current;
  const base = repo.status.branch ?? 'HEAD';
  const actions = branchActions(repo, pick, local);
  const main = actions.filter((a): a is MenuEntry => !!a && !a.disabled).slice(0, 3);
  const more = (e: ReactMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    repo.host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(actions)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? actions[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-branch-detail={b.name}>
      <div className="flex flex-none flex-col gap-1.5 border-b border-[var(--node-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          {pick.kind === 'remote' ? <Cloud className="size-4 text-[var(--node-muted)]" /> : <GitBranch className="size-4 text-[var(--node-accent)]" />}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.name}</span>
          {main.map((a) => (
            <NodeButton key={a.label} onClick={a.run}>
              {a.label.replace(/…$/, '')}
            </NodeButton>
          ))}
          <NodeButton onClick={more}>More…</NodeButton>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-[var(--node-muted)]">
          <span className="flex items-center gap-1.5">
            <Avatar name={b.author} size={16} />
            <span className="text-[var(--node-fg)]">{b.author}</span> {ago(b.date)}
          </span>
          <span className="font-mono">{shortSha(b.sha)}</span>
          <span className="min-w-0 truncate">{b.subject}</span>
          {local?.upstream && (
            <span>
              tracks <span className="text-[var(--node-fg)]">{local.upstream}</span>
              {local.gone ? ' (gone)' : local.ahead || local.behind ? ` · ${local.ahead ?? 0} ahead, ${local.behind ?? 0} behind` : ' · up to date'}
            </span>
          )}
          {local && !local.current && <span>{local.merged ? `merged into ${base}` : `not merged into ${base}`}</span>}
        </div>
      </div>
      {current ? (
        <Blank icon={GitMerge} title={`${b.name} is the current branch`}>
          Pick another branch to compare it with {b.name}, merge it in, or rebase onto it.
        </Blank>
      ) : (
        <CompareView base={base} head={b.name} />
      )}
    </div>
  );
}
