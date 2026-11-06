// Temporary repositories for the server's tests, and the plugin made with a
// test host whose Trash is a folder.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { shown } from '@hyperpane/sdk/server';
import { type TestBus, type TestHost, invoke, stream, testBus, testHost } from '@hyperpane/sdk/testing';
import { makeGit } from '../../src/server/plugin.ts';
import { folderTrash } from '../../src/server/lib/trash.ts';

export const WIN = process.platform === 'win32';

/** A path as the plugin gives it (forward slashes on Windows). */
export const as = (p: string) => shown(p);

/** Git as the tests run it: a fixed identity and dates, no system config. */
export const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Ada Lovelace',
  GIT_AUTHOR_EMAIL: 'ada@example.com',
  GIT_COMMITTER_NAME: 'Ada Lovelace',
  GIT_COMMITTER_EMAIL: 'ada@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

let home: string | null = null;

/** A home folder of its own, so the user's global git config stays out
 * (and the plugin's git calls see the same). */
async function testHome(): Promise<string> {
  if (home) return home;
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-plugin-home-')));
  await writeFile(
    path.join(home, '.gitconfig'),
    '[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n[protocol "file"]\n\tallow = always\n',
  );
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = path.join(home, '.config');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  ENV.HOME = home;
  ENV.USERPROFILE = home;
  ENV.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
  after(() => rm(home!, { recursive: true, force: true }));
  return home;
}

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A new empty folder, removed after the tests. */
export async function folder(prefix = 'git-plugin-'): Promise<string> {
  await testHome();
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository with `files` committed (if any), on main. */
export async function repo(files: Record<string, string | Buffer> = {}, message = 'first'): Promise<string> {
  const dir = await folder('git-repo-');
  sh(dir, 'init', '-q', '-b', 'main');
  if (Object.keys(files).length) {
    await write(dir, files);
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-q', '-m', message);
  }
  return dir;
}

export async function write(dir: string, files: Record<string, string | Buffer>) {
  for (const [name, text] of Object.entries(files)) {
    const p = path.join(dir, name);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, text);
  }
}

export function commitAll(dir: string, message: string) {
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', message);
  return sh(dir, 'rev-parse', 'HEAD').trim();
}

export interface Made {
  host: TestHost;
  bus: TestBus;
  plugin: ReturnType<ReturnType<typeof makeGit>>;
  trash: string;
  call<T = any>(request: Record<string, unknown>): Promise<T>;
  stream: typeof stream;
}

/** The plugin with a test host, its Trash a folder. */
export async function plugin(o: { projects?: { id: string; name: string; folder: string }[]; settings?: Record<string, unknown>; promptTimeout?: number; minute?: number } = {}): Promise<Made> {
  await testHome();
  const trash = await folder('git-trash-');
  const data = await folder('git-data-');
  const bus = testBus();
  const host = testHost({
    id: 'git',
    bus,
    dataDir: data,
    events: { publish: ['git.changed', 'git.committed', 'git.checkedOut'], subscribe: ['git.status', 'git.open', 'git.changed', 'git.committed', 'git.checkedOut'] },
    projects: o.projects ?? [],
    settings: { gitPath: '', autoFetch: 'off', defaultBranch: 'main', ...(o.settings ?? {}) },
  });
  const p = makeGit({ trash: folderTrash(trash), promptTimeout: o.promptTimeout, minute: o.minute })(host);
  after(() => p.shutdown?.());
  return { host, bus, plugin: p, trash, call: (request) => invoke(p, request), stream };
}

export async function trashed(trash: string): Promise<string[]> {
  return (await readdir(trash).catch(() => [])).sort();
}

/** Waits until `check` says yes (or fails after `ms`). */
export async function until(check: () => boolean | Promise<boolean>, ms = 5000, what = 'it'): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Waited ${ms} ms for ${what}.`);
}
