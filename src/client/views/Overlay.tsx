// A view opened over the tabs (a file's history, blame, a commit, a
// compare) under a bar: back and forward, where it was opened from, what
// it is, and a way out.

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, FileClock, GitCommitHorizontal, GitCompareArrows, ScanSearch, X } from 'lucide-react';
import { keys } from '@hyperpane/sdk/client';
import { NodeButton, ToolButton, cn } from '@hyperpane/ui';
import { type View, useRepo } from '../app/repo.ts';
import { shortSha } from '../lib/format.ts';
import { BlameView } from './Blame.tsx';
import { CompareView } from './branches/CompareView.tsx';
import { CommitDetails } from './commit/CommitDetails.tsx';
import { FilesBetween } from './commit/FilesBetween.tsx';
import { FileHistory } from './FileHistory.tsx';

const VIEW_ICON = { fileHistory: FileClock, blame: ScanSearch, commit: GitCommitHorizontal, compare: GitCompareArrows } as const;

function viewTitle(v: View): string {
  if (v.kind === 'fileHistory') return `History of ${v.path}`;
  if (v.kind === 'blame') return `Blame of ${v.path}${v.rev ? ` at ${shortSha(v.rev)}` : ''}`;
  if (v.kind === 'commit') return `Commit ${shortSha(v.sha)}`;
  return v.head ? `${v.head} compared with ${v.base}` : `${shortSha(v.base)} compared with the working tree`;
}

/** A view over the tabs, under a bar with the way back. */
export function Overlay({ view }: { view: View }) {
  const repo = useRepo();
  const Icon = VIEW_ICON[view.kind];
  const tabLabel = repo.tab[0].toUpperCase() + repo.tab.slice(1);
  let body: ReactNode;
  if (view.kind === 'fileHistory') body = <FileHistory key={view.path} path={view.path} />;
  else if (view.kind === 'blame') body = <BlameView key={`${view.path}@${view.rev ?? ''}`} path={view.path} rev={view.rev} line={view.line} />;
  else if (view.kind === 'commit') body = <CommitDetails key={view.sha} id={view.sha} load={() => repo.api.show(view.sha)} place="overlay" />;
  else if (view.head) body = <CompareView base={view.base} head={view.head} />;
  else body = <FilesBetween from={view.base} place="worktree" />;
  const path = view.kind === 'fileHistory' || view.kind === 'blame' ? view.path : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-view={view.kind}>
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] bg-[color-mix(in_srgb,var(--node-header)_60%,transparent)] px-1.5">
        <ToolButton label={`Back (${keys('⌘[')})`} icon={ArrowLeft} onClick={repo.back} />
        <ToolButton label={`Forward (${keys('⌘]')})`} icon={ArrowRight} disabled={!repo.canForward} onClick={repo.forward} />
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-xs" aria-label="Where you are">
          <button type="button" className="rounded-chip flex-none px-1 text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]" onClick={() => repo.setTab(repo.tab)}>
            {tabLabel}
          </button>
          <ChevronRight className="size-3 flex-none text-[var(--node-muted)]" />
          <Icon className="size-3.5 flex-none text-[var(--node-muted)]" />
          <span className="truncate font-medium">{viewTitle(view)}</span>
        </nav>
        {path && view.kind === 'fileHistory' && <NodeButton onClick={() => repo.open({ kind: 'blame', path })}>Blame</NodeButton>}
        {path && view.kind === 'blame' && <NodeButton onClick={() => repo.open({ kind: 'fileHistory', path })}>History</NodeButton>}
        <ToolButton label={`Close (${keys('⎋')})`} icon={X} onClick={() => repo.setTab(repo.tab)} />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col')}>{body}</div>
    </div>
  );
}
