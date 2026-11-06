// The files a commit changed (or that differ between two revisions), flat
// or by folder, with their lines added and deleted; a file's menu opens
// its history or blame, copies its path, opens it.

import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { FolderTree, List } from 'lucide-react';
import { ToolButton, fileIcon, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { ChangedFile } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { PathLabel } from '../../components/PathLabel.tsx';
import { StatusLetter } from '../../components/StatusLetter.tsx';
import { type VirtualHandle, VirtualList } from '../../components/VirtualList.tsx';
import { copy } from '../../lib/clipboard.ts';
import { plural } from '../../lib/format.ts';
import { listKey } from '../../lib/listKey.ts';
import { local } from '../../lib/local.ts';
import { basenameOf } from '../../lib/paths.ts';
import { rowClass } from '../../lib/rows.ts';

/** The files a commit changed, flat or by folder, with their counts. */
export function FileList({ files, truncated, picked, onPick, sha }: { files: ChangedFile[]; truncated: boolean; picked: string | null; onPick(p: string): void; sha?: string }) {
  const repo = useRepo();
  const [tree, setTreeState] = useState(() => local.get('commitTree', false));
  const list = useRef<VirtualHandle>(null);
  const sorted = useMemo(() => (tree ? [...files].sort((a, b) => a.path.localeCompare(b.path)) : files), [files, tree]);
  const rows = useMemo(() => {
    if (!tree) return sorted.map((f) => ({ f, depth: 0, dir: null as string | null }));
    const out: { f: ChangedFile | null; depth: number; dir: string | null }[] = [];
    let open: string[] = [];
    for (const f of sorted) {
      const parts = f.path.split('/').slice(0, -1);
      let k = 0;
      while (k < open.length && open[k] === parts[k]) k++;
      open = open.slice(0, k);
      for (; k < parts.length; k++) {
        out.push({ f: null, depth: k, dir: parts[k] });
        open.push(parts[k]);
      }
      out.push({ f, depth: parts.length, dir: null });
    }
    return out;
  }, [sorted, tree]);
  const at = rows.findIndex((r) => r.f?.path === picked);
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  const onKey = (e: KeyboardEvent) => {
    let next = listKey(e, at, rows.length, 12);
    if (next === null) {
      if (e.key === 'Enter') (document.querySelector('[data-diff-pane] [tabindex="0"]') as HTMLElement | null)?.focus();
      else return;
    } else {
      const dir = next >= at ? 1 : -1;
      while (rows[next] && !rows[next].f) next += dir;
      const r = rows[next];
      if (r?.f) {
        onPick(r.f.path);
        list.current?.scrollToIndex(next);
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const menu = (e: React.MouseEvent, f: ChangedFile) => {
    e.preventDefault();
    e.stopPropagation();
    onPick(f.path);
    const items: (MenuEntry | null)[] = [
      { label: 'File History', run: () => repo.open({ kind: 'fileHistory', path: f.path }) },
      ...(sha ? [{ label: 'Blame at This Commit', disabled: f.status === 'D', run: () => repo.open({ kind: 'blame', path: f.path, rev: sha }) }] : []),
      null,
      { label: 'Copy Path', run: () => copy(f.path, repo.toast) },
      { label: 'Open in Editor', disabled: f.status === 'D', run: () => repo.openInEditor(f.path) },
      { label: 'Reveal in Explorer', run: () => repo.reveal(f.path) },
    ];
    repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-commit-files>
      <div className="flex h-8 flex-none items-center gap-1.5 border-b border-[var(--node-border)] ps-2 pe-1 text-2xs text-[var(--node-muted)]">
        <span className="min-w-0 flex-1 truncate">
          {plural(files.length, 'file')}
          {truncated ? '+' : ''} <span className="text-[var(--ansi-2)]">+{additions.toLocaleString('en-US')}</span> <span className="text-[var(--ansi-1)]">−{deletions.toLocaleString('en-US')}</span>
        </span>
        <ToolButton
          label={tree ? 'Show as a list' : 'Group by folder'}
          icon={tree ? List : FolderTree}
          onClick={() => {
            setTreeState(!tree);
            local.set('commitTree', !tree);
          }}
        />
      </div>
      <VirtualList
        ref={list}
        count={rows.length}
        rowHeight={22}
        className="group/list git-scroll py-1"
        tabIndex={0}
        role="listbox"
        ariaLabel="Changed files"
        onKeyDown={onKey}
        row={(n) => {
          const r = rows[n];
          if (!r.f)
            return (
              <div className="flex h-full items-center gap-1 px-2 text-[var(--node-muted)]" style={{ paddingLeft: 8 + r.depth * 12 }}>
                <FolderTree className="size-3.5 flex-none" />
                <span className="truncate">{r.dir}</span>
              </div>
            );
          const f = r.f;
          const Icon = fileIcon(basenameOf(f.path));
          return (
            <div className="h-full px-1">
              <div className={rowClass(f.path === picked)} style={{ paddingLeft: 6 + r.depth * 12 }} onClick={() => onPick(f.path)} onContextMenu={(e) => menu(e, f)} title={f.from ? `${f.from} → ${f.path}` : f.path}>
                {tree && <Icon className="size-3.5 flex-none text-[var(--node-muted)]" />}
                {tree ? <span className="min-w-0 flex-1 truncate">{basenameOf(f.path)}</span> : <PathLabel path={f.path} from={f.from} />}
                {f.binary ? (
                  <span className="text-[10px] text-[var(--node-muted)]">bin</span>
                ) : (
                  <span className="flex-none text-[10px] tabular-nums opacity-80">
                    {f.additions > 0 && <span className="text-[var(--ansi-2)]">+{f.additions}</span>} {f.deletions > 0 && <span className="text-[var(--ansi-1)]">−{f.deletions}</span>}
                  </span>
                )}
                <StatusLetter letter={f.untracked ? '?' : f.status} />
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
