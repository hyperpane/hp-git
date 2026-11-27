// The Stashes tab: changes put aside, newest first, with their message,
// branch and age; stash what's changed now (with a message, untracked files
// or not); a stash's files and diffs on the right, to apply, pop or drop.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useRef } from 'react';
import { Archive, Plus, TriangleAlert } from '@hyperpane/icons';
import { NodeMessage, ToolButton, cn, menuItems } from '@hyperpane/ui';
import type { Stash } from '../../../shared/index.ts';
import { stashActions, stashNow } from '../../app/actions/stashes.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { ago, longDate, plural } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { ROW_H_TALL, ROW_INSET_TALL, rowClass } from '../../lib/rows.ts';
import { header } from '../../ui/classes.ts';
import { Button } from '../../ui/parts.tsx';

export function StashList({
  stashes,
  error,
  picked,
  onPick,
  onOpen,
}: {
  stashes: Stash[] | null;
  error: string | null;
  picked: number | null;
  onPick: React.Dispatch<React.SetStateAction<number | null>>;
  /** A stash clicked: it, when one at a time. */
  onOpen?(): void;
}) {
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
      <div className={cn(header.base, 'ps-3.5')}>
        <span className={cn(header.meta, 'flex-1 font-medium')}>{stashes ? plural(stashes.length, 'stash', 'stashes') : ''}</span>
        <ToolButton label="Stash the changes" icon={Plus} onClick={() => stashNow(repo)} disabled={!repo.status.files.length} />
      </div>
      {error && !stashes ? (
        <Blank icon={TriangleAlert} error title="Stashes can’t be listed">
          {error}
        </Blank>
      ) : !stashes ? (
        <NodeMessage>Loading</NodeMessage>
      ) : !stashes.length ? (
        <Blank
          icon={Archive}
          title="No stashes"
          actions={
            repo.status.files.length ? <Button variant="primary" onClick={() => stashNow(repo)}>Stash {plural(repo.status.files.length, 'Change')}</Button> : undefined
          }
        >
          Stash changes to put them aside, switch branches, and bring them back later
        </Blank>
      ) : (
        <VirtualList
          ref={list}
          count={stashes.length}
          rowHeight={ROW_H_TALL}
          className="group/list git-scroll py-1.5"
          tabIndex={0}
          role="listbox"
          ariaLabel="Stashes"
          onKeyDown={onKey}
          row={(n) => {
            const s = stashes[n];
            return (
              <div className={ROW_INSET_TALL} data-stash={s.index}>
                <div
                  className={cn(rowClass(s.index === picked), 'gap-2.5 px-2.5')}
                  onClick={() => {
                    onPick(s.index);
                    onOpen?.();
                  }}
                  onContextMenu={(e) => menu(e, s)}
                  title={`${s.message}\n${longDate(s.date)}`}
                >
                  <span className="grid size-7 flex-none place-items-center rounded-control bg-[color-mix(in_srgb,var(--git-stash)_14%,transparent)] text-[var(--git-stash)]">
                    <Archive variant="outline" className="size-3.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate leading-4">{s.message}</span>
                    <span className="truncate text-xs leading-4 text-[var(--node-muted)]">
                      stash@{`{${s.index}}`}
                      {s.branch ? ` · on ${s.branch}` : ''}
                    </span>
                  </div>
                  <span className="flex-none self-start pt-1 text-xs text-[var(--node-muted)] tabular-nums">{ago(s.date)}</span>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
