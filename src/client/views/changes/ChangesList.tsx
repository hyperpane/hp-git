// The Changes tab's list: the files that changed, in four sections
// (conflicts, staged, changes, untracked), flat or by folder, each with a
// checkbox (checked: in the next commit); and the commit box under them.
// The rows are ChangeRows.tsx, their menus menus.ts.

import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, FolderTree, List, MoreHorizontal, Search } from 'lucide-react';
import { keys, mod, shortcutKey } from '@hyperpane/sdk/client';
import { NodeInput, ToolButton, menuItems } from '@hyperpane/ui';
import type { FileStatus } from '../../../shared/index.ts';
import { fileActions } from '../../app/actions/files.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { Checkbox } from '../../components/Checkbox.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { type Item, itemKey, items } from '../../lib/changeRows.ts';
import { plural } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { local } from '../../lib/local.ts';
import { type Pick, type Side, pickOf, sideFiles, splitPick } from '../../lib/picks.ts';
import { DirRow, FileRow, SectionRow } from './ChangeRows.tsx';
import { CommitBox } from './CommitBox.tsx';
import { changesMenu, fileMenu } from './menus.ts';

export function ChangesList({
  picked,
  setPicked,
  filterRef,
}: {
  picked: Pick[];
  setPicked: React.Dispatch<React.SetStateAction<Pick[]>>;
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const repo = useRepo();
  const { status, api, host } = repo;
  const [filter, setFilter] = useState('');
  const [tree, setTreeState] = useState(() => local.get('tree', false));
  const setTree = (t: boolean) => {
    setTreeState(t);
    local.set('tree', t);
  };
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const list = useRef<VirtualHandle>(null);
  const anchor = useRef<string | null>(null);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sideFiles(q ? status.files.filter((f) => f.path.toLowerCase().includes(q) || f.from?.toLowerCase().includes(q)) : status.files);
  }, [status.files, filter]);
  const rows = useMemo(() => items(groups, tree, closed), [groups, tree, closed]);
  const pickedSet = useMemo(() => new Set<string>(picked), [picked]);

  // Keep a pick that's still there; else the first file. (From the pick as
  // it is then: one made meanwhile stays.)
  useEffect(() => {
    const there = new Set(rows.filter((r) => r.t === 'file').map(itemKey));
    setPicked((picked) => {
      const kept = picked.filter((p) => there.has(p));
      if (kept.length === picked.length && (kept.length || !there.size)) return picked;
      // A file staged or unstaged whole moves section: follow it.
      const moved = picked.map((p) => {
        if (there.has(p)) return p;
        const [, path] = splitPick(p);
        return [...there].find((k) => splitPick(k as Pick)[1] === path) as Pick | undefined;
      });
      const next = [...new Set(moved.filter(Boolean) as Pick[])];
      const first = rows.find((r) => r.t === 'file');
      return next.length ? next : first ? [itemKey(first) as Pick] : [];
    });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const filesOf = (keys: string[]): { side: Side; file: FileStatus }[] => {
    const out: { side: Side; file: FileStatus }[] = [];
    for (const k of keys) {
      const [side, path] = splitPick(k as Pick);
      const file = status.files.find((f) => f.path === path);
      if (file) out.push({ side, file });
    }
    return out;
  };

  const actions = fileActions(repo);
  const { stage, unstage, toggle, discard } = actions;

  const click = (it: Item, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const k = itemKey(it);
    if (it.t === 'section') {
      setClosed((c) => {
        const n = new Set(c);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
      return;
    }
    if (it.t === 'dir') {
      const files = it.files.map((f) => pickOf(it.side, f.path));
      anchor.current = k;
      setPicked(files);
      return;
    }
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => itemKey(r) === anchor.current);
      const b = rows.indexOf(it);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setPicked(rows.slice(lo, hi + 1).filter((r) => r.t === 'file').map(itemKey) as Pick[]);
      return;
    }
    anchor.current = k;
    if (mod(e)) setPicked(pickedSet.has(k) ? picked.filter((p) => p !== k) : [...picked, k as Pick]);
    else setPicked([k as Pick]);
  };

  const onKey = (e: KeyboardEvent) => {
    // From the ref: keys that come faster than renders still move one by one.
    const at = rows.findIndex((r) => itemKey(r) === (anchor.current ?? picked[0]));
    const next = listKey(e, at, rows.length, 12);
    const cur = rows[at];
    if (next !== null) {
      // Over the section headers, the way it moves (or back, at an end).
      const dir = next >= at ? 1 : -1;
      let n = next;
      while (rows[n]?.t === 'section') n += dir;
      if (!rows[n]) for (n = next; rows[n]?.t === 'section'; ) n -= dir;
      const it = rows[n];
      if (it) {
        if (e.shiftKey && it.t === 'file') {
          setPicked([...new Set([...picked, itemKey(it) as Pick])]);
          anchor.current = itemKey(it);
        } else {
          anchor.current = itemKey(it);
          click(it, { shiftKey: false, metaKey: false, ctrlKey: false });
        }
        list.current?.scrollToIndex(n);
      }
    } else if (e.key === ' ') {
      const chosen = filesOf(picked);
      const bySide = new Map<Side, FileStatus[]>();
      chosen.forEach(({ side, file }) => bySide.set(side, [...(bySide.get(side) ?? []), file]));
      for (const [side, files] of bySide) toggle(side, files);
    } else if (e.key === 'Enter') {
      (document.querySelector('[data-diff-pane] [tabindex="0"]') as HTMLElement | null)?.focus();
    } else if (e.key === 'ArrowRight' && cur?.t === 'dir') {
      setClosed((c) => new Set([...c].filter((x) => x !== `${cur.side}:${cur.path}`)));
    } else if (e.key === 'ArrowLeft' && cur?.t === 'dir') {
      setClosed((c) => new Set([...c, `${cur.side}:${cur.path}`]));
    } else if (e.key === 'Delete' || (e.key === 'Backspace' && mod(e))) {
      discard(filesOf(picked).filter((x) => x.side !== 'staged' || true).map((x) => x.file));
    } else if (shortcutKey(e) === 'a' && mod(e)) {
      setPicked(rows.filter((r) => r.t === 'file').map(itemKey) as Pick[]);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const menu = (e: ReactMouseEvent, it: Item) => {
    e.preventDefault();
    e.stopPropagation();
    if (it.t === 'section') return;
    const k = itemKey(it);
    let chosen: { side: Side; file: FileStatus }[];
    if (it.t === 'dir') chosen = it.files.map((file) => ({ side: it.side, file }));
    else {
      if (!pickedSet.has(k)) {
        setPicked([k as Pick]);
        chosen = [{ side: it.side, file: it.file }];
      } else chosen = filesOf(picked);
    }
    const items = fileMenu(repo, it, chosen, actions);
    host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  const moreMenu = (e: ReactMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items = changesMenu(repo, groups, discard);
    host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  const total = status.files.length;
  const stagedCount = groups.staged.length;
  const allChecked: boolean | 'mixed' = total === 0 ? false : stagedCount === 0 ? false : groups.unstaged.length + groups.untracked.length + groups.conflict.length === 0 ? true : 'mixed';

  const row = (n: number) => {
    const it = rows[n];
    if (it.t === 'section') return <SectionRow it={it} files={groups[it.side]} open={!closed.has(`section:${it.side}`)} click={click} stage={stage} unstage={unstage} />;
    if (it.t === 'dir') return <DirRow it={it} open={!closed.has(`${it.side}:${it.path}`)} click={click} menu={menu} toggle={toggle} setClosed={setClosed} />;
    return <FileRow it={it} isPicked={pickedSet.has(itemKey(it))} tree={tree} click={click} menu={menu} toggle={toggle} />;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center gap-1 border-b border-[var(--node-border)] px-1.5">
        <Checkbox checked={allChecked} label={allChecked === true ? 'Unstage everything' : 'Stage everything'} onChange={(on) => repo.run(() => (on ? api.stage('all') : api.unstage('all')))} disabled={!total} className="mx-1" />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput
            ref={filterRef}
            className="w-full ps-6"
            placeholder={`Filter ${plural(total, 'file')} (${keys('⌘F')})`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('');
                list.current?.element?.focus();
              } else if (e.key === 'ArrowDown') {
                list.current?.element?.focus();
                e.preventDefault();
              }
            }}
          />
        </div>
        <ToolButton label={tree ? 'Show as a list' : 'Group by folder'} icon={tree ? List : FolderTree} onClick={() => setTree(!tree)} />
        <ToolButton label="More: stash, ignore, discard all" icon={MoreHorizontal} onClick={(e) => moreMenu(e)} />
      </div>
      {total === 0 ? (
        <Blank icon={CheckCheck} title="No local changes">
          Nothing to commit{status.branch ? ` on ${status.branch}` : ''}.
        </Blank>
      ) : rows.length === 0 ? (
        <Blank>No file matches “{filter}”.</Blank>
      ) : (
        <VirtualList
          ref={list}
          count={rows.length}
          rowHeight={22}
          row={row}
          rowKey={(n) => itemKey(rows[n])}
          className="group/list git-scroll py-1"
          tabIndex={0}
          role="listbox"
          ariaLabel="Changed files"
          onKeyDown={onKey}
        />
      )}
      {status.truncated && <div className="flex-none border-t border-[var(--node-border)] px-2 py-1 text-2xs text-[var(--ansi-3)]">More than 10 000 files changed: some aren’t listed.</div>}
      <CommitBox />
    </div>
  );
}
