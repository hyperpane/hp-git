// Two refs compared: the commits each has that the other hasn't, or the
// files one changed since they parted.

import { type ReactNode, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { NodeMessage, SegmentedControl } from '@hyperpane/ui';
import type { Commit, Compare } from '../../../shared/index.ts';
import { commitMenu } from '../../app/actions/commits.ts';
import { useRepo } from '../../app/repo.ts';
import { Authors } from '../../components/Avatar.tsx';
import { Blank } from '../../components/Blank.tsx';
import { Split } from '../../components/Split.tsx';
import { VirtualList } from '../../components/VirtualList.tsx';
import { longDate, plural, shortAgo, shortSha } from '../../lib/format.ts';
import { rowClass } from '../../lib/rows.ts';
import { FilesBetween } from '../commit/FilesBetween.tsx';

/** Two refs side by side: the commits on each side (`head` has `ahead`
 * that `base` hasn't, and the other way round), or the files `head`
 * changed since they parted. A commit opens over the tabs. */
export function CompareView({ base, head }: { base: string; head: string }) {
  const repo = useRepo();
  const [state, setState] = useState<{ c?: Compare; error?: string }>({});
  const [show, setShow] = useState<'commits' | 'files'>('commits');
  useEffect(() => {
    const p = repo.api.compare(base, head, 500);
    p.promise.then(
      (c) => setState({ c }),
      (e: Error) => e.message !== 'Cancelled.' && setState({ error: e.message }),
    );
    return () => p.cancel();
  }, [repo.api, base, head, repo.version]);
  if (state.error) return <NodeMessage error>{state.error}</NodeMessage>;
  if (!state.c) return <NodeMessage>Comparing…</NodeMessage>;
  const c = state.c;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-compare={`${base}...${head}`}>
      <div className="flex h-8 flex-none items-center gap-2 border-b border-[var(--node-border)] px-3 text-2xs text-[var(--node-muted)]">
        <SegmentedControl
          size="xs"
          label="What to compare"
          value={show}
          onValueChange={(v) => setShow(v as 'commits' | 'files')}
          options={[
            { value: 'commits', label: 'Commits' },
            { value: 'files', label: 'Files', disabled: !c.mergeBase },
          ]}
        />
        <span className="min-w-0 flex-1 truncate">
          {c.mergeBase ? `They parted at ${shortSha(c.mergeBase)}` : 'They share no history.'}
          {show === 'files' && c.mergeBase ? ` · what ${head} changed since` : ''}
        </span>
      </div>
      {show === 'files' && c.mergeBase ? (
        <FilesBetween from={c.mergeBase} to={head} place="compare" />
      ) : (
        <Split
          id="compare"
          direction="column"
          initial={0.5}
          min={80}
          minOther={80}
          first={<CommitColumn icon={<ArrowUpRight className="size-3.5 text-[var(--ansi-2)]" />} title={`${plural(c.aheadCount, 'commit')} on ${head} not on ${base}`} commits={c.ahead} />}
          second={<CommitColumn icon={<ArrowDownLeft className="size-3.5 text-[var(--ansi-4)]" />} title={`${plural(c.behindCount, 'commit')} on ${base} not on ${head}`} commits={c.behind} />}
        />
      )}
    </div>
  );
}

function CommitColumn({ icon, title, commits }: { icon: ReactNode; title: string; commits: Commit[] }) {
  const repo = useRepo();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 flex-none items-center gap-1.5 border-b border-[var(--node-border)] px-3 text-2xs font-medium">
        {icon}
        {title}
      </div>
      {commits.length ? (
        <VirtualList
          count={commits.length}
          rowHeight={24}
          className="group/list git-scroll py-1"
          row={(n) => {
            const c = commits[n];
            return (
              <div className="h-full px-1">
                <div
                  className={rowClass(false)}
                  onClick={() => repo.open({ kind: 'commit', sha: c.sha })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commitMenu(repo, c, e);
                  }}
                  title={`${c.subject}\n${c.author} · ${longDate(c.date)}`}
                >
                  <span className="font-mono text-2xs text-[var(--node-muted)]">{shortSha(c.sha)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  <Authors commit={c} size={16} />
                  <span className="w-7 flex-none text-right text-2xs whitespace-nowrap text-[var(--node-muted)] tabular-nums" title={longDate(c.date)}>
                    {shortAgo(c.date)}
                  </span>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <Blank>Nothing.</Blank>
      )}
    </div>
  );
}
