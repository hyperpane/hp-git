// The Tags tab: tags newest first (annotated ones with their message and
// tagger), make one, push one or all, delete one here or on the remote; the
// picked tag's commit on the right.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Tag as TagIcon, TriangleAlert } from '@hyperpane/icons';
import { keys } from '@hyperpane/sdk/client';
import { NodeMessage, ToolButton, cn, menuItems } from '@hyperpane/ui';
import type { Tag } from '../../../shared/index.ts';
import { createTag, tagActions } from '../../app/actions/tags.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { ago, longDate, plural, shortSha } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { ROW_H_TALL, ROW_INSET_TALL, rowClass } from '../../lib/rows.ts';
import { footer, header } from '../../ui/classes.ts';
import { Button, SearchField } from '../../ui/parts.tsx';

export function TagList({
  tags,
  error,
  picked,
  onPick,
  onOpen,
  filterRef,
}: {
  tags: Tag[] | null;
  error: string | null;
  picked: string | null;
  onPick: React.Dispatch<React.SetStateAction<string | null>>;
  /** A tag clicked: it, when one at a time. */
  onOpen?(): void;
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
      <div className={cn(header.base, 'gap-1')}>
        <SearchField
          inputRef={filterRef}
          placeholder="Filter tags"
          aria-label="Filter tags"
          title={`Filter tags (${keys('⌘F')})`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter('')}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown') return;
            list.current?.element?.focus();
            e.preventDefault();
          }}
        />
        <ToolButton label="New tag" icon={Plus} disabled={!repo.status.head} onClick={() => createTag(repo)} />
      </div>
      {error && !tags ? (
        <Blank icon={TriangleAlert} error title="Tags can’t be listed">
          {error}
        </Blank>
      ) : !tags ? (
        <NodeMessage>Loading</NodeMessage>
      ) : !shown.length ? (
        <Blank
          icon={TagIcon}
          title={filter ? undefined : 'No tags'}
          actions={!filter && repo.status.head ? <Button variant="primary" onClick={() => createTag(repo)}>Tag the Current Commit</Button> : undefined}
        >
          {filter ? 'No tag matches' : 'Tags name commits that matter: releases, milestones'}
        </Blank>
      ) : (
        <VirtualList
          ref={list}
          count={shown.length}
          rowHeight={ROW_H_TALL}
          className="group/list git-scroll py-1.5"
          tabIndex={0}
          role="listbox"
          ariaLabel="Tags"
          onKeyDown={onKey}
          row={(n) => {
            const t = shown[n];
            return (
              <div className={ROW_INSET_TALL} data-tag={t.name}>
                <div
                  className={cn(rowClass(t.name === picked), 'gap-2.5 px-2.5')}
                  onClick={() => {
                    onPick(t.name);
                    onOpen?.();
                  }}
                  onContextMenu={(e) => menu(e, t)}
                  title={`${t.name}${t.message ? `\n${t.message}` : ''}\n${longDate(t.date)}`}
                >
                  <span className="grid size-7 flex-none place-items-center rounded-control bg-[color-mix(in_srgb,var(--git-tag)_14%,transparent)] text-[var(--git-tag)]">
                    <TagIcon variant="outline" className="size-3.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate leading-4 font-medium">{t.name}</span>
                    <span className="truncate text-xs leading-4 text-[var(--node-muted)]">
                      <span className="font-mono">{shortSha(t.sha)}</span>
                      {t.annotated ? ` · ${t.message?.split('\n')[0] ?? ''}` : ' · lightweight'}
                    </span>
                  </div>
                  <span className="flex-none self-start pt-1 text-xs text-[var(--node-muted)] tabular-nums">{ago(t.date)}</span>
                </div>
              </div>
            );
          }}
        />
      )}
      {tags && tags.length > 0 && (
        <div className={footer}>
          {plural(tags.length, 'tag')}
        </div>
      )}
    </div>
  );
}
