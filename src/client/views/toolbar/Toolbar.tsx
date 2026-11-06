// The bar across the top, as GitHub Desktop has it: the repository (switch
// to one nested here or a submodule, or another folder), the branch (a
// searchable list: recent first, then local, then remote; make one), and
// one sync button for what fits now (Fetch, Pull ↓n, Push ↑n, Publish), with
// its progress, a cancel, and a menu with the rest.

import { useEffect, useRef, useState } from 'react';
import { FolderGit2, GitBranch, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ToolButton, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Branches, Found } from '../../../shared/index.ts';
import { syncChoice, syncMenu } from '../../app/actions/sync.ts';
import { type Repo, useRepo } from '../../app/repo.ts';
import { Popover } from '../../components/Popover.tsx';
import { copy } from '../../lib/clipboard.ts';
import { shortSha } from '../../lib/format.ts';
import { basenameOf } from '../../lib/paths.ts';
import { BranchPicker } from './BranchPicker.tsx';
import { Segment } from './Segment.tsx';
import { SyncSegment } from './SyncSegment.tsx';

const openMenu = (repo: Repo, el: HTMLElement, items: (MenuEntry | null)[]) => {
  const r = el.getBoundingClientRect();
  repo.host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(items)).then((id) => {
    const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
    if (item && !item.disabled) item.run();
  });
};

export function Toolbar({
  found,
  onRepo,
  onChooseFolder,
  sidebar,
  onSidebar,
  branches,
  wantBranches,
}: {
  found: Found | null;
  onRepo(root: string): void;
  onChooseFolder(): void;
  sidebar: boolean;
  onSidebar(): void;
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
      { label: 'Open Another Folder…', run: onChooseFolder },
      null,
      { label: 'Copy Path', run: () => copy(repo.root, repo.toast) },
      { label: 'Open Terminal Here', run: () => repo.terminal() },
      { label: 'Reveal in Explorer', run: () => repo.reveal('') },
    ];
    openMenu(repo, el, items);
  };

  const branch = status.branch ?? (status.head ? `${shortSha(status.head)}` : 'No branch');
  const showCounts = !!status.upstream && !status.upstreamGone && (status.ahead > 0 || status.behind > 0);

  return (
    <div className="flex h-10 flex-none items-stretch border-b border-[var(--node-border)] bg-[var(--node-header)]">
      <div className="flex flex-none items-center px-1.5">
        <ToolButton label={sidebar ? 'Hide the list' : 'Show the list'} icon={sidebar ? PanelLeftClose : PanelLeftOpen} onClick={onSidebar} />
      </div>
      <Segment icon={FolderGit2} title="Repository" value={name} onClick={(e) => repoMenu(e.currentTarget)} className="w-[22%] max-w-56 min-w-28" />
      <Segment
        ref={branchButton}
        icon={GitBranch}
        title={status.detached ? 'Detached HEAD' : 'Current branch'}
        value={branch}
        warn={status.detached}
        onClick={() => setPicker(!picker)}
        active={picker}
        className="w-[26%] max-w-64 min-w-32"
      />
      <Popover open={picker} anchor={branchButton} onClose={() => setPicker(false)} className="max-h-[min(420px,calc(100vh-56px))] w-80">
        <BranchPicker branches={branches} onClose={() => setPicker(false)} />
      </Popover>
      <SyncSegment
        icon={sync.icon}
        label={sync.label}
        sub={sync.sub}
        badge={
          showCounts ? (
            <span className="flex flex-none items-center gap-1 rounded-full bg-[var(--node-hover)] px-1.5 text-[10px] leading-4 font-medium tabular-nums">
              {status.behind > 0 && <span>↓{status.behind}</span>}
              {status.ahead > 0 && <span>↑{status.ahead}</span>}
            </span>
          ) : null
        }
        onClick={() => sync.run?.()}
        onMenu={(el) => openMenu(repo, el, syncMenu(repo))}
      />
      <div className="min-w-0 flex-1" />
      {status.fetchError && (
        <span className="flex min-w-0 items-center px-3 text-2xs text-[var(--ansi-3)]" title={status.fetchError}>
          <span className="truncate">Auto-fetch failed</span>
        </span>
      )}
    </div>
  );
}
