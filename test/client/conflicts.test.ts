// Conflicts on real repositories: a merge that stops lists its conflicted
// files first, the bar says so (Continue, Abort); a file's conflicts are
// chosen block by block in the window and saved resolved; then the merge
// is continued. Or aborted (asked first).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { button, click, open, read, realPart, repo, sh, until, write } from './support/frame.ts';

const { GitWindow } = await import('../../src/client/app/GitWindow.tsx');

async function window(t: { after(fn: () => void): void }, dir: string) {
  const { part } = await realPart(t, dir);
  const f = await open(GitWindow as never, { folder: dir, part });
  t.after(() => f.close());
  await until(() => f.root.querySelector('[data-git]'), 10000, 'the repository');
  return f;
}

const MID = Array.from({ length: 10 }, (_, i) => `m${i}\n`).join('');

/** main and feature both change line 2 (and 13) of a.txt; merging stops. */
function conflicted(t: { after(fn: () => void): void }) {
  const dir = repo(t, { 'a.txt': `1\n2\n${MID}5\n6\n`, 'b.txt': 'b\n' });
  sh(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, { 'a.txt': `1\ntheirs two\n${MID}theirs five\n6\n` });
  sh(dir, 'commit', '-q', '-am', 'theirs');
  sh(dir, 'checkout', '-q', 'main');
  write(dir, { 'a.txt': `1\nours two\n${MID}ours five\n6\n` });
  sh(dir, 'commit', '-q', '-am', 'ours');
  try {
    sh(dir, 'merge', 'feature');
  } catch {
    // It stops at the conflict: that's the point.
  }
  return dir;
}

test('a merge stopped at conflicts: the bar, the file first, its blocks chosen and saved, then Continue', async (t) => {
  const dir = conflicted(t);
  const w = await window(t, dir);
  const bar = await until(() => w.root.querySelector<HTMLElement>('[data-operation="merge"]'), 10000, 'the bar');
  assert.match(bar.textContent!, /Merging/);
  assert.match(bar.textContent!, /1 file with conflicts/);
  assert.ok(button(bar, 'Continue')!.disabled);
  // The tab says so; the conflict is picked and shown three ways.
  assert.ok(w.root.querySelector('[data-tab="changes"]')!.textContent!.includes('1'));
  const view = await until(() => w.root.querySelector<HTMLElement>('[data-conflict="a.txt"]'), 10000, 'the conflict');
  await until(() => view.querySelectorAll('[data-block]').length === 2, 10000, 'two blocks');
  assert.match(view.textContent!, /0 of 2 conflicts chosen/);
  const [one, two] = [...view.querySelectorAll<HTMLElement>('[data-block]')];
  assert.match(one.textContent!, /ours two/);
  assert.match(one.textContent!, /theirs two/);
  click(button(one, 'Theirs')!);
  click(button(two, 'Both')!);
  await until(() => view.textContent!.includes('2 of 2 conflicts chosen'), 8000, () => `chosen: ${view.isConnected} ${w.root.querySelector('[data-conflict]')?.textContent?.slice(0, 200)}`);
  click(button(view, 'Save and Mark Resolved')!);
  await until(() => read(dir, 'a.txt') === `1\ntheirs two\n${MID}ours five\ntheirs five\n6\n`, 10000, 'the merged file');
  await until(() => !sh(dir, 'diff', '--name-only', '--diff-filter=U').trim(), 10000, 'resolved');
  // Continue commits the merge with its prepared message.
  const cont = await until(() => {
    const b = button(w.root.querySelector('[data-operation="merge"]') ?? w.root, 'Continue');
    return b && !b.disabled && b;
  }, 10000, 'Continue enabled');
  click(cont);
  await until(() => !w.root.querySelector('[data-operation]'), 10000, 'the merge done');
  assert.match(sh(dir, 'log', '-1', '--format=%s'), /Merge branch 'feature'/);
  assert.equal(sh(dir, 'rev-list', '--parents', '-n1', 'HEAD').trim().split(' ').length, 3);
});

test('Use Ours takes our side of a whole file; Abort (asked) puts everything back', async (t) => {
  const dir = conflicted(t);
  const w = await window(t, dir);
  const view = await until(() => w.root.querySelector<HTMLElement>('[data-conflict="a.txt"]'), 10000, 'the conflict');
  click(button(view, 'Use Ours')!);
  await until(() => read(dir, 'a.txt') === `1\nours two\n${MID}ours five\n6\n` && !sh(dir, 'diff', '--name-only', '--diff-filter=U').trim(), 10000, 'ours');
  const bar = await until(() => w.root.querySelector<HTMLElement>('[data-operation="merge"]'));
  click(button(bar, 'Abort')!);
  await until(() => !w.root.querySelector('[data-operation]'), 10000, 'aborted');
  assert.equal(w.app.last('ui.confirm').title, 'Abort the merge?');
  assert.equal(sh(dir, 'status', '--porcelain').trim(), '');
  assert.equal(sh(dir, 'log', '-1', '--format=%s').trim(), 'ours');
});
