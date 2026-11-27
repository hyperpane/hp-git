// Two refs compared: the commits each has that the other hasn't, or the
// files one changed since they parted.

import { type ReactNode, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, TriangleAlert } from '@hyperpane/icons';
import { NodeMessage, SegmentedControl, SplitPane } from '@hyperpane/ui';
import type { Commit, Compare } from '../../../shared/index.ts';
import { commitMenu } from '../../app/actions/commits.ts';
import { useRepo } from '../../app/repo.ts';
import { Authors } from '../../components/Avatar.tsx';
import { Blank } from '../../components/Blank.tsx';
import { VirtualList } from '../../components/VirtualList.tsx';
import { longDate, plural, shortAgo, shortSha } from '../../lib/format.ts';
import { ROW_H, ROW_INSET, rowClass, useRowHeight } from '../../lib/rows.ts';
import { FilesBetween } from '../commit/FilesBetween.tsx';

/** Two refs side by side: the commits on each side (`head` has `ahead`
 * that `base` hasn't, and the other way round), or the files `head`
 * changed since they parted. A commit opens over the tabs. */
export function CompareView({ base, head }: { base: string; head: string }) {
  const repo = useRepo();
  const [state, setState] = useState<{ c?: Compare; error?: string }>({});
  const [show, setShow] = useState<'commits' | 'files'>('commits');
  // Measured once there, so the two lists start with half each.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const p = repo.api.compare(base, head, 500);
    p.promise.then(
      (c) => setState({ c }),
      (e: Error) => e.message !== 'Cancelled.' && setState({ error: e.message }),
    );
    return () => p.cancel();
  }, [repo.api, base, head, repo.version]);
  if (state.error)
    return (
      <Blank icon={TriangleAlert} error title="These can’t be compared">
        {state.error}
      </Blank>
    );
  if (!state.c) return <NodeMessage>Comparing</NodeMessage>;
  const c = state.c;
  return (
    <div ref={setBox} className="flex min-h-0 flex-1 flex-col" data-compare={`${base}...${head}`}>
      <div className="flex h-10 flex-none items-center gap-3 border-b border-[var(--git-line)] px-3.5 text-xs text-[var(--node-muted)] touch:h-12">
        <SegmentedControl
          size="sm"
          label="What to compare"
          value={show}
          onValueChange={(v) => setShow(v as 'commits' | 'files')}
          options={[
            { value: 'commits', label: 'Commits' },
            { value: 'files', label: 'Files', disabled: !c.mergeBase },
          ]}
        />
        <span className="min-w-0 flex-1 truncate">
          {c.mergeBase ? `They parted at ${shortSha(c.mergeBase)}` : 'They share no history'}
          {show === 'files' && c.mergeBase ? ` · what ${head} changed since` : ''}
        </span>
      </div>
      {show === 'files' && c.mergeBase ? (
        <FilesBetween from={c.mergeBase} to={head} place="compare" />
      ) : !box ? null : (
        <SplitPane
          id="compare"
          direction="column"
          initial={box.clientHeight ? Math.max(80, Math.round((box.clientHeight - 40) / 2)) : 200}
          min={80}
          minOther={80}
          first={
            <CommitColumn
              icon={<ArrowUpRight className="size-3.5 text-[var(--git-added)]" />}
              count={c.aheadCount}
              title={`on ${head} not on ${base}`}
              empty={`${base} has every commit of ${head}`}
              commits={c.ahead}
            />
          }
          second={
            <CommitColumn
              icon={<ArrowDownLeft className="size-3.5 text-[var(--git-remote)]" />}
              count={c.behindCount}
              title={`on ${base} not on ${head}`}
              empty={`${head} has every commit of ${base}`}
              commits={c.behind}
            />
          }
        />
      )}
    </div>
  );
}

function CommitColumn({ icon, count, title, empty, commits }: { icon: ReactNode; count: number; title: string; empty: string; commits: Commit[] }) {
  const repo = useRepo();
  const rowHeight = useRowHeight(ROW_H);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center gap-2 px-3.5 pt-1 text-xs">
        {icon}
        <span className="font-medium tabular-nums">{plural(count, 'commit')}</span>{' '}
        <span className="min-w-0 truncate text-[var(--node-muted)]">{title}</span>
      </div>
      {commits.length ? (
        <VirtualList
          count={commits.length}
          rowHeight={rowHeight}
          className="group/list git-scroll pb-1.5"
          row={(n) => {
            const c = commits[n];
            return (
              <div className={ROW_INSET}>
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
                  <span className="font-mono text-xs text-[var(--node-muted)]">{shortSha(c.sha)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  <Authors commit={c} size={18} />
                  <span className="w-8 flex-none text-right text-xs whitespace-nowrap text-[var(--node-muted)] tabular-nums" title={longDate(c.date)}>
                    {shortAgo(c.date)}
                  </span>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <p className="flex items-center gap-1.5 px-3.5 py-1 text-xs text-[var(--node-muted)]">
          <Check className="size-3.5 flex-none opacity-70" />
          <span className="min-w-0 truncate">{empty}</span>
        </p>
      )}
    </div>
  );
}
