// A view opened over the tabs (a file's history, blame, a commit, a
// compare) under a bar: back and forward, where it was opened from, what
// it is, and a way out.

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, FileClock, GitCommitHorizontal, GitCompareArrows, ScanSearch, X } from '@hyperpane/icons';
import { keys } from '@hyperpane/sdk/client';
import { ToolButton, cn } from '@hyperpane/ui';
import { type View, useRepo } from '../app/repo.ts';
import { shortSha } from '../lib/format.ts';
import { header } from '../ui/classes.ts';
import { Button } from '../ui/parts.tsx';
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
      <div className={cn(header.base, 'gap-0.5')}>
        <ToolButton label={`Back (${keys('⌘[')})`} icon={ArrowLeft} onClick={repo.back} />
        <ToolButton label={`Forward (${keys('⌘]')})`} icon={ArrowRight} disabled={!repo.canForward} onClick={repo.forward} />
        <nav className="ms-1.5 flex min-w-0 flex-1 items-center gap-1" aria-label="Where you are">
          <button
            type="button"
            className="rounded-control h-7 flex-none px-2 text-[13px] text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:h-9"
            onClick={() => repo.setTab(repo.tab)}
          >
            {tabLabel}
          </button>
          <ChevronRight className="size-3.5 flex-none text-[var(--node-muted)] opacity-50" />
          <span className="flex min-w-0 items-center gap-2 ps-1.5">
            <span className="grid size-6 flex-none place-items-center rounded-control bg-[var(--git-accent-soft)] text-[var(--node-accent)]">
              <Icon className="size-3.5" />
            </span>
            <span className={header.title}>{viewTitle(view)}</span>
          </span>
        </nav>
        {path && view.kind === 'fileHistory' && (
          <Button variant="ghost" className="me-1" onClick={() => repo.open({ kind: 'blame', path })}>
            <ScanSearch variant="outline" />
            Blame
          </Button>
        )}
        {path && view.kind === 'blame' && (
          <Button variant="ghost" className="me-1" onClick={() => repo.open({ kind: 'fileHistory', path })}>
            <FileClock variant="outline" />
            History
          </Button>
        )}
        <ToolButton label={`Close (${keys('⎋')})`} icon={X} onClick={() => repo.setTab(repo.tab)} />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col')}>{body}</div>
    </div>
  );
}
