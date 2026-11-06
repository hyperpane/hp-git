// `find` and `init`: finding repositories (the one a folder is in, its
// submodules, others nested below it) and making one.

import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { PluginError, shown } from '@hyperpane/sdk/server';
import type { Found } from '../../shared/index.ts';
import type { Git } from '../lib/git.ts';
import { whole } from '../lib/repo.ts';

/** Folders never looked in for nested repositories. */
const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', 'out', 'vendor', '.venv', 'venv', '__pycache__', '.cache', '.next', '.gradle', 'Pods', 'DerivedData', '.hyperpane']);
const DEPTH = 6;
const FOLDERS_MAX = 5000;

export async function find(git: Git, p: unknown): Promise<Found> {
  const full = whole(p);
  const st = await stat(full).catch(() => null);
  if (!st) throw new PluginError(`${shown(full)} isn't there.`);
  const folder = st.isDirectory() ? full : path.dirname(full);
  const out = await git.exec(folder, ['rev-parse', '--is-bare-repository', '--absolute-git-dir', '--show-toplevel']);
  const lines = out.stdout.toString('utf8').split('\n');
  const found: Found = { root: null, gitDir: null, bare: false, repos: [] };
  let root: string | null = null;
  if (out.code === 0 || (lines[0] === 'true' && lines[1])) {
    found.bare = lines[0] === 'true';
    if (lines[1]) found.gitDir = shown(path.resolve(lines[1]));
    if (!found.bare && lines[2]) {
      root = path.resolve(lines[2]);
      found.root = shown(root);
      found.repos.push({ root: found.root, kind: 'main', name: path.basename(root) });
    }
  }
  const submodules = new Set<string>();
  if (root) {
    const mods = await git.exec(root, ['config', '-z', '-f', '.gitmodules', '--get-regexp', String.raw`^submodule\..*\.path$`]);
    for (const entry of mods.stdout.toString('utf8').split('\0')) {
      const nl = entry.indexOf('\n');
      if (nl < 0) continue;
      const dir = path.join(root, ...entry.slice(nl + 1).split('/'));
      if (await stat(path.join(dir, '.git')).then(() => true, () => false)) submodules.add(dir);
    }
  }
  const base = root ?? folder;
  const nested: string[] = [];
  let seen = 0;
  let level: string[] = [base];
  for (let depth = 0; depth < DEPTH && level.length && seen < FOLDERS_MAX; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory() || SKIP.has(e.name)) continue;
        if (++seen > FOLDERS_MAX) break;
        const child = path.join(dir, e.name);
        if (await stat(path.join(child, '.git')).then(() => true, () => false)) {
          if (!submodules.has(child)) nested.push(child);
        }
        next.push(child);
      }
    }
    level = next;
  }
  for (const dir of [...submodules].sort()) found.repos.push({ root: shown(dir), kind: 'submodule', name: path.relative(base, dir).split(path.sep).join('/') });
  for (const dir of nested.sort()) found.repos.push({ root: shown(dir), kind: 'nested', name: path.relative(base, dir).split(path.sep).join('/') });
  return found;
}

export async function init(git: Git, p: unknown, branch: unknown, defaultBranch: string): Promise<{ root: string }> {
  const full = whole(p);
  const st = await stat(full).catch(() => null);
  if (!st?.isDirectory()) throw new PluginError(`${shown(full)} isn't a folder.`);
  const args = ['init', '--quiet'];
  let b = typeof branch === 'string' ? branch.trim() : '';
  if (!b) {
    const configured = await git.exec(full, ['config', '--get', 'init.defaultBranch']);
    if (configured.code !== 0) b = defaultBranch.trim() || 'main';
  }
  if (b) {
    if (b.startsWith('-') || !(await git.ok(full, ['check-ref-format', '--branch', b]))) throw new PluginError(`“${b}” isn't a valid branch name.`);
    args.push('-b', b);
  }
  await git.run(full, args);
  return { root: shown(full) };
}
