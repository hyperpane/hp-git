// The Changes list's sections (conflicts, staged, changes, untracked), the
// files in each, and what's picked: `side:path`, one key per row.

import type { FileStatus, Letter } from '../../shared/index.ts';

export type Side = 'conflict' | 'staged' | 'unstaged' | 'untracked';
export const SIDES: Side[] = ['conflict', 'staged', 'unstaged', 'untracked'];
export const SIDE_LABEL: Record<Side, string> = { conflict: 'Conflicts', staged: 'Staged', unstaged: 'Changes', untracked: 'Untracked' };

/** A file in one section: `side:path`. */
export type Pick = `${Side}:${string}`;
export const pickOf = (side: Side, path: string): Pick => `${side}:${path}`;
export const splitPick = (p: Pick): [Side, string] => {
  const at = p.indexOf(':');
  return [p.slice(0, at) as Side, p.slice(at + 1)];
};

export function sideFiles(files: FileStatus[]): Record<Side, FileStatus[]> {
  const out: Record<Side, FileStatus[]> = { conflict: [], staged: [], unstaged: [], untracked: [] };
  for (const f of files) {
    if (f.conflict) out.conflict.push(f);
    else if (f.untracked) out.untracked.push(f);
    else {
      if (f.staged) out.staged.push(f);
      if (f.worktree) out.unstaged.push(f);
    }
  }
  return out;
}

export const letterFor = (side: Side, f: FileStatus): Letter | '?' | '!' => (side === 'conflict' ? '!' : side === 'untracked' ? '?' : side === 'staged' ? (f.staged ?? 'M') : (f.worktree ?? 'M'));
