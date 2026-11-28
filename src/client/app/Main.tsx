// Git: a repository on the window's server. The bar on top has the
// repository, the branch and the sync button (views/shell/TopBar.tsx); a
// banner under it says when a merge, rebase, cherry-pick or revert is under
// way. Down the left, the rail (views/shell/Rail.tsx): Changes, History,
// Branches, Stashes, Tags, with their counts; it folds to its icons. Beside
// it the picked view's list (resizable, and it can be hidden), then what's
// picked in it: a diff, a commit, a branch compared with the current one. In
// a narrow window (a phone), the views are a bar along the bottom and the
// list and what's picked show one at a time, with a way back. File history,
// blame, commits and compares open over the list and what's picked, with a
// way back. Everything follows the repository as it changes, here, in a
// terminal or in another app. DESIGN.md has the look.
//
// Its keys and menu are hooks/useWindowKeys.ts and hooks/useWindowMenu.ts;
// the views over the tabs, views/Overlay.tsx.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Archive, FileDiff, GitBranch, GitCommitHorizontal, History, Tag as TagIcon } from '@hyperpane/icons';
import { useEvent } from '@hyperpane/sdk/client';
import { COMPACT_WIDTH, useCompact } from '@hyperpane/ui';
import type { Found } from '../../shared/index.ts';
import { Blank } from '../components/Blank.tsx';
import { ListDetail } from '../components/ListDetail.tsx';
import { useWayBack } from '../components/WayBack.tsx';
import { useBranches } from '../hooks/useBranches.ts';
import { useStashes } from '../hooks/useStashes.ts';
import { useTags } from '../hooks/useTags.ts';
import { useWindowKeys } from '../hooks/useWindowKeys.ts';
import { useWindowMenu } from '../hooks/useWindowMenu.ts';
import { shortSha } from '../lib/format.ts';
import { local } from '../lib/local.ts';
import { basenameOf, inRepo, relativeTo, tildify } from '../lib/paths.ts';
import { type Pick, pickOf, sideOf, splitPick } from '../lib/picks.ts';
import { BranchDetail } from '../views/branches/BranchDetail.tsx';
import { BranchList } from '../views/branches/BranchList.tsx';
import { ChangesDetail } from '../views/changes/ChangesDetail.tsx';
import { ChangesList } from '../views/changes/ChangesList.tsx';
import { CommitDetails } from '../views/commit/CommitDetails.tsx';
import { HistoryList } from '../views/history/HistoryList.tsx';
import { OperationBar } from '../views/OperationBar.tsx';
import { Overlay } from '../views/Overlay.tsx';
import { StashDetail } from '../views/stashes/StashDetail.tsx';
import { StashList } from '../views/stashes/StashList.tsx';
import { TagDetail } from '../views/tags/TagDetail.tsx';
import { TagList } from '../views/tags/TagList.tsx';
import { BottomNav, type NavItem, Rail } from '../views/shell/Rail.tsx';
import { TopBar } from '../views/shell/TopBar.tsx';
import type { BranchPick } from './actions/branches.ts';
import type { Repo, Tab } from './repo.ts';

const TAB_ICONS = { changes: FileDiff, history: History, branches: GitBranch, stashes: Archive, tags: TagIcon } as const;

