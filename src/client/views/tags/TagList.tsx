// The Tags tab: tags newest first (annotated ones with their message and
// tagger), make one, push one or all, delete one here or on the remote; the
// picked tag's commit on the right.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Tag as TagIcon } from 'lucide-react';
import { keys } from '@hyperpane/sdk/client';
import { NodeButton, NodeInput, NodeMessage, ToolButton, menuItems } from '@hyperpane/ui';
import type { Tag } from '../../../shared/index.ts';
import { createTag, tagActions } from '../../app/actions/tags.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { ago, longDate, plural, shortSha } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { rowClass } from '../../lib/rows.ts';

export function TagList({
  tags,
  error,
  picked,
  onPick,
  filterRef,
}: {
  tags: Tag[] | null;
  error: string | null;
  picked: string | null;
  onPick: React.Dispatch<React.SetStateAction<string | null>>;
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const repo = useRepo();
  const [filter, setFilter] = useState('');
  const list = useRef<VirtualHandle>(null);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (tags ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.message?.toLowerCase().includes(q));
  }, [tags, filter]);
  const at = shown.findIndex((t) => t.name === picked);
  useEffect(() => {
    if (shown.length) onPick((cur) => (cur && shown.some((t) => t.name === cur) ? cur : shown[0].name));
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (e: ReactMouseEvent, t: Tag) => {
    e.preventDefault();
    e.stopPropagation();
    onPick(t.name);
    const items = tagActions(repo, t);
    repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };
  const onKey = (e: KeyboardEvent) => {
    const next = listKey(e, at, shown.length, 10);
    if (next === null) return;
    onPick(shown[next].name);
    list.current?.scrollToIndex(next);
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] px-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput ref={filterRef} className="w-full ps-6" placeholder={`Filter tags (${keys('⌘F')})`} value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === 'ArrowDown' && (list.current?.element?.focus(), e.preventDefault())} />
        </div>
        <ToolButton label="New tag" icon={Plus} disabled={!repo.status.head} onClick={() => createTag(repo)} />
      </div>
      {error && !tags ? (
        <NodeMessage error>{error}</NodeMessage>
      ) : !tags ? (
        <NodeMessage>Loading…</NodeMessage>
      ) : !shown.length ? (
        <Blank icon={TagIcon} title={filter ? undefined : 'No tags'} actions={!filter && repo.status.head ? <NodeButton onClick={() => createTag(repo)}>Tag the Current Commit</NodeButton> : undefined}>
          {filter ? 'No tag matches.' : 'Tags name commits that matter: releases, milestones.'}
        </Blank>
      ) : (
        <VirtualList
          ref={list}
          count={shown.length}
          rowHeight={36}
          className="group/list git-scroll py-1"
          tabIndex={0}
          role="listbox"
          ariaLabel="Tags"
          onKeyDown={onKey}
          row={(n) => {
            const t = shown[n];
            return (
              <div className="h-full px-1 py-px" data-tag={t.name}>
                <div className={rowClass(t.name === picked)} onClick={() => onPick(t.name)} onContextMenu={(e) => menu(e, t)} title={`${t.name}${t.message ? `\n${t.message}` : ''}\n${longDate(t.date)}`}>
                  <TagIcon className="size-3.5 flex-none text-[var(--ansi-3)]" />
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-medium">{t.name}</span>
                    <span className="truncate text-[10px] text-[var(--node-muted)]">
                      {shortSha(t.sha)}
                      {t.annotated ? ` · ${t.message?.split('\n')[0] ?? ''}` : ' · lightweight'}
                    </span>
                  </div>
                  <span className="flex-none text-[10px] text-[var(--node-muted)]">{ago(t.date)}</span>
                </div>
              </div>
            );
          }}
        />
      )}
      {tags && tags.length > 0 && <div className="flex h-6 flex-none items-center border-t border-[var(--node-border)] px-2 text-2xs text-[var(--node-muted)]">{plural(tags.length, 'tag')}</div>}
    </div>
  );
}
