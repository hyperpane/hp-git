// The Changes list's rows: a section's header (fold it, stage or unstage
// all of it), a folder (its files checked together), and a file with its
// checkbox (in the next commit, out, or in part), its path, its lines added
// and deleted, and its letter.

import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { FolderTree, TriangleAlert } from 'lucide-react';
import { fileIcon } from '@hyperpane/ui';
import type { FileStatus } from '../../../shared/index.ts';
import { Checkbox } from '../../components/Checkbox.tsx';
import { PathLabel } from '../../components/PathLabel.tsx';
import { SectionHeader } from '../../components/SectionHeader.tsx';
import { StatusLetter } from '../../components/StatusLetter.tsx';
import type { Item } from '../../lib/changeRows.ts';
import { basenameOf } from '../../lib/paths.ts';
import { SIDE_LABEL, type Side, letterFor } from '../../lib/picks.ts';
import { rowClass } from '../../lib/rows.ts';

type Click = (it: Item, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
type Menu = (e: ReactMouseEvent, it: Item) => void;
type Toggle = (side: Side, files: FileStatus[]) => unknown;

export function SectionRow({
  it,
  files,
  open,
  click,
  stage,
  unstage,
}: {
  it: Extract<Item, { t: 'section' }>;
  files: FileStatus[];
  open: boolean;
  click: Click;
  stage(files: FileStatus[]): unknown;
  unstage(files: FileStatus[]): unknown;
}) {
  return (
    <div className="h-full ps-1 pe-1.5" onContextMenu={(e) => e.preventDefault()}>
      <SectionHeader label={SIDE_LABEL[it.side]} count={it.count} open={open} onToggle={() => click(it, { shiftKey: false, metaKey: false, ctrlKey: false })}>
        {it.side === 'conflict' ? (
          <TriangleAlert className="size-3.5 text-[var(--ansi-9)]" />
        ) : it.side === 'changes' ? null : (
          <button
            type="button"
            tabIndex={-1}
            className="rounded-chip px-1 text-2xs font-medium tracking-normal normal-case hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
            onClick={() => (it.side === 'staged' ? unstage(files) : stage(files))}
          >
            {it.side === 'staged' ? 'Unstage all' : 'Stage all'}
          </button>
        )}
      </SectionHeader>
    </div>
  );
}

export function DirRow({
  it,
  checked,
  open,
  click,
  menu,
  toggle,
  setClosed,
}: {
  it: Extract<Item, { t: 'dir' }>;
  checked: boolean | 'mixed';
  open: boolean;
  click: Click;
  menu: Menu;
  toggle: Toggle;
  setClosed: Dispatch<SetStateAction<Set<string>>>;
}) {
  return (
    <div className="group/list h-full px-1">
      <div
        className={rowClass(false)}
        style={{ paddingLeft: 6 + it.depth * 12 }}
        onClick={(e) => click(it, e)}
        onDoubleClick={() => setClosed((c) => (open ? new Set([...c, `${it.side}:${it.path}`]) : new Set([...c].filter((x) => x !== `${it.side}:${it.path}`))))}
        onContextMenu={(e) => menu(e, it)}
      >
        {it.side !== 'conflict' && <Checkbox checked={checked} label={folderLabel(it.side, checked)} onChange={() => toggle(it.side, it.files)} />}
        <button
          type="button"
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-1 text-[var(--node-muted)]"
          onClick={(e) => {
            e.stopPropagation();
            setClosed((c) => (open ? new Set([...c, `${it.side}:${it.path}`]) : new Set([...c].filter((x) => x !== `${it.side}:${it.path}`))));
          }}
        >
          <FolderTree className="size-3.5 flex-none" />
          <span className="truncate">{it.name}</span>
        </button>
        <span className="text-2xs text-[var(--node-muted)] tabular-nums">{it.files.length}</span>
      </div>
    </div>
  );
}

export function FileRow({
  it,
  checked,
  isPicked,
  tree,
  click,
  menu,
  toggle,
}: {
  it: Extract<Item, { t: 'file' }>;
  checked: boolean | 'mixed';
  isPicked: boolean;
  tree: boolean;
  click: Click;
  menu: Menu;
  toggle: Toggle;
}) {
  const f = it.file;
  const Icon = fileIcon(basenameOf(f.path));
  return (
    <div className="h-full px-1" data-file={f.path} data-side={it.side}>
      <div className={rowClass(isPicked)} style={{ paddingLeft: 6 + it.depth * 12 }} onClick={(e) => click(it, e)} onContextMenu={(e) => menu(e, it)}>
        <Checkbox checked={checked} label={fileLabel(it.side, checked, f.path)} onChange={() => toggle(it.side, [f])} />
        {tree && <Icon className="size-3.5 flex-none text-[var(--node-muted)]" />}
        {tree ? <span className="min-w-0 flex-1 truncate">{basenameOf(f.path)}</span> : <PathLabel path={f.path} from={it.side === 'unstaged' || it.side === 'untracked' ? undefined : f.from} />}
        {(f.additions || f.deletions) && it.side !== 'conflict' ? (
          <span className="flex-none text-[10px] tabular-nums opacity-80">
            {!!f.additions && <span className="text-[var(--ansi-2)]">+{f.additions}</span>} {!!f.deletions && <span className="text-[var(--ansi-1)]">−{f.deletions}</span>}
          </span>
        ) : null}
        <StatusLetter letter={letterFor(it.side, f)} title={it.side === 'conflict' ? `Conflict: ${f.conflict}` : undefined} />
      </div>
    </div>
  );
}

/** What a file's checkbox does. */
function fileLabel(side: Side, checked: boolean | 'mixed', path: string): string {
  if (side === 'conflict') return `Mark ${path} as resolved`;
  if (side === 'changes') return checked === true ? `Leave ${path} out of the commit` : `Commit all of ${path}`;
  return side === 'staged' ? `Unstage ${path}` : `Stage ${path}`;
}

function folderLabel(side: Side, checked: boolean | 'mixed'): string {
  if (side === 'changes') return checked === true ? 'Leave the folder out of the commit' : 'Commit all of the folder';
  return side === 'staged' ? 'Unstage the folder' : 'Stage the folder';
}
