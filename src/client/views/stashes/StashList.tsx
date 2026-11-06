// The Stashes tab: changes put aside, newest first, with their message,
// branch and age; stash what's changed now (with a message, untracked files
// or not); a stash's files and diffs on the right, to apply, pop or drop.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useRef } from 'react';
import { Archive, Plus } from 'lucide-react';
import { NodeButton, NodeMessage, ToolButton, menuItems } from '@hyperpane/ui';
import type { Stash } from '../../../shared/index.ts';
import { stashActions, stashNow } from '../../app/actions/stashes.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { ago, longDate, plural } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { rowClass } from '../../lib/rows.ts';

export function StashList({ stashes, error, picked, onPick }: { stashes: Stash[] | null; error: string | null; picked: number | null; onPick: React.Dispatch<React.SetStateAction<number | null>> }) {
  const repo = useRepo();
  const list = useRef<VirtualHandle>(null);
  const at = stashes?.findIndex((s) => s.index === picked) ?? -1;
  useEffect(() => {
    if (stashes?.length) onPick((cur) => (cur !== null && stashes.some((s) => s.index === cur) ? cur : stashes[0].index));
  }, [stashes]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (e: ReactMouseEvent, s: Stash) => {
    e.preventDefault();
    e.stopPropagation();
    onPick(s.index);
    const items = stashActions(repo, s);
    repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      item?.run();
    });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!stashes) return;
    const next = listKey(e, at, stashes.length, 10);
    if (next !== null) {
      onPick(stashes[next].index);
      list.current?.scrollToIndex(next);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && stashes[at]) stashActions(repo, stashes[at])[2].run();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] ps-2.5 pe-1.5 text-2xs text-[var(--node-muted)]">
        <span className="flex-1">{stashes ? plural(stashes.length, 'stash', 'stashes') : ''}</span>
        <ToolButton label="Stash the changes" icon={Plus} onClick={() => stashNow(repo)} disabled={!repo.status.files.length} />
      </div>
      {error && !stashes ? (
        <NodeMessage error>{error}</NodeMessage>
      ) : !stashes ? (
        <NodeMessage>Loading…</NodeMessage>
      ) : !stashes.length ? (
        <Blank
          icon={Archive}
          title="No stashes"
          actions={
            repo.status.files.length ? <NodeButton onClick={() => stashNow(repo)}>Stash {plural(repo.status.files.length, 'Change')}</NodeButton> : undefined
          }
        >
          Stash changes to put them aside, switch branches, and bring them back later.
        </Blank>
      ) : (
        <VirtualList
          ref={list}
          count={stashes.length}
          rowHeight={36}
          className="group/list git-scroll py-1"
          tabIndex={0}
          role="listbox"
          ariaLabel="Stashes"
          onKeyDown={onKey}
          row={(n) => {
            const s = stashes[n];
            return (
              <div className="h-full px-1 py-px" data-stash={s.index}>
                <div className={rowClass(s.index === picked)} onClick={() => onPick(s.index)} onContextMenu={(e) => menu(e, s)} title={`${s.message}\n${longDate(s.date)}`}>
                  <Archive className="size-3.5 flex-none text-[var(--node-muted)]" />
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{s.message}</span>
                    <span className="truncate text-[10px] text-[var(--node-muted)]">
                      stash@{`{${s.index}}`}
                      {s.branch ? ` · on ${s.branch}` : ''}
                    </span>
                  </div>
                  <span className="flex-none text-[10px] text-[var(--node-muted)]">{ago(s.date)}</span>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
