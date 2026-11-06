// `resolve`: a conflicted file resolved by taking one side, by the merged
// text the three-way view made (the working copy goes to the Trash first),
// or marked resolved as it is.

import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PluginError } from '@hyperpane/sdk/server';
import { checkPaths, literal } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';
import { type Trash, copyToTrash } from '../lib/trash.ts';

/** Takes one side of a conflicted file and marks it resolved; or marks the
 * file resolved as it is. */
export async function resolve(repo: Repo, file: unknown, side: unknown, trash: Trash, text?: unknown, mark?: boolean) {
  const [p] = checkPaths([file]);
  const spec = literal(p);
  if (side === 'text') {
    // The merged text the three-way view made: written over the working
    // copy (which goes to the Trash first), and staged with `mark`.
    if (typeof text !== 'string') throw new PluginError('The merged text is missing.');
    const full = repo.file(p);
    const st = await lstat(full).then((s) => s, () => null);
    if (st && !st.isFile()) throw new PluginError(`${p} isn't a file.`);
    if (st) await copyToTrash(repo, full, trash);
    else await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text);
    if (mark) await resolve(repo, p, 'mark', trash);
    return;
  }
  if (side === 'mark') {
    const full = repo.file(p);
    const there = await lstat(full).then((s) => s.isFile(), () => false);
    if (there) {
      const text = await readFile(full, 'utf8').catch(() => '');
      if (/^<{7}( |$)/m.test(text) && /^>{7}( |$)/m.test(text)) throw new PluginError(`${p} still has conflict markers.`);
      await repo.run(['add', '--', spec]);
    } else await repo.run(['rm', '-q', '--cached', '--ignore-unmatch', '--', spec]);
    return;
  }
  const stage = side === 'ours' ? '2' : side === 'theirs' ? '3' : null;
  if (!stage) throw new PluginError('Take ours or theirs, or give the merged text.');
  const stages = await repo.text(['ls-files', '-u', '-z', '--', spec]);
  const has = stages.split('\0').some((e) => e.split(/\s+/)[2] === stage);
  if (has) {
    await repo.run(['checkout', `--${side}`, '--', spec]);
    await repo.run(['add', '--', spec]);
  } else {
    // That side deleted it.
    await repo.run(['rm', '-q', '-f', '--', spec]);
  }
}
