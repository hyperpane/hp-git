// The bar across the top, one compact row: one pill for where you are, in
// two halves: the repository (switch to one nested here or a submodule,
// another folder, copy its path, a terminal, reveal it) and the branch
// (with ahead/behind: a searchable list, recent first, then local, then
// remote; make one); and at the end the
// sync button for what fits now (Fetch, Pull ↓n, Push ↑n, Publish), with its
// progress, a cancel, and a menu with the rest. Narrow (a phone), the halves
// share the width and the sync button is its icon.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderGit2, GitBranch, TriangleAlert } from '@hyperpane/icons';
import { type MenuEntry, cn, menuItems } from '@hyperpane/ui';
import type { Branches, Found } from '../../../shared/index.ts';
import { syncChoice, syncMenu } from '../../app/actions/sync.ts';
import { type Repo, useRepo } from '../../app/repo.ts';
import { Popover } from '../../components/Popover.tsx';
import { copy } from '../../lib/clipboard.ts';
import { shortSha } from '../../lib/format.ts';
import { basenameOf } from '../../lib/paths.ts';
import { switcher } from '../../ui/classes.ts';
import { BranchPicker } from './BranchPicker.tsx';
import { SyncButton } from './SyncButton.tsx';

const openMenu = (repo: Repo, el: HTMLElement, items: (MenuEntry | null)[]) => {
  const r = el.getBoundingClientRect();
  repo.host.ui.menu({ x: r.left, y: r.bottom + 4 }, menuItems(items)).then((id) => {
    const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
    if (item && !item.disabled) item.run();
  });
};

export function TopBar({
  found,
  onRepo,
  onChooseFolder,
  branches,
  wantBranches,
}: {
  found: Found | null;
  onRepo(root: string): void;
  onChooseFolder(): void;
  branches: Branches | null;
  wantBranches(on: boolean): void;
}) {
  const repo = useRepo();
  const { status } = repo;
  const [picker, setPicker] = useState(false);
  const branchButton = useRef<HTMLButtonElement>(null);
  const sync = syncChoice(repo);
  const name = basenameOf(repo.root);

  useEffect(() => wantBranches(picker), [picker]); // eslint-disable-line react-hooks/exhaustive-deps

  const repoMenu = (el: HTMLElement) => {
    const others = (found?.repos ?? []).filter((r) => r.root !== repo.root);
    const items: (MenuEntry | null)[] = [
      ...(found && found.repos.length > 1
        ? found.repos.map((r) => ({
            label: `${r.root === repo.root ? '✓ ' : ''}${r.name}${r.kind === 'submodule' ? ' (submodule)' : r.kind === 'nested' ? ' (nested)' : ''}`,
            disabled: r.root === repo.root,
            run: () => onRepo(r.root),
          }))
        : []),
      ...(others.length ? [null] : []),
      { label: 'Open Another Folder', run: onChooseFolder },
      null,
      { label: 'Copy Path', run: () => copy(repo.root, repo.toast) },
      { label: 'Open Terminal Here', run: () => repo.terminal() },
      { label: 'Reveal in Explorer', run: () => repo.reveal('') },
    ];
    openMenu(repo, el, items);
  };

  const branch = status.branch ?? (status.head ? shortSha(status.head) : 'No branch');
  const tracked = !!status.upstream && !status.upstreamGone;
  const nested = found?.repos.find((r) => r.root === repo.root)?.kind;

  return (
    <div role="toolbar" aria-label="Repository" className="flex h-11 min-w-0 flex-none items-center gap-2 border-b border-[var(--git-line)] px-2 touch:h-12">
      {/* The repository and its branch: one pill in two halves, each its own
          button with its own menu, a hairline between them. */}
      <div data-switcher className={switcher.base}>
        <button
          type="button"
          className={cn(switcher.half, 'max-w-56 rounded-s-full ps-2.5 pe-2')}
          onClick={(e) => repoMenu(e.currentTarget)}
          title={repo.root}
          data-pill="repo"
        >
          <span className="sr-only">Repository</span>
          <FolderGit2 aria-hidden className="size-4 flex-none text-[var(--node-muted)]" />
          <span className="truncate font-medium">{name}</span>
          {nested && nested !== 'main' && <span className="flex-none text-xs text-[var(--node-muted)]">{nested}</span>}
          <ChevronDown aria-hidden className="size-3.5 flex-none text-[var(--node-muted)] opacity-70" />
        </button>
        <span aria-hidden className={switcher.hairline} />
        <button
          ref={branchButton}
          type="button"
          className={cn(switcher.half, 'max-w-72 min-w-0 rounded-e-full ps-2 pe-2.5', picker && switcher.open)}
          onClick={() => setPicker(!picker)}
          aria-expanded={picker}
          aria-haspopup="dialog"
          data-pill="branch"
          title={status.detached ? 'Detached HEAD: no branch is checked out' : status.upstream ? `Tracking ${status.upstream}` : 'Not published yet'}
        >
          <span className="sr-only">{status.detached ? 'Detached HEAD' : 'Current branch'}</span>
          <GitBranch aria-hidden className={cn('size-4 flex-none', status.detached ? 'text-[var(--git-modified)]' : 'text-[var(--node-muted)]')} />
          <span className="truncate">{branch}</span>
          {status.detached && <span className="flex-none text-xs text-[var(--git-modified)]">detached</span>}
          {tracked && (status.ahead > 0 || status.behind > 0) && (
            <span className="flex flex-none items-center gap-1 text-xs text-[var(--node-muted)] tabular-nums" title={`${status.ahead} ahead, ${status.behind} behind ${status.upstream}`}>
              {status.ahead > 0 && <span>↑{status.ahead}</span>}
              {status.behind > 0 && <span>↓{status.behind}</span>}
            </span>
          )}
          <ChevronDown aria-hidden className={cn('size-3.5 flex-none text-[var(--node-muted)] opacity-70 transition-transform duration-150', picker && 'rotate-180')} />
        </button>
      </div>
      <Popover open={picker} anchor={branchButton} onClose={() => setPicker(false)} className="max-h-[min(440px,calc(100vh-56px))] w-80 max-w-[calc(100vw-16px)]">
        <BranchPicker branches={branches} onClose={() => setPicker(false)} />
      </Popover>
      <span className="min-w-1 flex-1" />
      {status.fetchError && (
        <span className="flex min-w-0 items-center gap-1 px-1.5 text-xs text-[var(--git-modified)] max-sm:hidden" title={status.fetchError}>
          <TriangleAlert aria-hidden className="size-3.5 flex-none" />
          <span className="truncate">Auto-fetch failed</span>
        </span>
      )}
      <SyncButton choice={sync} onMenu={(el) => openMenu(repo, el, syncMenu(repo))} />
    </div>
  );
}
