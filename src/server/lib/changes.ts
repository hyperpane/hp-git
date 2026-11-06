// The files changed between two trees (or a tree and the working tree),
// with their lines added and deleted, from one `--raw --numstat`.

import type { ChangedFile, Letter } from '../../shared/index.ts';
import type { Repo } from './repo.ts';

/** The files changed between two trees, with their lines. */
export async function changes(repo: Repo, base: string, commit: string | null, signal?: AbortSignal): Promise<{ files: ChangedFile[] }> {
  // Two trees: diff-tree; a tree and the working tree: diff.
  const args = commit === null ? ['diff', '--no-ext-diff', '--no-relative', '-z', '-M', '--raw', '--numstat', base, '--'] : ['diff-tree', '-r', '-z', '-M', '--raw', '--numstat', '--no-commit-id', base, commit, '--'];
  const out = await repo.run(args, { signal, limit: 64 * 1024 * 1024 });
  const t = out.stdout.toString('utf8').split('\0');
  const files: ChangedFile[] = [];
  const byPath = new Map<string, ChangedFile>();
  let i = 0;
  // Raw: `:old new sha sha X` NUL path [NUL path].
  while (i < t.length && t[i].startsWith(':')) {
    const status = t[i].split(' ')[4] ?? 'M';
    const letter = status[0] as Letter;
    let file: ChangedFile;
    if (letter === 'R' || letter === 'C') {
      file = { path: t[i + 2], from: t[i + 1], status: letter, additions: 0, deletions: 0, binary: false };
      i += 3;
    } else {
      file = { path: t[i + 1], status: letter, additions: 0, deletions: 0, binary: false };
      i += 2;
    }
    files.push(file);
    byPath.set(file.path, file);
  }
  // Numstat: `a TAB d TAB path` NUL, or for a rename `a TAB d TAB` NUL old NUL new.
  while (i < t.length) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(t[i]);
    if (!m) {
      i++;
      continue;
    }
    let p = m[3];
    i++;
    if (!p) {
      p = t[i + 1];
      i += 2;
    }
    const file = byPath.get(p);
    if (!file) continue;
    if (m[1] === '-') file.binary = true;
    else {
      file.additions = Number(m[1]);
      file.deletions = Number(m[2]);
    }
  }
  return { files };
}
