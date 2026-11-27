// The picked branch: what it is (who, when, its upstream, merged or not),
// what can be done with it, and how it compares with the current branch.

import type { MouseEvent as ReactMouseEvent } from 'react';
import { Cloud, GitBranch, GitMerge, MoreHorizontal } from '@hyperpane/icons';
import { NodeMessage, ToolButton, cn, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Branches } from '../../../shared/index.ts';
import { type BranchPick, branchActions } from '../../app/actions/branches.ts';
import { useRepo } from '../../app/repo.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { Blank } from '../../components/Blank.tsx';
import { ago, shortSha } from '../../lib/format.ts';
import { header } from '../../ui/classes.ts';
import { Button, Chip } from '../../ui/parts.tsx';
import { CompareView } from './CompareView.tsx';

/** The picked branch: what it is, what can be done, and how it compares
 * with the current branch. */
export function BranchDetail({ pick, branches }: { pick: BranchPick | null; branches: Branches | null }) {
  const repo = useRepo();
  if (!pick)
    return (
      <Blank icon={GitBranch} title="No branch picked">
        Pick one to see how it compares with the current branch.
      </Blank>
    );
  if (!branches) return <NodeMessage>Loading</NodeMessage>;
  const local = pick.kind === 'local' ? branches.local.find((b) => b.name === pick.name) : undefined;
  const remote = pick.kind === 'remote' ? branches.remote.find((b) => b.name === pick.name) : undefined;
  const b = local ?? remote;
  if (!b) return <Blank icon={GitBranch} title="That branch is gone" />;
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
      <div className={cn(header.base, 'gap-2 ps-3.5 pe-2 max-sm:h-auto max-sm:flex-wrap max-sm:py-2')}>
        {pick.kind === 'remote' ? (
          <Cloud className="size-4 flex-none text-[var(--git-remote)]" />
        ) : (
          <GitBranch className={cn('size-4 flex-none', current ? 'text-[var(--node-accent)]' : 'text-[var(--git-branch)]')} />
        )}
        <span className={cn(header.title, 'flex-1 max-sm:basis-[calc(100%-1.5rem)]')}>{b.name}</span>
        {/* The first action a soft button, the rest quieter: three filled
            buttons in a row read as a wall. */}
        {main.map((a, i) => (
          <Button key={a.label} variant={i === 0 ? 'secondary' : 'ghost'} onClick={a.run}>
            {a.label}
          </Button>
        ))}
        <ToolButton label="More" icon={MoreHorizontal} onClick={more} />
      </div>
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-3 text-xs text-[var(--node-muted)]">
        <span className="flex items-center gap-1.5">
          <Avatar name={b.author} size={18} />
          <span className="font-medium text-[var(--node-fg)]">{b.author}</span> {ago(b.date)}
        </span>
        <Chip className="font-mono">{shortSha(b.sha)}</Chip>
        <span className="min-w-0 truncate text-[var(--node-fg)] opacity-85">{b.subject}</span>
        {local?.upstream && (
          <span className="flex items-center gap-1.5">
            tracks <span className="text-[var(--node-fg)]">{local.upstream}</span>
            {local.gone ? (
              <Chip color="var(--git-modified)">gone</Chip>
            ) : local.ahead || local.behind ? (
              <span>
                · {local.ahead ?? 0} ahead, {local.behind ?? 0} behind
              </span>
            ) : (
              <span>· up to date</span>
            )}
          </span>
        )}
        {local && !local.current && (
          <Chip color={local.merged ? 'var(--git-added)' : undefined}>{local.merged ? `merged into ${base}` : `not merged into ${base}`}</Chip>
        )}
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
