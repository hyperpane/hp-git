// A file's history, over the tabs: the commits that touched it (following
// renames, with the path it had in each), a page at a time, and the picked
// commit's change to it beside them.

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { FileClock } from 'lucide-react';
import { NodeMessage } from '@hyperpane/ui';
import type { FileCommit } from '../../shared/index.ts';
import { commitMenu } from '../app/actions/commits.ts';
import { useRepo } from '../app/repo.ts';
import { Authors } from '../components/Avatar.tsx';
import { Blank } from '../components/Blank.tsx';
import { DiffPane } from '../components/diff/DiffPane.tsx';
import { Split } from '../components/Split.tsx';
import { StatusLetter } from '../components/StatusLetter.tsx';
import { type VirtualHandle, VirtualList } from '../components/VirtualList.tsx';
import { ago, longDate, shortSha } from '../lib/format.ts';
import { listKey } from '../lib/listKey.ts';
import { authorNames } from '../lib/people.ts';
import { rowClass } from '../lib/rows.ts';

const PAGE = 200;

export function FileHistory({ path }: { path: string }) {
  const repo = useRepo();
  const [commits, setCommits] = useState<FileCommit[]>([]);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const pending = useRef<{ cancel(): void } | null>(null);
  const list = useRef<VirtualHandle>(null);
  const latest = useRef(commits);
  latest.current = commits;

  const load = (skip: number) => {
    pending.current?.cancel();
    const p = repo.api.fileLog(path, skip, PAGE);
    pending.current = p;
    setLoading(true);
    p.promise.then(
      (page) => {
        setCommits((was) => (skip ? [...was, ...page.commits] : page.commits));
        setMore(page.more);
        setLoading(false);
        setError(null);
      },
      (e: Error) => {
        if (e.message === 'Cancelled.') return;
        setError(e.message);
        setLoading(false);
        setMore(false);
      },
    );
  };
  useEffect(() => {
    load(0);
    return () => pending.current?.cancel();
  }, [path, repo.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (commits.length) setPicked((cur) => (cur && commits.some((c) => c.sha === cur) ? cur : commits[0].sha));
  }, [commits]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = commits.findIndex((c) => c.sha === picked);
  const c = commits[at];
  const onKey = (e: KeyboardEvent) => {
    const next = listKey(e, at, commits.length, 12);
    if (next === null) return;
    setPicked(commits[next].sha);
    list.current?.scrollToIndex(next);
    e.preventDefault();
    e.stopPropagation();
  };

  if (error && !commits.length) return <NodeMessage error>{error}</NodeMessage>;
  if (!commits.length) return loading ? <NodeMessage>Loading the history of {path}…</NodeMessage> : <Blank icon={FileClock}>No commit has touched {path}.</Blank>;
  return (
    <Split
      id="fileHistory"
      initial={300}
      min={200}
      minOther={300}
      first={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-8 flex-none items-center gap-1.5 border-b border-[var(--node-border)] px-2.5 text-2xs text-[var(--node-muted)]">
            <FileClock className="size-3.5" />
            {commits.length}
            {more ? '+' : ''} commits
          </div>
          <VirtualList
            ref={list}
            count={commits.length}
            rowHeight={40}
            onEnd={() => more && !loading && load(latest.current.length)}
            className="group/list git-scroll py-1"
            tabIndex={0}
            role="listbox"
            ariaLabel={`Commits that touched ${path}`}
            onKeyDown={onKey}
            row={(n) => {
              const x = commits[n];
              return (
                <div className="h-full px-1 py-px" data-sha={x.sha}>
                  <div
                    className={rowClass(x.sha === picked)}
                    onClick={() => setPicked(x.sha)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPicked(x.sha);
                      commitMenu(repo, x, e);
                    }}
                    title={`${x.subject}\n${authorNames(x)} · ${longDate(x.date)}\n${x.path}`}
                  >
                    <Authors commit={x} size={20} max={2} />
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate">{x.subject}</span>
                      <span className="flex min-w-0 items-center gap-1 text-[10px] text-[var(--node-muted)]">
                        <span className="font-mono">{shortSha(x.sha)}</span>
                        <span className="truncate">
                          {authorNames(x)} · {ago(x.date)}
                          {x.from ? ` · renamed from ${x.from}` : x.path !== path ? ` · as ${x.path}` : ''}
                        </span>
                      </span>
                    </div>
                    <StatusLetter letter={x.status} />
                  </div>
                </div>
              );
            }}
          />
        </div>
      }
      second={c ? <DiffPane key={c.sha} request={{ path: c.path, oldPath: c.from, commit: c.sha }} newRev={c.sha} /> : <Blank>Pick a commit.</Blank>}
    />
  );
}
