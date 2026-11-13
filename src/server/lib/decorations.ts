// What Explorer shows beside a file for Git (its `decorations` point): a
// letter and a color for each changed file, as the status letters them, a
// dot on a folder with changes inside, and ignored files faded. Pure: the
// status and the paths asked about in, the decorations out.

import type { ConflictKind, FileStatus, Letter } from '../../shared/index.ts';

/** Explorer's colors (its `decorations` point). */
export type DecorationColor = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'ignored' | 'conflict';

/** One row's decoration, as Explorer takes it. */
export interface Decoration {
  badge?: string;
  color?: DecorationColor;
  title?: string;
  faded?: boolean;
}

/** A path Explorer asked about: as it gave it, and from the repository's
 * root (forward slashes). */
export interface Wanted {
  path: string;
  rel: string;
}

const CONFLICTS: Record<ConflictKind, string> = {
  bothModified: 'changed on both sides',
  bothAdded: 'added on both sides',
  bothDeleted: 'deleted on both sides',
  addedByUs: 'added here',
  addedByThem: 'added by the other side',
  deletedByUs: 'deleted here, changed by the other side',
  deletedByThem: 'deleted by the other side, changed here',
};

const KINDS: Record<Exclude<DecorationColor, 'untracked' | 'ignored' | 'conflict'>, { badge: string; word: string }> = {
  added: { badge: 'A', word: 'Added' },
  modified: { badge: 'M', word: 'Modified' },
  deleted: { badge: 'D', word: 'Deleted' },
  renamed: { badge: 'R', word: 'Renamed' },
};

/** Which change a file's letters make it: a deletion over the rest (on
 * either side), then a new file, a rename (or copy), a change. */
function kindOf(staged: Letter | null, worktree: Letter | null): keyof typeof KINDS {
  const letters = [staged, worktree];
  if (letters.includes('D')) return 'deleted';
  if (staged === 'A' || worktree === 'A') return 'added';
  if (letters.includes('R') || letters.includes('C')) return 'renamed';
  return 'modified';
}

/** A changed file's decoration. */
export function fileDecoration(f: FileStatus): Decoration {
  if (f.conflict) return { badge: '!', color: 'conflict', title: `Conflict: ${CONFLICTS[f.conflict] ?? 'not resolved yet'}` };
  if (f.untracked) return { badge: 'U', color: 'untracked', title: 'Untracked: not in Git yet' };
  const kind = kindOf(f.staged, f.worktree);
  const { badge, word } = KINDS[kind];
  const what = f.submodule ? 'Submodule: changed' : kind === 'renamed' && f.from ? `${word} from ${f.from}` : word;
  const staging = f.staged && f.worktree ? 'staged, with more changes not staged' : f.staged ? 'staged' : 'not staged';
  return { badge, color: kind, title: `${what}, ${staging}` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The decorations of the paths asked about: each changed file's; a dot on
 * each folder with changed files inside (red with a conflict among them,
 * green when they're all new); ignored ones (`ignored`, by `rel`) faded.
 * Paths with nothing to say are left out.
 */
export function decorate(files: readonly FileStatus[], wanted: readonly Wanted[], ignored: ReadonlySet<string> = new Set()): Record<string, Decoration> {
  const byRel = new Map<string, Wanted[]>();
  for (const w of wanted) {
    const rel = w.rel.replace(/\/+$/, '');
    if (!rel) continue;
    const list = byRel.get(rel);
    if (list) list.push(w);
    else byRel.set(rel, [w]);
  }
  const out: Record<string, Decoration> = {};
  const set = (rel: string, d: Decoration) => {
    for (const w of byRel.get(rel) ?? []) out[w.path] = d;
  };
  // Folders asked about: how many changed files each has inside.
  const inside = new Map<string, { count: number; conflicts: number; untracked: number }>();
  for (const f of files) {
    // A nested repository's folder comes as `name/`.
    const rel = f.path.replace(/\/+$/, '');
    if (byRel.has(rel)) set(rel, fileDecoration(f));
    for (let at = rel.lastIndexOf('/'); at > 0; at = rel.lastIndexOf('/', at - 1)) {
      const dir = rel.slice(0, at);
      if (!byRel.has(dir)) continue;
      const n = inside.get(dir) ?? { count: 0, conflicts: 0, untracked: 0 };
      n.count++;
      if (f.conflict) n.conflicts++;
      else if (f.untracked) n.untracked++;
      inside.set(dir, n);
    }
  }
  for (const [dir, n] of inside) {
    if (byRel.get(dir)!.some((w) => out[w.path])) continue;
    const color: DecorationColor = n.conflicts ? 'conflict' : n.untracked === n.count ? 'untracked' : 'modified';
    const title = `${plural(n.count, 'changed file')} inside${n.conflicts ? `, ${plural(n.conflicts, 'conflict')}` : ''}`;
    set(dir, { badge: '•', color, title, faded: false });
  }
  for (const rel of ignored) {
    const key = rel.replace(/\/+$/, '');
    if (byRel.get(key)?.some((w) => !out[w.path])) set(key, { color: 'ignored', faded: true, title: 'Ignored by Git' });
  }
  return out;
}
