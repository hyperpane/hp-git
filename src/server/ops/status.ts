// `status`: a repository's status, from one `git status --porcelain=v2 -z`
// (lib/parse-status.ts), filled in with what it doesn't say: modification
// times, the remotes, what's under way, who commits, the last fetch, and
// with `stats` the lines added and deleted.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FileStatus, Status } from '../../shared/index.ts';
import { operation } from '../lib/operation.ts';
import { type Parsed, parseStatus, sortFiles } from '../lib/parse-status.ts';
import { defaultRemote, readRemotes } from '../lib/remotes.ts';
import type { Repo } from '../lib/repo.ts';

/** Fills in the rest of a status: modification times, remotes, the
 * operation, the identity, the last fetch, and with `stats` the lines. */
export async function status(repo: Repo, o: { stats?: boolean; signal?: AbortSignal } = {}): Promise<Status> {
  const [out, remotes, op, identity, fetched] = await Promise.all([
    repo.run(['status', '--porcelain=v2', '--branch', '--show-stash', '--untracked-files=all', '-z'], { signal: o.signal }),
    readRemotes(repo),
    operation(repo.gitDir),
    repo.identity(),
    stat(path.join(repo.commonDir, 'FETCH_HEAD')).then((s) => s.mtimeMs, () => null),
  ]);
  const parsed = parseStatus(out.stdout);
  await mtimes(repo.root, parsed.files);
  if (o.stats) await lineStats(repo, parsed, o.signal);
  sortFiles(parsed.files);
  return {
    root: repo.shownRoot,
    gitDir: repo.shownGitDir,
    branch: parsed.branch,
    head: parsed.head,
    detached: parsed.detached,
    unborn: parsed.unborn,
    upstream: parsed.upstream,
    upstreamGone: parsed.upstreamGone,
    ahead: parsed.ahead,
    behind: parsed.behind,
    remote: defaultRemote(remotes, parsed.branch),
    remotes: remotes.names,
    operation: op,
    files: parsed.files,
    truncated: parsed.truncated,
    stashes: parsed.stashes,
    identity,
    fetched: fetched === null ? null : Math.round(fetched),
  };
}

async function mtimes(root: string, files: FileStatus[]) {
  // A few at a time: thousands of stats at once would hold the event loop's
  // thread pool from everything else.
  const queue = files.slice();
  const work = async () => {
    for (let f = queue.pop(); f; f = queue.pop()) {
      const file = f;
      try {
        file.mtime = Math.round((await stat(path.join(root, file.path))).mtimeMs);
      } catch {
        file.mtime = 0;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, queue.length) }, work));
}

/** Lines added and deleted against HEAD (`diff --numstat`), and untracked
 * files' lines. */
async function lineStats(repo: Repo, parsed: Parsed, signal?: AbortSignal) {
  if (!parsed.files.length) return;
  const base = parsed.unborn ? await repo.emptyTree() : 'HEAD';
  const out = await repo.exec(['diff', '--numstat', '-z', '--no-renames', base, '--'], { signal, limit: 32 * 1024 * 1024 });
  const stats = new Map<string, [number, number]>();
  const fields = out.stdout.toString('utf8').split('\0');
  for (const field of fields) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(field);
    if (m && m[1] !== '-') stats.set(m[3], [Number(m[1]), Number(m[2])]);
  }
  for (const f of parsed.files) {
    const s = stats.get(f.path);
    if (s) {
      f.additions = s[0];
      f.deletions = s[1];
    }
  }
  // Untracked files: their lines, for the small ones.
  const untracked = parsed.files.filter((f) => f.untracked).slice(0, 500);
  await Promise.all(
    untracked.map(async (f) => {
      try {
        const p = path.join(repo.root, f.path);
        const st = await stat(p);
        if (!st.isFile() || st.size > 1024 * 1024) return;
        const data = await readFile(p);
        if (data.subarray(0, 8000).includes(0)) return;
        let n = 0;
        for (const b of data) if (b === 10) n++;
        if (data.length && data[data.length - 1] !== 10) n++;
        f.additions = n;
        f.deletions = 0;
      } catch {
        // Gone already.
      }
    }),
  );
}
