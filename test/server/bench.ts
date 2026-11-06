// Timings on a big generated repository (50 000 commits, 10 000 files, a
// 5 MB diff): status, the first page of history, a deep page, a huge diff,
// branches, blame, a file's history, and the watch's first status. Not a
// test (it takes a while): run it by hand,
//
//   node --import ./node_modules/@hyperpane/sdk/register.mjs test/server/bench.ts [folder] [commits] [files]
//
// The repository is made in `folder` (kept, and reused when it's there).

import { stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { invoke, stream, testHost } from '@hyperpane/sdk/testing';
import { makeGit } from '../../src/server/plugin.ts';
import { folderTrash } from '../../src/server/lib/trash.ts';
import type { Diff, LogPage, Status } from '../../src/shared/index.ts';
import { makeBigRepo, pathOf } from './bigrepo.ts';

const dir = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'git-bench-repo'));
const commits = Number(process.argv[3] ?? 50_000);
const files = Number(process.argv[4] ?? 10_000);
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };

if (!(await stat(path.join(dir, '.git')).then(() => true, () => false))) {
  const t = Date.now();
  await makeBigRepo(dir, { commits, files }, env);
  console.log(`made ${commits} commits, ${files} files in ${((Date.now() - t) / 1000).toFixed(1)} s: ${dir}`);
}

// Some changes, and one 5 MB one.
for (let i = 0; i < 50; i++) await writeFile(path.join(dir, pathOf(i * 97)), `// changed ${i}\n`);
const big = Array.from({ length: 80_000 }, (_, i) => `export const line${i} = ${'"x"'.repeat(20)}; // ${i}`).join('\n') + '\n';
await writeFile(path.join(dir, pathOf(1)), big);
await writeFile(path.join(dir, 'untracked.txt'), 'new\n');

const host = testHost({ id: 'git', settings: { gitPath: '', autoFetch: 'off', defaultBranch: 'main' } });
const git = makeGit({ trash: folderTrash(path.join(os.tmpdir(), 'git-bench-trash')) })(host);
const call = <T>(r: Record<string, unknown>) => invoke<T>(git, { repo: dir, ...r });

async function time<T>(label: string, fn: () => Promise<T>, runs = 5, describe?: (v: T) => string): Promise<T> {
  const took: number[] = [];
  let value!: T;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    value = await fn();
    took.push(performance.now() - t);
  }
  took.sort((a, b) => a - b);
  const median = took[Math.floor(took.length / 2)];
  console.log(`${label.padEnd(44)} median ${median.toFixed(0).padStart(5)} ms   first ${took[0].toFixed(0).padStart(5)}..${took[took.length - 1].toFixed(0)} ms${describe ? `   ${describe(value)}` : ''}`);
  return value;
}

console.log(`git ${(await call<{ version: string }>({ op: 'version' })).version}, Node ${process.version}, ${os.cpus()[0]?.model ?? ''}`);
await time('status', () => call<Status>({ op: 'status' }), 7, (s) => `${s.files.length} changed files`);
await time('status with line stats', () => call<Status>({ op: 'status', stats: true }), 5);
await time('log: first page (100, topo order)', () => call<LogPage>({ op: 'log', skip: 0, limit: 100 }), 7, (p) => `${p.commits.length} commits, more: ${p.more}`);
await time('log: all branches, first page', () => call<LogPage>({ op: 'log', all: true, skip: 0, limit: 100 }), 5);
await time('log: page at 25 000', () => call<LogPage>({ op: 'log', skip: 25_000, limit: 100 }), 3);
await time('log: message search', () => call<LogPage>({ op: 'log', search: 'merge side work', skip: 0, limit: 100 }), 3, (p) => `${p.commits.length} found`);
await time('log: a path', () => call<LogPage>({ op: 'log', path: pathOf(42), skip: 0, limit: 100 }), 3, (p) => `${p.commits.length} found`);
await time('diff: 5 MB file (capped, too large)', () => call<Diff>({ op: 'diff', path: pathOf(1) }), 5, (d) => `tooLarge ${d.tooLarge}, +${d.additions} -${d.deletions}, ${(d.size / 1e6).toFixed(1)} MB`);
await time('diff: 5 MB file, full ("show anyway")', () => call<Diff>({ op: 'diff', path: pathOf(1), full: true }), 3, (d) => `${d.hunks.reduce((n, h) => n + h.lines.length, 0)} lines, ${(JSON.stringify(d).length / 1e6).toFixed(1)} MB of JSON`);
await time('diff: a small change', () => call<Diff>({ op: 'diff', path: pathOf(97) }), 5);
await time('show HEAD', () => call({ op: 'show', sha: 'HEAD' }), 5);
await time('branches', () => call({ op: 'branches' }), 5);
await time('fileLog (follow)', () => call<LogPage>({ op: 'fileLog', path: pathOf(42), skip: 0, limit: 100 }), 3, (p) => `${p.commits.length} commits`);
await time('blame', () => call({ op: 'blame', path: pathOf(42) }), 3);
await time('authors (last 2 000 commits)', () => call({ op: 'authors' }), 3);
await time('watch: first status', async () => {
  const w = stream<Status>(git, { op: 'watch', repo: dir });
  await w.next();
  w.cancel();
  await w.end;
}, 3);
// The watch wrote the commit-graph (if it was missing): history again.
const graph = path.join(dir, '.git', 'objects', 'info', 'commit-graph');
for (let i = 0; i < 200 && !(await stat(graph).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 50));
console.log(`\nwith the commit-graph (${(await stat(graph).then(() => true, () => false)) ? 'written by the first watch' : 'missing'}):`);
await time('log: first page (100, topo order)', () => call<LogPage>({ op: 'log', skip: 0, limit: 100 }), 7);
await time('log: all branches, first page', () => call<LogPage>({ op: 'log', all: true, skip: 0, limit: 100 }), 5);
await time('log: page at 25 000', () => call<LogPage>({ op: 'log', skip: 25_000, limit: 100 }), 3);
await time('log: a path', () => call<LogPage>({ op: 'log', path: pathOf(42), skip: 0, limit: 100 }), 3);
await time('branches', () => call({ op: 'branches' }), 5);
await time('fileLog (follow)', () => call<LogPage>({ op: 'fileLog', path: pathOf(42), skip: 0, limit: 100 }), 3);
await time('blame', () => call({ op: 'blame', path: pathOf(42) }), 3);
await git.shutdown?.();
