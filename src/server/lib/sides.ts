// The two sides of a diff and a file's content: where each is read from (a
// revision spec for `git cat-file`, the working tree, or nothing), how big
// it is, and its bytes up to a limit.

import { open, stat } from 'node:fs/promises';
import type { Repo } from './repo.ts';

/** Where each side of a diff is read from: a revision spec for
 * `git cat-file` (`HEAD:a.txt`, `:a.txt`), the working tree (`null`
 * path… `worktree: true`), or nothing. */
export type Side = { spec: string } | { worktree: string } | null;

export async function sizeOf(repo: Repo, side: Side): Promise<number> {
  if (!side) return 0;
  if ('worktree' in side) return stat(repo.file(side.worktree)).then((s) => s.size, () => 0);
  const out = await repo.exec(['cat-file', '-s', side.spec]);
  return out.code === 0 ? Number(out.stdout.toString().trim()) || 0 : 0;
}

/** A side's bytes (at most `max`), or null if it isn't there. */
export async function read(repo: Repo, side: Side, max: number): Promise<Buffer | null> {
  if (!side) return null;
  if ('worktree' in side) {
    try {
      const f = await open(repo.file(side.worktree), 'r');
      try {
        const st = await f.stat();
        if (!st.isFile()) return null;
        const n = Math.min(st.size, max);
        const buf = Buffer.alloc(n);
        let at = 0;
        while (at < n) {
          const { bytesRead } = await f.read(buf, at, n - at, at);
          if (!bytesRead) break;
          at += bytesRead;
        }
        return buf.subarray(0, at);
      } finally {
        await f.close();
      }
    } catch {
      return null;
    }
  }
  const out = await repo.exec(['cat-file', 'blob', side.spec], { limit: max });
  return out.code === 0 ? out.stdout : null;
}
