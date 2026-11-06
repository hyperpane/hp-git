// Where discarded work goes before git overwrites or removes it: the Trash
// (or the Recycle Bin), or a folder in tests; and a copy of a file sent
// there while the file itself stays.

import { randomBytes } from 'node:crypto';
import { copyFile, lstat, mkdir, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { moveToTrash } from '@hyperpane/sdk/server';
import type { Repo } from './repo.ts';

/** Where discarded files go: the Trash (or Recycle Bin) by default; tests
 * give a folder. */
export type Trash = (file: string) => Promise<void>;

export const systemTrash: Trash = (file) => moveToTrash(file);

/** A folder standing in for the Trash (tests): files are moved into it. */
export function folderTrash(dir: string): Trash {
  return async (file) => {
    await mkdir(dir, { recursive: true });
    let to = path.join(dir, path.basename(file));
    for (let n = 1; await lstat(to).then(() => true, () => false); n++) to = path.join(dir, `${path.basename(file)} ${n}`);
    const { rename } = await import('node:fs/promises');
    await rename(file, to);
  };
}

/** A copy of a file to the Trash, under its own name; the file stays. */
export async function copyToTrash(repo: Repo, file: string, trash: Trash) {
  const dir = path.join(repo.gitDir, 'hyperpane-discarded', randomBytes(6).toString('hex'));
  await mkdir(dir, { recursive: true });
  const copy = path.join(dir, path.basename(file));
  try {
    await copyFile(file, copy);
    await trash(copy);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rmdir(path.dirname(dir)).catch(() => {});
  }
}
