// `git status --porcelain=v2 --branch --show-stash -z`, parsed: the branch,
// its upstream and how far ahead or behind, the stashes, and every changed
// file (at most FILES_MAX), conflicts first.

import type { ConflictKind, FileStatus, Letter } from '../../shared/index.ts';

/** The most changed files a status lists (`truncated` says there were more). */
export const FILES_MAX = 10_000;

export interface Parsed {
  branch: string | null;
  head: string | null;
  detached: boolean;
  unborn: boolean;
  upstream: string | null;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  stashes: number;
  files: FileStatus[];
  truncated: boolean;
}

const letter = (c: string): Letter | null => (c === '.' || c === '?' || c === '!' || !c ? null : (c as Letter));

const CONFLICTS: Record<string, ConflictKind> = {
  DD: 'bothDeleted',
  AU: 'addedByUs',
  UD: 'deletedByThem',
  UA: 'addedByThem',
  DU: 'deletedByUs',
  AA: 'bothAdded',
  UU: 'bothModified',
};

/** `git status --porcelain=v2 --branch --show-stash -z`. */
export function parseStatus(out: Buffer | string, max = FILES_MAX): Parsed {
  const text = typeof out === 'string' ? out : out.toString('utf8');
  const s: Parsed = { branch: null, head: null, detached: false, unborn: false, upstream: null, upstreamGone: false, ahead: 0, behind: 0, stashes: 0, files: [], truncated: false };
  let hasAb = false;
  const fields = text.split('\0');
  const push = (f: FileStatus) => {
    if (s.files.length < max) s.files.push(f);
    else s.truncated = true;
  };
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const tag = field[0];
    if (tag === '#') {
      const rest = field.slice(2);
      const space = rest.indexOf(' ');
      const key = space < 0 ? rest : rest.slice(0, space);
      const value = space < 0 ? '' : rest.slice(space + 1);
      if (key === 'branch.oid') {
        if (value === '(initial)') s.unborn = true;
        else s.head = value;
      } else if (key === 'branch.head') {
        if (value === '(detached)') s.detached = true;
        else s.branch = value;
      } else if (key === 'branch.upstream') s.upstream = value;
      else if (key === 'branch.ab') {
        hasAb = true;
        const m = /\+(\d+) -(\d+)/.exec(value);
        if (m) {
          s.ahead = Number(m[1]);
          s.behind = Number(m[2]);
        }
      } else if (key === 'stash') s.stashes = Number(value) || 0;
    } else if (tag === '1' || tag === '2') {
      // 1 XY sub mH mI mW hH hI path
      // 2 XY sub mH mI mW hH hI Xscore path NUL orig
      const n = tag === '1' ? 8 : 9;
      const parts = splitN(field.slice(2), n);
      if (parts.length < n) continue;
      const xy = parts[0];
      const from = tag === '2' ? fields[++i] : undefined;
      const f: FileStatus = {
        path: parts[n - 1],
        staged: letter(xy[0]),
        worktree: letter(xy[1]),
        untracked: false,
        conflict: null,
        mtime: 0,
      };
      if (from !== undefined) f.from = from;
      if (parts[1].startsWith('S')) f.submodule = true;
      push(f);
    } else if (tag === 'u') {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      const parts = splitN(field.slice(2), 10);
      if (parts.length < 10) continue;
      const xy = parts[0];
      const f: FileStatus = {
        path: parts[9],
        staged: 'U',
        worktree: 'U',
        untracked: false,
        conflict: CONFLICTS[xy] ?? 'bothModified',
        mtime: 0,
      };
      if (parts[1].startsWith('S')) f.submodule = true;
      push(f);
    } else if (tag === '?') {
      push({ path: field.slice(2), staged: null, worktree: null, untracked: true, conflict: null, mtime: 0 });
    }
  }
  s.upstreamGone = s.upstream !== null && !hasAb;
  return s;
}

/** The first n-1 space-separated fields, and the rest (a path may have spaces). */
function splitN(text: string, n: number): string[] {
  const out: string[] = [];
  let at = 0;
  for (let k = 0; k < n - 1; k++) {
    const space = text.indexOf(' ', at);
    if (space < 0) return out;
    out.push(text.slice(at, space));
    at = space + 1;
  }
  out.push(text.slice(at));
  return out;
}

/** Conflicts first, then by path. */
export function sortFiles(files: FileStatus[]) {
  files.sort((a, b) => (a.conflict ? 0 : 1) - (b.conflict ? 0 : 1) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
