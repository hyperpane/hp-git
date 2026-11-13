// The Changes list's sections (conflicts, staged, changes, untracked; or,
// when every change is checked for the next commit as GitHub Desktop has
// it, conflicts and changes, each file once, against HEAD), the files in
// each, and what's picked: `side:path`, one key per row.

import type { FileStatus, Letter } from '../../shared/index.ts';

/** `changes`: a file against HEAD, whatever's staged (checked or not for
 * the next commit, lib/include.ts). */
export type Side = 'conflict' | 'staged' | 'unstaged' | 'untracked' | 'changes';
export const SIDES: Side[] = ['conflict', 'staged', 'unstaged', 'untracked', 'changes'];
export const SIDE_LABEL: Record<Side, string> = { conflict: 'Conflicts', staged: 'Staged', unstaged: 'Changes', untracked: 'Untracked', changes: 'Changes' };

/** A file in one section: `side:path`. */
export type Pick = `${Side}:${string}`;
export const pickOf = (side: Side, path: string): Pick => `${side}:${path}`;
export const splitPick = (p: Pick): [Side, string] => {
  const at = p.indexOf(':');
  return [p.slice(0, at) as Side, p.slice(at + 1)];
};

/** The files in each section: by the index, or (`including`) each once. */
export function sideFiles(files: FileStatus[], including = false): Record<Side, FileStatus[]> {
  const out: Record<Side, FileStatus[]> = { conflict: [], staged: [], unstaged: [], untracked: [], changes: [] };
  for (const f of files) {
    if (f.conflict) out.conflict.push(f);
    else if (including) out.changes.push(f);
    else if (f.untracked) out.untracked.push(f);
    else {
      if (f.staged) out.staged.push(f);
      if (f.worktree) out.unstaged.push(f);
    }
  }
  return out;
}

export const letterFor = (side: Side, f: FileStatus): Letter | '?' | '!' =>
  side === 'conflict' ? '!' : side === 'untracked' ? '?' : side === 'staged' ? (f.staged ?? 'M') : side === 'changes' ? headLetter(f) : (f.worktree ?? 'M');

/** A file's change against HEAD: new, gone, renamed or changed. */
export function headLetter(f: FileStatus): Letter | '?' {
  if (f.untracked) return '?';
  if (f.worktree === 'D') return 'D';
  return f.staged ?? f.worktree ?? 'M';
}

/** Where a file is picked in the list. */
export function sideOf(f: FileStatus, including: boolean): Side {
  if (f.conflict) return 'conflict';
  if (including) return 'changes';
  return f.staged && !f.worktree ? 'staged' : f.untracked ? 'untracked' : 'unstaged';
}
