// What Git gives Explorer (its extension points, contributed in plugin.json):
// `explorerDecorations`, each shown row's change as a letter and a color
// (lib/decorations.ts), and `explorerStage`, its right-click menu's Stage
// with Git. The app makes these calls for Explorer, with whole paths, not a
// repository: each path's repository is found from the folder it's in (a
// submodule's or a nested repository's rows are theirs), and paths in none
// are left alone, never an error.
//
// Many Explorers ask, every few seconds: a repository's status is kept for
// a second, and folders that aren't in one are remembered a few seconds.

import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { FileStatus } from '../../shared/index.ts';
import { type Decoration, decorate } from '../lib/decorations.ts';
import { parseStatus } from '../lib/parse-status.ts';
import { type Repo, type Repos, whole } from '../lib/repo.ts';
import { stage } from './stage.ts';

/** The most paths one call looks at (Explorer sends at most this many). */
export const PATHS_MAX = 2000;
/** How long a repository's status is kept, and a folder outside any. */
const STATUS_KEPT = 1000;
const OUTSIDE_KEPT = 5000;

interface Deps {
  repos: Repos;
  /** Runs a change after the others to the same repository. */
  locked<T>(repo: Repo, fn: () => Promise<T>): Promise<T>;
  /** Tells the watches (or the bus) the repository changed. */
  changed(repo: Repo, project?: string | null): Promise<void>;
}

/** The paths of one repository, as Explorer gave them and from its root. */
interface Group {
  repo: Repo;
  items: { path: string; rel: string }[];
}

export function explorerOps({ repos, locked, changed }: Deps) {
  const statuses = new Map<string, { at: number; files: Promise<FileStatus[]> }>();
  const outside = new Map<string, number>();

  /** The changed files of a repository, from a status at most a second old. */
  function filesOf(repo: Repo): Promise<FileStatus[]> {
    const kept = statuses.get(repo.root);
    if (kept && Date.now() - kept.at < STATUS_KEPT) return kept.files;
    const files = repo.run(['status', '--porcelain=v2', '--untracked-files=all', '-z']).then((out) => parseStatus(out.stdout).files);
    statuses.set(repo.root, { at: Date.now(), files });
    files.catch(() => statuses.get(repo.root)?.files === files && statuses.delete(repo.root));
    return files;
  }

  /** The repository a folder is in, and the folder as git sees it (links
   * resolved, as git's root is); null outside one. */
  async function repoOf(dir: string): Promise<{ repo: Repo; real: string } | null> {
    const until = outside.get(dir);
    if (until !== undefined && until > Date.now()) return null;
    try {
      const [repo, real] = await Promise.all([repos.open(dir), realpath(dir)]);
      outside.delete(dir);
      return { repo, real };
    } catch {
      outside.set(dir, Date.now() + OUTSIDE_KEPT);
      return null;
    }
  }

  /** Explorer's paths, by repository; those in none are left out. */
  async function group(paths: unknown): Promise<Group[]> {
    const list = (Array.isArray(paths) ? paths : []).filter((p): p is string => typeof p === 'string' && !!p.trim()).slice(0, PATHS_MAX);
    const byDir = new Map<string, { path: string; full: string }[]>();
    for (const p of list) {
      let full: string;
      try {
        full = whole(p);
      } catch {
        continue;
      }
      const dir = path.dirname(full);
      if (dir === full) continue;
      byDir.set(dir, [...(byDir.get(dir) ?? []), { path: p, full }]);
    }
    const groups = new Map<string, Group>();
    await Promise.all(
      [...byDir].map(async ([dir, items]) => {
        const found = await repoOf(dir);
        if (!found) return;
        const g = groups.get(found.repo.root) ?? { repo: found.repo, items: [] };
        groups.set(found.repo.root, g);
        for (const item of items) {
          const rel = path.relative(found.repo.root, path.join(found.real, path.basename(item.full)));
          if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
          g.items.push({ path: item.path, rel: rel.split(path.sep).join('/') });
        }
      }),
    );
    return [...groups.values()].filter((g) => g.items.length);
  }

  /** Which of the paths git ignores (`check-ignore`: tracked files never are). */
  async function ignoredOf(repo: Repo, rels: string[]): Promise<Set<string>> {
    if (!rels.length) return new Set();
    const out = await repo.exec(['check-ignore', '-z', '--stdin'], { input: rels.map((r) => `${r}\0`).join('') });
    // 1: none is; 128: git couldn't say (a path in a submodule…).
    if (out.code !== 0) return new Set();
    return new Set(out.stdout.toString('utf8').split('\0').filter(Boolean));
  }

  /** `explorerDecorations {server, folder, paths}` → `{[path]: Decoration}`. */
  async function decorations(req: { paths?: unknown }): Promise<Record<string, Decoration>> {
    const out: Record<string, Decoration> = {};
    for (const g of await group(req?.paths)) {
      try {
        const files = await filesOf(g.repo);
        const changed = decorate(files, g.items);
        const rest = g.items.filter((i) => !changed[i.path]);
        const ignored = await ignoredOf(g.repo, rest.map((i) => i.rel));
        Object.assign(out, decorate([], rest, ignored), changed);
      } catch {
        // A repository git can't read now: its rows stay plain.
      }
    }
    return out;
  }

  /** `explorerStage {server, folder, paths}` → `{message, error?}`. */
  async function stageFiles(req: { paths?: unknown }, project: string | null): Promise<{ message: string; error?: boolean }> {
    const asked = Array.isArray(req?.paths) ? req.paths.length : 0;
    const groups = await group(req?.paths);
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    if (!count) return { message: asked === 1 ? 'That isn’t in a Git repository.' : 'Those aren’t in a Git repository.', error: true };
    for (const g of groups) {
      try {
        await locked(g.repo, () => stage(g.repo, g.items.map((i) => i.rel), false));
      } finally {
        statuses.delete(g.repo.root);
        await changed(g.repo, project).catch(() => {});
      }
    }
    const what = count === 1 ? path.basename(groups[0].items[0].path) : `${count.toLocaleString('en-US')} files`;
    const left = asked - count;
    return { message: `Staged ${what}.${left > 0 ? ` ${left === 1 ? '1 wasn’t' : `${left} weren’t`} in a Git repository.` : ''}` };
  }

  return { decorations, stage: stageFiles };
}
