// A bigger repository (made with fast-import): status, the first log page
// and a huge diff stay fast; the first watch writes the commit-graph; a
// cancelled git ends at once with everything it started. (bench.ts times
// 50 000 commits and 10 000 files by hand.)

import assert from 'node:assert/strict';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { stream, testHost } from '@hyperpane/sdk/testing';
import { Git } from '../../src/server/lib/git.ts';
import { Cancelled } from '../../src/server/lib/process.ts';
import type { Diff, LogPage, Status } from '../../src/shared/index.ts';
import { makeBigRepo, pathOf } from './bigrepo.ts';
import { ENV, WIN, folder, plugin, until } from './support.ts';

const g = await plugin();
const dir = path.join(await folder('git-big-'), 'big');
await makeBigRepo(dir, { commits: 4000, files: 2000 }, ENV);

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, performance.now() - t];
}

test('status, a log page and a 5 MB diff, in time', async () => {
  for (let i = 0; i < 20; i++) await writeFile(path.join(dir, pathOf(i * 31)), `// changed ${i}\n`);
  const big = Array.from({ length: 60_000 }, (_, i) => `export const line${i} = ${'"x"'.repeat(20)};`).join('\n') + '\n';
  await writeFile(path.join(dir, pathOf(1)), big);
  const [s, statusMs] = await timed(() => g.call<Status>({ op: 'status', repo: dir }));
  assert.equal(s.files.length, 21);
  const [page, logMs] = await timed(() => g.call<LogPage>({ op: 'log', repo: dir, skip: 0, limit: 100 }));
  assert.equal(page.commits.length, 100);
  assert.equal(page.more, true);
  assert.ok(page.commits.some((c) => c.parents.length === 2), 'merges are in the history');
  const [d, diffMs] = await timed(() => g.call<Diff>({ op: 'diff', repo: dir, path: pathOf(1) }));
  assert.equal(d.tooLarge, true);
  assert.ok(d.size > 2 * 1024 * 1024);
  // Generous: CI machines are slow. bench.ts has the real numbers.
  assert.ok(statusMs < 3000, `status took ${statusMs} ms`);
  assert.ok(logMs < 3000, `log took ${logMs} ms`);
  assert.ok(diffMs < 3000, `diff took ${diffMs} ms`);
});

test('the first watch writes the commit-graph', async () => {
  const graph = path.join(dir, '.git', 'objects', 'info', 'commit-graph');
  assert.equal(await stat(graph).then(() => true, () => false), false);
  const w = stream<Status>(g.plugin, { op: 'watch', repo: dir });
  await w.next();
  await until(() => stat(graph).then(() => true, () => false), 20_000, 'the commit-graph');
  w.cancel();
  assert.equal(await w.end, null);
  // The history reads the same with it: 4 000 commits and 40 merged side ones.
  const page = await g.call<LogPage>({ op: 'log', repo: dir, skip: 4000, limit: 100 });
  assert.equal(page.commits.length, 40);
  assert.equal(page.more, false);
});

test('a cancelled git ends at once, with what it started', async () => {
  const git = new Git(testHost({ id: 'git' }), async () => '');
  const controller = new AbortController();
  let pid = 0;
  const started = Date.now();
  const run = git.exec(dir, ['-c', 'alias.wait=!f() { echo $$; sleep 30; }; f', 'wait'], {
    signal: controller.signal,
    onStdout: (chunk) => {
      pid = Number(chunk.toString().trim());
      controller.abort();
    },
  });
  await assert.rejects(run, (e) => e instanceof Cancelled && e.message === 'Cancelled.');
  assert.ok(Date.now() - started < 5000);
  assert.ok(pid > 0);
  // The shell the alias ran (and its sleep) went with git. (On Windows $$ is
  // the shell's own id, not the system's.)
  if (!WIN) await until(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  }, 3000, 'the shell to end');
  assert.equal(git.running, 0);
});
