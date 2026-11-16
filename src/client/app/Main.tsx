// Git: a repository on the window's server, laid out like GitHub Desktop.
// The bar on top has the repository, the branch and the sync button; a bar
// under it says when a merge, rebase, cherry-pick or revert is under way.
// On the left, the tabs (Changes, History, Branches, Stashes, Tags), each a
// list; on the right, what's picked in it: a diff, a commit, a branch
// compared with the current one. File history, blame, commits and compares
// open over the tabs, in this window, with a way back. Everything follows
// the repository as it changes, here, in a terminal or in another app.
//
// Its keys and menu are hooks/useWindowKeys.ts and hooks/useWindowMenu.ts;
// the views over the tabs, views/Overlay.tsx.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Archive, FileDiff, GitBranch, GitCommitHorizontal, History, Tag as TagIcon } from 'lucide-react';
import { keys, useEvent } from '@hyperpane/sdk/client';
import { SplitPane, type TabItem, Tabs, ToolButton } from '@hyperpane/ui';
import type { Found } from '../../shared/index.ts';
import { Blank } from '../components/Blank.tsx';
import { useBranches } from '../hooks/useBranches.ts';
import { useStashes } from '../hooks/useStashes.ts';
import { useTags } from '../hooks/useTags.ts';
import { useWindowKeys } from '../hooks/useWindowKeys.ts';
import { useWindowMenu } from '../hooks/useWindowMenu.ts';
import { shortSha } from '../lib/format.ts';
import { local } from '../lib/local.ts';
import { basenameOf, inRepo, relativeTo } from '../lib/paths.ts';
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
import { Toolbar } from '../views/toolbar/Toolbar.tsx';
import type { BranchPick } from './actions/branches.ts';
import type { Repo, Tab } from './repo.ts';

const TAB_ICONS = { changes: FileDiff, history: History, branches: GitBranch, stashes: Archive, tags: TagIcon } as const;

export function Main({ repo, found, onChooseFolder }: { repo: Repo; found: Found; onChooseFolder(): void }) {
  const { host, status, tab, setTab } = repo;
  const [sidebar, setSidebarState] = useState(() => local.get('sidebar', true));
  const setSidebar = (on: boolean) => {
    setSidebarState(on);
    local.set('sidebar', on);
  };
  const [picked, setPicked] = useState<Pick[]>([]);
  const [commit, setCommit] = useState<string | null>(null);
  const [branch, setBranch] = useState<BranchPick | null>(null);
  const [stash, setStash] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [pickerWants, setPickerWants] = useState(false);
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

  // The window's title: the repository and its branch.
  useEffect(() => {
    host.win.setTitle(`${basenameOf(repo.root)} · ${status.branch ?? (status.head ? `${shortSha(status.head)} (detached)` : 'no commits')}`);
  }, [host, repo.root, status.branch, status.head]);

  useWindowMenu(host, repo, onChooseFolder);

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
      if (f) setPicked([pickOf(sideOf(f, repo.including), rel)]);
    }
    if (host.window) host.app.focusWindow(host.window.id);
  });

  useWindowKeys(repo, sidebar, setSidebar, filters);

  // Narrow, the tabs other than the picked one show as icons.
  const [side, setSide] = useState<HTMLDivElement | null>(null);
  const narrow = useNarrow(side, 380);

  const conflicts = status.files.filter((f) => f.conflict).length;
  const tabs: TabItem<Tab>[] = [
    { value: 'changes', label: 'Changes', icon: TAB_ICONS.changes, count: status.files.length, alert: conflicts > 0 },
    { value: 'history', label: 'History', icon: TAB_ICONS.history },
    { value: 'branches', label: 'Branches', icon: TAB_ICONS.branches },
    { value: 'stashes', label: 'Stashes', icon: TAB_ICONS.stashes, count: status.stashes },
    { value: 'tags', label: 'Tags', icon: TAB_ICONS.tags },
  ];

  let left: ReactNode;
  let right: ReactNode;
  if (tab === 'changes') {
    left = <ChangesList picked={picked} setPicked={setPicked} filterRef={filters.changes} />;
    right = <ChangesDetail picked={picked} />;
  } else if (tab === 'history') {
    left = <HistoryList selected={commit} onSelect={setCommit} filterRef={filters.history} />;
    right = commit ? (
      <CommitDetails key={commit} id={commit} load={() => repo.api.show(commit)} place="history" />
    ) : (
      <Blank icon={GitCommitHorizontal}>Pick a commit</Blank>
    );
  } else if (tab === 'branches') {
    left = <BranchList branches={branches.branches} error={branches.error} picked={branch} onPick={setBranch} filterRef={filters.branches} />;
    right = <BranchDetail pick={branch} branches={branches.branches} />;
  } else if (tab === 'stashes') {
    left = <StashList stashes={stashes.stashes} error={stashes.error} picked={stash} onPick={setStash} />;
    right = <StashDetail stash={stashes.stashes?.find((s) => s.index === stash) ?? null} />;
  } else {
    left = <TagList tags={tags.tags} error={tags.error} picked={tag} onPick={setTag} filterRef={filters.tags} />;
    right = <TagDetail tag={tags.tags?.find((t) => t.name === tag) ?? null} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs text-[var(--node-fg)] select-none" data-git={repo.root}>
      <Toolbar
        found={found}
        onRepo={(r) => host.win.setData('repo', r)}
        onChooseFolder={onChooseFolder}
        sidebar={sidebar}
        onSidebar={() => setSidebar(!sidebar)}
        branches={branches.branches}
        wantBranches={setPickerWants}
      />
      <OperationBar />
      {repo.view ? (
        <Overlay view={repo.view} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {!sidebar && (
            <div className="flex w-9 flex-none flex-col items-center gap-0.5 border-e border-[var(--node-border)] py-1">
              {tabs.map((t) => (
                <ToolButton
                  key={t.value}
                  label={`${t.label} (${keys(`⌃${TABS_ORDER.indexOf(t.value) + 1}`)})`}
                  icon={t.icon!}
                  active={tab === t.value}
                  onClick={() => setTab(t.value)}
                />
              ))}
            </div>
          )}
          <SplitPane
            id="side"
            initial={320}
            min={220}
            minOther={320}
            collapsed={!sidebar}
            first={
              <div ref={setSide} className="flex min-h-0 flex-1 flex-col">
                <Tabs items={tabs} value={tab} onValueChange={setTab} fill compact={narrow} label="Views" />
                {left}
              </div>
            }
            second={right}
          />
        </div>
      )}
    </div>
  );
}

const TABS_ORDER: Tab[] = ['changes', 'history', 'branches', 'stashes', 'tags'];

/** Whether the element is narrower than `width` px, followed as it resizes. */
function useNarrow(el: HTMLElement | null, width: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth < width);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [el, width]);
  return narrow;
}
