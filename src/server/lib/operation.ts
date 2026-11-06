// What's under way (a merge, a rebase, a cherry-pick, a revert, `am`, a
// bisect), from the files git keeps in its folder while it is.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Operation } from '../../shared/index.ts';

/** What's under way, from the files git keeps while it is. */
export async function operation(gitDir: string): Promise<Operation | null> {
  const read = async (name: string) => {
    try {
      return (await readFile(path.join(gitDir, name), 'utf8')).trim();
    } catch {
      return null;
    }
  };
  const isDir = (name: string) => stat(path.join(gitDir, name)).then((s) => s.isDirectory(), () => false);
  const exists = (name: string) => stat(path.join(gitDir, name)).then(() => true, () => false);
  const number = async (name: string) => {
    const v = await read(name);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const short = (s: string | null) => (s ? s.replace(/^refs\/heads\//, '') : undefined);
  const clean = (o: Operation) => {
    for (const k of Object.keys(o) as (keyof Operation)[]) if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k];
    return o;
  };
  const message = async () => {
    const m = await read('MERGE_MSG');
    return m
      ?.split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n')
      .trim();
  };

  if (await isDir('rebase-merge')) {
    return clean({
      kind: 'rebase',
      branch: short(await read('rebase-merge/head-name')),
      onto: (await read('rebase-merge/onto')) ?? undefined,
      step: await number('rebase-merge/msgnum'),
      total: await number('rebase-merge/end'),
      head: (await read('rebase-merge/stopped-sha')) ?? undefined,
      message: await message(),
    });
  }
  if (await isDir('rebase-apply')) {
    const am = await exists('rebase-apply/applying');
    return clean({
      kind: am ? 'am' : 'rebase',
      branch: short(await read('rebase-apply/head-name')),
      onto: (await read('rebase-apply/onto')) ?? undefined,
      step: await number('rebase-apply/next'),
      total: await number('rebase-apply/last'),
    });
  }
  if (await exists('MERGE_HEAD')) {
    return clean({ kind: 'merge', head: (await read('MERGE_HEAD'))?.split('\n')[0], message: await message() });
  }
  if (await exists('CHERRY_PICK_HEAD')) {
    return clean({ kind: 'cherryPick', head: (await read('CHERRY_PICK_HEAD')) ?? undefined, message: await message() });
  }
  if (await exists('REVERT_HEAD')) {
    return clean({ kind: 'revert', head: (await read('REVERT_HEAD')) ?? undefined, message: await message() });
  }
  // A cherry-pick or revert of several commits that stopped (sequencer).
  if (await isDir('sequencer')) {
    const todo = (await read('sequencer/todo')) ?? '';
    const first = todo.split('\n')[0] ?? '';
    if (/^(p|pick)\s/.test(first)) return { kind: 'cherryPick' };
    if (/^revert\s/.test(first)) return { kind: 'revert' };
  }
  if (await exists('BISECT_LOG')) return { kind: 'bisect' };
  return null;
}