export function Main({ repo, found, onChooseFolder }: { repo: Repo; found: Found; onChooseFolder(): void }) {
  const { host, status, tab, setTab } = repo;
  // The list beside the rail, shown or hidden; the rail open or folded.
  // Both kept on this machine.
  const [sidebar, setSidebarState] = useState(() => local.get('sidebar', true));
  const setSidebar = (on: boolean) => {
    setSidebarState(on);
    local.set('sidebar', on);
  };
  const [railFolded, setRailFolded] = useState(() => local.get('rail.folded', false));
  const toggleRail = () =>
    setRailFolded((was) => {
      local.set('rail.folded', !was);
      return !was;
    });
  const [picked, setPicked] = useState<Pick[]>([]);
  const [commit, setCommit] = useState<string | null>(null);
  const [branch, setBranch] = useState<BranchPick | null>(null);
  const [stash, setStash] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [pickerWants, setPickerWants] = useState(false);
  // Narrow, the list or what's picked in it: a row clicked opens the
  // second, the back bar the first; another tab starts at its list.
  const compact = useCompact();
  const [openIn, setOpenIn] = useState<Tab | null>(null);
  const open = openIn === tab;
  const opens = () => setOpenIn(tab);
  const filters = {
    changes: useRef<HTMLInputElement>(null),
    history: useRef<HTMLInputElement>(null),
    branches: useRef<HTMLInputElement>(null),
    stashes: useRef<HTMLInputElement>(null),
    tags: useRef<HTMLInputElement>(null),
  };
  const branches = useBranches(repo, tab === 'branches' || pickerWants);
  const stashes = useStashes(repo, tab === 'stashes');
  const tags = useTags(repo, tab === 'tags');

  // The window's title: the repository; under it, the branch (with how far
  // it is from its upstream) and where the repository is.
  useEffect(() => {
    host.win.setTitle(basenameOf(repo.root) || repo.root);
  }, [host, repo.root]);
  const where = branchLine(status);
  useEffect(() => {
    host.win.setDescription(`${where} · ${tildify(repo.root, found.home)}`);
  }, [host, where, repo.root, found.home]);

  useWindowMenu(host, repo, onChooseFolder);
  // A view over the tabs: the header's back button goes where its bar's
  // does (the view before, or the tabs).
  useWayBack(!!repo.view, repo.back);

  // Its output (linked in nodes mode): the one changed file picked, once
  // the pick rests (not every row arrowed past).
  const one = picked.length === 1 ? inRepo(repo.root, splitPick(picked[0])[1]) : null;
  useEffect(() => {
    if (!one) return;
    const t = setTimeout(() => host.ports.emit('file', one), 250);
    return () => clearTimeout(t);
  }, [host, one]);

  // Other plugins ask for a file's history, blame or diff (git.open).
  useEvent<{ path: string; view: 'history' | 'blame' | 'diff'; line?: number }>('git.open', (e) => {
    const rel = relativeTo(repo.root, e.data.path);
    if (rel === null) return;
    if (e.data.view === 'history') repo.open({ kind: 'fileHistory', path: rel });
    else if (e.data.view === 'blame') repo.open({ kind: 'blame', path: rel, line: e.data.line });
    else {
      setTab('changes');
      const f = status.files.find((x) => x.path === rel);
      if (f) {
        setPicked([pickOf(sideOf(f, repo.including), rel)]);
        setOpenIn('changes');
      }
    }
    if (host.window) host.app.focusWindow(host.window.id);
  });

  // The filter is in the list: one at a time, back to it.
  useWindowKeys(
    repo,
    sidebar && !(compact && open),
    (on) => {
      setOpenIn(null);
      setSidebar(on);
    },
    filters,
    toggleRail,
  );

  const conflicts = status.files.filter((f) => f.conflict).length;
  const tabs: NavItem[] = [
    { value: 'changes', label: 'Changes', icon: TAB_ICONS.changes, count: status.files.length, alert: conflicts > 0, shortcut: '⌃1' },
    { value: 'history', label: 'History', icon: TAB_ICONS.history, shortcut: '⌃2' },
    { value: 'branches', label: 'Branches', icon: TAB_ICONS.branches, shortcut: '⌃3' },
    { value: 'stashes', label: 'Stashes', icon: TAB_ICONS.stashes, count: status.stashes, shortcut: '⌃4' },
    { value: 'tags', label: 'Tags', icon: TAB_ICONS.tags, shortcut: '⌃5' },
  ];

  let left: ReactNode;
  let right: ReactNode;
  if (tab === 'changes') {
    left = <ChangesList picked={picked} setPicked={setPicked} onOpen={opens} filterRef={filters.changes} />;
    right = <ChangesDetail picked={picked} />;
  } else if (tab === 'history') {
    left = <HistoryList selected={commit} onSelect={setCommit} onOpen={opens} filterRef={filters.history} />;
    right = commit ? (
      <CommitDetails key={commit} id={commit} load={() => repo.api.show(commit)} place="history" />
    ) : (
      <Blank icon={GitCommitHorizontal} title="No commit picked">
        Pick one in the list to see what it changed.
      </Blank>
    );
  } else if (tab === 'branches') {
    left = <BranchList branches={branches.branches} error={branches.error} picked={branch} onPick={setBranch} onOpen={opens} filterRef={filters.branches} />;
    right = <BranchDetail pick={branch} branches={branches.branches} />;
  } else if (tab === 'stashes') {
    left = <StashList stashes={stashes.stashes} error={stashes.error} picked={stash} onPick={setStash} onOpen={opens} />;
    right = <StashDetail stash={stashes.stashes?.find((s) => s.index === stash) ?? null} />;
  } else {
    left = <TagList tags={tags.tags} error={tags.error} picked={tag} onPick={setTag} onOpen={opens} filterRef={filters.tags} />;
    right = <TagDetail tag={tags.tags?.find((t) => t.name === tag) ?? null} />;
  }

  // Narrow, one at a time: the views along the bottom, under the list (not
  // under what's picked, which has its way back).
  const alone = compact && open;
  return (
    <div className="flex h-full min-h-0 flex-col text-[13px] leading-5 text-[var(--node-fg)] select-none" data-git={repo.root}>
      <TopBar
        found={found}
        onRepo={(r) => host.win.setData('repo', r)}
        onChooseFolder={onChooseFolder}
        branches={branches.branches}
        wantBranches={setPickerWants}
      />
      <OperationBar />
      <div className="flex min-h-0 flex-1">
        {!compact && (
          <Rail
            items={tabs}
            value={tab}
            onChange={setTab}
            collapsed={railFolded}
            onCollapse={toggleRail}
            list={sidebar}
            onList={() => {
              setOpenIn(null);
              setSidebar(!sidebar);
            }}
            dimmed={!!repo.view}
          />
        )}
        {repo.view ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-s border-[var(--git-line)] max-sm:border-s-0">
            <Overlay view={repo.view} />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 border-s border-[var(--git-line)] max-sm:border-s-0">
            <ListDetail
              id="side"
              initial={300}
              min={220}
              minOther={320}
              collapsed={!sidebar}
              below={COMPACT_WIDTH}
              open={open}
              onBack={() => setOpenIn(null)}
              backLabel={tab[0].toUpperCase() + tab.slice(1)}
              first={<div className="flex min-h-0 flex-1 flex-col">{left}</div>}
              second={right}
            />
          </div>
        )}
      </div>
      {compact && !alone && !repo.view && <BottomNav items={tabs} value={tab} onChange={setTab} />}
    </div>
  );
}

/** The branch as the window's subtitle says it: main ↑2 ↓1, detached at
 * abc1234, or no commits yet. */
function branchLine(status: Repo['status']): string {
  if (status.detached || !status.branch) return status.head ? `detached at ${shortSha(status.head)}` : 'no commits yet';
  if (status.unborn) return `${status.branch}, no commits yet`;
  const far = !!status.upstream && !status.upstreamGone ? [status.ahead > 0 && `↑${status.ahead}`, status.behind > 0 && `↓${status.behind}`].filter(Boolean) : [];
  return [status.branch, ...far].join(' ');
}
