// The Changes list's rows: a section's header (fold it, stage or unstage
// all of it), a folder (its files checked together), and a file with its
// checkbox (in the next commit, out, or in part), its path, its lines added
// and deleted, and its letter.

import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { Folder, TriangleAlert } from '@hyperpane/icons';
import { Checkbox, fileIcon } from '@hyperpane/ui';
import type { FileStatus } from '../../../shared/index.ts';
import { PathLabel } from '../../components/PathLabel.tsx';
import { SectionHeader } from '../../components/SectionHeader.tsx';
import { StatusLetter } from '../../components/StatusLetter.tsx';
import type { Item } from '../../lib/changeRows.ts';
import { basenameOf } from '../../lib/paths.ts';
import { SIDE_LABEL, type Side, letterFor } from '../../lib/picks.ts';
import { ROW_INSET, rowClass } from '../../lib/rows.ts';
import { Stat } from '../../ui/parts.tsx';

type Click = (it: Item, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
type Menu = (e: ReactMouseEvent, it: Item) => void;
type Toggle = (side: Side, files: FileStatus[]) => unknown;

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
/** A checkbox in a row: out of the tab order (the list has the keys), and
 * its presses and double-clicks don't pick or open the row. */
export const inRow = { hideLabel: true, tabIndex: -1, onPointerDown: stop, onDoubleClick: stop } as const;
/** A row's checkbox: in the accent when checked, as a diff's hunk and line
 * boxes are, so a list of them reads as one quiet column, not a stack of
 * bright tiles; unchecked, a soft outline. */
export const ROW_CHECK =
  'data-[state=checked]:border-[var(--node-accent)] data-[state=checked]:bg-[var(--node-accent)] data-[state=checked]:text-white data-[state=indeterminate]:border-[var(--node-accent)] data-[state=indeterminate]:bg-[var(--node-accent)] data-[state=indeterminate]:text-white data-[state=unchecked]:border-[color-mix(in_srgb,var(--node-fg)_28%,transparent)]';

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
    <div className="h-full px-1.5" onContextMenu={(e) => e.preventDefault()}>
      <SectionHeader label={SIDE_LABEL[it.side]} count={it.count} open={open} onToggle={() => click(it, { shiftKey: false, metaKey: false, ctrlKey: false })}>
        {it.side === 'conflict' ? (
          <TriangleAlert className="size-3.5 text-[var(--git-conflicted)]" />
        ) : it.side === 'changes' ? null : (
          <button
            type="button"
            tabIndex={-1}
            className="rounded-chip h-5 px-1.5 text-[11px] font-medium tracking-normal normal-case transition-colors duration-100 touch:h-8 touch:px-2 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)]"
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
    <div className={ROW_INSET}>
      <div
        className={rowClass(false)}
        style={{ paddingLeft: 8 + it.depth * 12 }}
        onClick={(e) => click(it, e)}
        onDoubleClick={() => setClosed((c) => (open ? new Set([...c, `${it.side}:${it.path}`]) : new Set([...c].filter((x) => x !== `${it.side}:${it.path}`))))}
        onContextMenu={(e) => menu(e, it)}
      >
        {it.side !== 'conflict' && (
          <Checkbox {...inRow} checked={checked} label={folderLabel(it.side, checked)} onCheckedChange={() => toggle(it.side, it.files)} className={ROW_CHECK} />
        )}
        <button
          type="button"
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-1 text-[var(--node-muted)]"
          onClick={(e) => {
            e.stopPropagation();
            setClosed((c) => (open ? new Set([...c, `${it.side}:${it.path}`]) : new Set([...c].filter((x) => x !== `${it.side}:${it.path}`))));
          }}
        >
          <Folder variant="outline" className="size-3.5 flex-none" />
          <span className="truncate">{it.name}</span>
        </button>
        <span className="text-xs text-[var(--node-muted)] tabular-nums">{it.files.length}</span>
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
    <div className={ROW_INSET} data-file={f.path} data-side={it.side}>
      <div className={rowClass(isPicked)} style={{ paddingLeft: 8 + it.depth * 12 }} onClick={(e) => click(it, e)} onContextMenu={(e) => menu(e, it)}>
        <Checkbox {...inRow} checked={checked} label={fileLabel(it.side, checked, f.path)} onCheckedChange={() => toggle(it.side, [f])} className={ROW_CHECK} />
        {tree && <Icon className="size-3.5 flex-none text-[var(--node-muted)]" />}
        {tree ? (
          <span className="min-w-0 flex-1 truncate">{basenameOf(f.path)}</span>
        ) : (
          <PathLabel path={f.path} from={it.side === 'unstaged' || it.side === 'untracked' ? undefined : f.from} />
        )}
        {it.side !== 'conflict' && <Stat added={f.additions ?? 0} removed={f.deletions ?? 0} className="opacity-80" />}
        <StatusLetter plain letter={letterFor(it.side, f)} title={it.side === 'conflict' ? `Conflict: ${f.conflict}` : undefined} />
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
