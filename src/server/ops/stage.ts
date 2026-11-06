// `stage`, `unstage`, `discard` and `ignore`: whole files in and out of the
// index; files put back as the last commit has them (what's there now goes
// to the Trash first); a pattern added to `.gitignore`.

import { lstat, readFile, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PluginError } from '@hyperpane/sdk/server';
import { asList } from '../lib/args.ts';
import { parseStatus } from '../lib/parse-status.ts';
import { checkPaths, nulList } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';
import { type Trash, copyToTrash } from '../lib/trash.ts';

export async function stage(repo: Repo, paths: unknown, all: boolean) {
  if (all) {
    await repo.run(['add', '-A']);
    return;
  }
  const list = checkPaths(asList(paths));
  if (!list.length) return;
  await repo.run(['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(list) });
}

export async function unstage(repo: Repo, paths: unknown, all: boolean) {
  const hasHead = await repo.hasHead();
  if (all) {
    if (hasHead) await repo.run(['reset', '-q']);
    else await repo.run(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '.']);
    return;
  }
  const list = checkPaths(asList(paths));
  if (!list.length) return;
  if (hasHead) {
    // `reset` keeps a conflicted file's resolution out of the way too.
    await repo.run(['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(list) });
  } else {
    await repo.run(['rm', '-q', '--cached', '-r', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(list) });
  }
}

/**
 * Puts files back as the last commit has them, staged and unstaged changes
 * alike; new files go. What's there now goes to the Trash first: a copy of
 * a changed file (git writes the old one back), a new file itself.
 */
export async function discard(repo: Repo, paths: unknown, trash: Trash) {
  const list = checkPaths(asList(paths));
  if (!list.length) return;
  // The whole status (renames are found only with both paths in it), then
  // the files asked for: by path, a rename's old path, or a folder's.
  const wanted = new Set(list);
  const folders = list.map((p) => `${p.replace(/\/+$/, '')}/`);
  const out = await repo.run(['status', '--porcelain=v2', '--untracked-files=all', '-z']);
  const files = parseStatus(out.stdout, Infinity).files.filter(
    (f) => wanted.has(f.path) || (f.from !== undefined && wanted.has(f.from)) || folders.some((d) => f.path.startsWith(d)),
  );
  const names: { name: string; untracked: boolean }[] = [];
  for (const f of files) {
    names.push({ name: f.path, untracked: f.untracked });
    if (f.from) names.push({ name: f.from, untracked: false });
  }
  // Which are in HEAD: one cat-file for all of them.
  const inHead = new Set<string>();
  if (names.length && (await repo.hasHead())) {
    const input = names.map((n) => `HEAD:${n.name}\n`).join('');
    const out = await repo.exec(['cat-file', '--batch-check=%(objecttype)'], { input });
    const answers = out.stdout.toString('utf8').split('\n');
    names.forEach((n, i) => {
      if (answers[i] && !answers[i].endsWith('missing')) inHead.add(n.name);
    });
  }
  const restore: string[] = [];
  const fromIndex: string[] = [];
  const gone: string[] = [];
  for (const n of names) {
    if (inHead.has(n.name)) restore.push(n.name);
    else {
      if (!n.untracked) fromIndex.push(n.name);
      gone.push(n.name);
    }
  }
  for (const name of restore) {
    const file = repo.file(name);
    if (await lstat(file).then((s) => s.isFile(), () => false)) await copyToTrash(repo, file, trash);
  }
  for (const name of gone) {
    const file = repo.file(name);
    if (await lstat(file).then((s) => !s.isDirectory(), () => false)) await trash(file);
  }
  if (fromIndex.length) {
    await repo.run(['rm', '-q', '--cached', '-r', '-f', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(fromIndex) });
  }
  if (restore.length) {
    await repo.run(['restore', '--source=HEAD', '--staged', '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(restore) });
  }
  for (const name of gone) await removeEmptyParents(repo.root, repo.file(name));
}

async function removeEmptyParents(root: string, file: string) {
  let dir = path.dirname(file);
  while (dir !== root && dir.startsWith(root + path.sep)) {
    try {
      await rmdir(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/** Adds a pattern to the repository's `.gitignore` (once). */
export async function ignore(repo: Repo, pattern: unknown) {
  const p = typeof pattern === 'string' ? pattern.trim() : '';
  if (!p || /[\r\n]/.test(p)) throw new PluginError("That isn't a pattern.");
  const file = path.join(repo.root, '.gitignore');
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch {
    // None yet.
  }
  if (text.split(/\r?\n/).some((l) => l.trim() === p)) return;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (text && !text.endsWith('\n')) text += eol;
  try {
    await writeFile(file, `${text}${p}${eol}`);
  } catch (e) {
    throw new PluginError(`Couldn't write .gitignore: ${(e as Error).message}.`);
  }
}
