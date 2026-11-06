// Branches, checkout, merging, rebasing, cherry-picking, reverting and
// resetting, with conflicts and operations in progress; stashes, tags and
// remotes.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { Branches, CommitDetail, Diff, Outcome, Stash, Status, Tag } from '../../src/shared/index.ts';
import { as, commitAll, plugin, repo, sh, trashed, write } from './support.ts';

const g = await plugin();
const st = (dir: string) => g.call<Status>({ op: 'status', repo: dir });

/** main and topic, both changing line 2 of a.txt. */
async function diverged() {
  const dir = await repo({ 'a.txt': 'one\ntwo\nthree\n' });
  sh(dir, 'switch', '-q', '-c', 'topic');
  await write(dir, { 'a.txt': 'one\nTOPIC\nthree\n' });
  const topic = commitAll(dir, 'On topic');
  sh(dir, 'switch', '-q', 'main');
  await write(dir, { 'a.txt': 'one\nMAIN\nthree\n' });
  const main = commitAll(dir, 'On main');
  return { dir, topic, main };
}

test('lists branches: local with upstream and ahead/behind, remote, merged, recent', async () => {
  const remote = await repo();
  sh(remote, 'config', 'receive.denyCurrentBranch', 'ignore');
  const dir = await repo({ 'a.txt': 'a\n' });
  sh(dir, 'remote', 'add', 'origin', remote);
  sh(dir, 'push', '-q', '-u', 'origin', 'main');
  await write(dir, { 'b.txt': 'b\n' });
  commitAll(dir, 'Ahead');
  sh(dir, 'branch', 'merged-one', 'HEAD~1');
  sh(dir, 'switch', '-q', '-c', 'unmerged');
  await write(dir, { 'c.txt': 'c\n' });
  commitAll(dir, 'Only here');
  sh(dir, 'switch', '-q', 'main');
  const b = await g.call<Branches>({ op: 'branches', repo: dir });
  assert.equal(b.current, 'main');
  const main = b.local.find((x) => x.name === 'main')!;
  assert.deepEqual([main.upstream, main.ahead, main.behind, main.current, main.merged], ['origin/main', 1, 0, true, true]);
  assert.equal(main.subject, 'Ahead');
  assert.equal(b.local.find((x) => x.name === 'unmerged')!.merged, false);
  assert.equal(b.local.find((x) => x.name === 'merged-one')!.merged, true);
  assert.deepEqual(b.remote.map((r) => [r.name, r.remote, r.branch]), [['origin/main', 'origin', 'main']]);
  assert.deepEqual(b.recent, ['main', 'unmerged']);
});

test('checks out: a branch, a new one, a remote one (tracked), a commit (detached); publishes it', async () => {
  const remote = await repo({ 'r.txt': 'r\n' });
  sh(remote, 'switch', '-q', '-c', 'from-remote');
  await write(remote, { 'only-remote.txt': 'x\n' });
  commitAll(remote, 'Remote work');
  sh(remote, 'switch', '-q', 'main');
  const dir = await repo();
  sh(dir, 'remote', 'add', 'origin', remote);
  sh(dir, 'fetch', '-q', 'origin');
  sh(dir, 'switch', '-q', 'main');
  const p = await plugin({ projects: [{ id: 'p1', name: 'app', folder: dir }] });
  const checked = p.bus.next('git.checkedOut');
  await p.call({ op: 'checkout', repo: dir, ref: 'origin/from-remote' });
  assert.deepEqual((await checked).data, { repo: as(dir), branch: 'from-remote' });
  const s = await st(dir);
  assert.deepEqual([s.branch, s.upstream], ['from-remote', 'origin/from-remote']);
  await p.call({ op: 'checkout', repo: dir, ref: 'new-one', create: true, from: 'main' });
  assert.equal((await st(dir)).branch, 'new-one');
  await p.call({ op: 'checkout', repo: dir, ref: 'from-remote' });
  assert.equal((await st(dir)).branch, 'from-remote');
  const head = sh(dir, 'rev-parse', 'main').trim();
  await p.call({ op: 'checkout', repo: dir, ref: head });
  assert.deepEqual([(await st(dir)).detached, (await st(dir)).head], [true, head]);
  await assert.rejects(p.call({ op: 'checkout', repo: dir, ref: 'no-such-thing' }), { message: "There's no branch or commit no-such-thing here." });
  await assert.rejects(p.call({ op: 'checkout', repo: dir, ref: 'main', create: true }), { message: "There's a branch called main already." });
  await assert.rejects(p.call({ op: 'checkout', repo: dir, ref: 'bad..name', create: true }), { message: "“bad..name” isn't a valid branch name." });
  // A change in the way is said plainly.
  await p.call({ op: 'checkout', repo: dir, ref: 'main' });
  await write(dir, { 'only-remote.txt': 'mine\n' });
  await assert.rejects(p.call({ op: 'checkout', repo: dir, ref: 'from-remote' }), { message: /^New files here would be overwritten \(only-remote\.txt\)|^Your changes/ });
});

test('creates, renames, deletes (unmerged needs force) and sets upstreams of branches', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  await g.call({ op: 'branch', repo: dir, action: 'create', name: 'one' });
  await g.call({ op: 'branch', repo: dir, action: 'rename', name: 'one', to: 'two' });
  assert.ok((await g.call<Branches>({ op: 'branches', repo: dir })).local.some((b) => b.name === 'two'));
  await g.call({ op: 'branch', repo: dir, action: 'create', name: 'three', checkout: true });
  assert.equal((await st(dir)).branch, 'three');
  await write(dir, { 'b.txt': 'b\n' });
  commitAll(dir, 'Only on three');
  sh(dir, 'switch', '-q', 'main');
  await assert.rejects(g.call({ op: 'branch', repo: dir, action: 'delete', name: 'three' }), { message: "This branch isn't fully merged: deleting it loses its commits." });
  await g.call({ op: 'branch', repo: dir, action: 'delete', name: 'three', force: true });
  await assert.rejects(g.call({ op: 'branch', repo: dir, action: 'delete', name: 'main' }), { message: "This is the branch you're on: switch to another one first." });
  await g.call({ op: 'branch', repo: dir, action: 'setUpstream', upstream: 'two' });
  assert.equal(sh(dir, 'config', 'branch.main.merge').trim(), 'refs/heads/two');
  await g.call({ op: 'branch', repo: dir, action: 'setUpstream', upstream: null });
  assert.equal((await st(dir)).upstream, null);
});

test('a merge with conflicts: the operation, ours/theirs/text resolutions, continue', async () => {
  const { dir } = await diverged();
  await write(dir, { 'b.txt': 'base\n' });
  commitAll(dir, 'b on main');
  const out = await g.call<Outcome>({ op: 'merge', repo: dir, ref: 'topic' });
  assert.deepEqual(out, { conflicts: true, message: 'There are conflicts to resolve.' });
  let s = await st(dir);
  assert.equal(s.operation?.kind, 'merge');
  assert.match(s.operation!.message!, /^Merge branch 'topic'/);
  assert.equal(s.files[0].conflict, 'bothModified');
  // The conflicted file's diff (against ours), and its three sides.
  const d = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  assert.ok(d.hunks[0].lines.some((l) => l.text.startsWith('<<<<<<<')));
  assert.deepEqual((await g.call({ op: 'blob', repo: dir, path: 'a.txt', rev: ':3' })).lines, ['one', 'TOPIC', 'three']);
  assert.deepEqual((await g.call({ op: 'blob', repo: dir, path: 'a.txt', rev: ':1' })).lines, ['one', 'two', 'three']);
  // Continuing too soon, marking with markers left in: refused.
  await assert.rejects(g.call({ op: 'operation', repo: dir, action: 'continue' }), { message: 'Some files still have conflicts. Resolve them first.' });
  await assert.rejects(g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'mark' }), { message: 'a.txt still has conflict markers.' });
  await assert.rejects(g.call({ op: 'resolve', repo: dir, path: '../a.txt', side: 'text', text: 'x' }), { message: "../a.txt isn't a path in the repository." });
  // The merged text, block by block, written and marked; the old copy to the Trash.
  const before = (await trashed(g.trash)).length;
  await g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'text', text: 'one\nMAIN and TOPIC\nthree\n', mark: true });
  assert.equal((await trashed(g.trash)).length, before + 1);
  s = await st(dir);
  assert.deepEqual(s.files.map((f) => [f.path, f.staged, f.conflict]), [['a.txt', 'M', null]]);
  assert.deepEqual(await g.call({ op: 'operation', repo: dir, action: 'continue' }), { conflicts: false });
  s = await st(dir);
  assert.equal(s.operation, null);
  assert.equal(sh(dir, 'log', '-1', '--format=%s').trim(), "Merge branch 'topic'");
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'one\nMAIN and TOPIC\nthree\n');
});

test('ours, theirs, a side that deleted the file, and abort', async () => {
  const { dir } = await diverged();
  await g.call({ op: 'merge', repo: dir, ref: 'topic' });
  await g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'theirs' });
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'one\nTOPIC\nthree\n');
  await g.call({ op: 'operation', repo: dir, action: 'abort' });
  assert.equal((await st(dir)).operation, null);
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'one\nMAIN\nthree\n');
  // Deleted on topic, changed on main.
  sh(dir, 'switch', '-q', 'topic');
  sh(dir, 'rm', '-q', 'a.txt');
  commitAll(dir, 'Delete a');
  sh(dir, 'switch', '-q', 'main');
  assert.equal((await g.call<Outcome>({ op: 'merge', repo: dir, ref: 'topic' })).conflicts, true);
  assert.equal((await st(dir)).files[0].conflict, 'deletedByThem');
  await g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'theirs' });
  assert.deepEqual((await st(dir)).files.map((f) => [f.path, f.staged]), [['a.txt', 'D']]);
  await g.call({ op: 'operation', repo: dir, action: 'abort' });
  await assert.rejects(g.call({ op: 'operation', repo: dir, action: 'abort' }), { message: 'Nothing is under way to abort or continue.' });
});

test('a rebase in progress: step of total, continue, skip, abort', async () => {
  const { dir } = await diverged();
  sh(dir, 'switch', '-q', 'topic');
  await write(dir, { 'c.txt': 'c\n' });
  commitAll(dir, 'Topic 2');
  const out = await g.call<Outcome>({ op: 'rebase', repo: dir, onto: 'main' });
  assert.equal(out.conflicts, true);
  let s = await st(dir);
  assert.equal(s.operation?.kind, 'rebase');
  assert.equal(s.operation?.branch, 'topic');
  assert.deepEqual([s.operation?.step, s.operation?.total], [1, 2]);
  await g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'ours' });
  // Taking main's side leaves nothing to commit for this step: skipped.
  assert.deepEqual(await g.call({ op: 'operation', repo: dir, action: 'skip' }), { conflicts: false });
  s = await st(dir);
  assert.equal(s.operation, null);
  assert.equal(s.branch, 'topic');
  assert.deepEqual(sh(dir, 'log', '--format=%s', '-3').trim().split('\n'), ['Topic 2', 'On main', 'first']);
  // Again, aborted.
  const again = await diverged();
  sh(again.dir, 'switch', '-q', 'topic');
  await g.call({ op: 'rebase', repo: again.dir, onto: 'main' });
  await g.call({ op: 'operation', repo: again.dir, action: 'abort' });
  assert.equal((await st(again.dir)).operation, null);
  assert.equal(sh(again.dir, 'rev-parse', 'HEAD').trim(), again.topic);
  // And continued after a real resolution.
  const third = await diverged();
  sh(third.dir, 'switch', '-q', 'topic');
  await g.call({ op: 'rebase', repo: third.dir, onto: 'main' });
  await g.call({ op: 'resolve', repo: third.dir, path: 'a.txt', side: 'text', text: 'one\nBOTH\nthree\n', mark: true });
  assert.deepEqual(await g.call({ op: 'operation', repo: third.dir, action: 'continue' }), { conflicts: false });
  assert.equal(sh(third.dir, 'log', '-1', '--format=%s').trim(), 'On topic');
});

test('cherry-pick (with a conflict, continued), revert, reset soft/mixed/hard', async () => {
  const { dir, topic } = await diverged();
  assert.equal((await g.call<Outcome>({ op: 'cherryPick', repo: dir, sha: topic })).conflicts, true);
  assert.equal((await st(dir)).operation?.kind, 'cherryPick');
  assert.equal((await st(dir)).operation?.head, topic);
  await g.call({ op: 'resolve', repo: dir, path: 'a.txt', side: 'text', text: 'one\nPICKED\nthree\n', mark: true });
  assert.deepEqual(await g.call({ op: 'operation', repo: dir, action: 'continue' }), { conflicts: false });
  assert.equal(sh(dir, 'log', '-1', '--format=%s').trim(), 'On topic');
  // A clean pick.
  sh(dir, 'switch', '-q', 'topic');
  await write(dir, { 'clean.txt': 'c\n' });
  const clean = commitAll(dir, 'Clean');
  sh(dir, 'switch', '-q', 'main');
  assert.deepEqual(await g.call({ op: 'cherryPick', repo: dir, sha: clean }), { conflicts: false });
  // Revert it.
  assert.deepEqual(await g.call({ op: 'revert', repo: dir, sha: 'HEAD' }), { conflicts: false });
  assert.match(sh(dir, 'log', '-1', '--format=%s').trim(), /^Revert "Clean"/);
  const head = sh(dir, 'rev-parse', 'HEAD').trim();
  await g.call({ op: 'reset', repo: dir, sha: 'HEAD~1', mode: 'soft' });
  // The revert's change, staged.
  assert.deepEqual((await st(dir)).files.map((f) => [f.path, f.staged]), [['clean.txt', 'D']]);
  await g.call({ op: 'reset', repo: dir, sha: head, mode: 'mixed' });
  await write(dir, { 'a.txt': 'dirty\n' });
  await g.call({ op: 'reset', repo: dir, sha: 'HEAD~2', mode: 'hard' });
  assert.deepEqual((await st(dir)).files, []);
  await assert.rejects(g.call({ op: 'reset', repo: dir, sha: 'HEAD', mode: 'medium' }), { message: 'Reset soft, mixed or hard.' });
});

test('stashes: push (with untracked, a message), list, show, apply, pop with conflicts, drop', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  await assert.rejects(g.call({ op: 'stash', repo: dir, action: 'push' }), { message: 'There are no changes to stash.' });
  await write(dir, { 'a.txt': 'changed\n', 'new.txt': 'n\n' });
  await g.call({ op: 'stash', repo: dir, action: 'push', message: 'Work in progress' });
  assert.deepEqual((await st(dir)).files, []);
  assert.equal((await st(dir)).stashes, 1);
  const [s] = await g.call<Stash[]>({ op: 'stashes', repo: dir });
  assert.deepEqual([s.index, s.message, s.branch], [0, 'Work in progress', 'main']);
  const shown = await g.call<CommitDetail>({ op: 'stash', repo: dir, action: 'show', index: 0 });
  assert.deepEqual(shown.files.map((f) => [f.path, f.status, f.untracked ?? false]), [['a.txt', 'M', false], ['new.txt', 'A', true]]);
  const d = await g.call<Diff>({ op: 'diff', repo: dir, path: 'new.txt', commit: 'stash@{0}^3' });
  assert.equal(d.status, 'A');
  assert.deepEqual(await g.call({ op: 'stash', repo: dir, action: 'apply', index: 0 }), { conflicts: false });
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'changed\n');
  assert.equal((await g.call<Stash[]>({ op: 'stashes', repo: dir })).length, 1);
  // A pop that conflicts keeps the stash.
  sh(dir, 'checkout', '-q', '--', 'a.txt');
  sh(dir, 'clean', '-qfd');
  await write(dir, { 'a.txt': 'committed differently\n' });
  commitAll(dir, 'Differently');
  const pop = await g.call<Outcome>({ op: 'stash', repo: dir, action: 'pop', index: 0 });
  assert.deepEqual(pop, { conflicts: true, message: "The stash made conflicts, so it's kept. Resolve them, then drop the stash." });
  assert.equal((await g.call<Stash[]>({ op: 'stashes', repo: dir })).length, 1);
  sh(dir, 'reset', '-q', '--hard');
  sh(dir, 'clean', '-qfd');
  assert.equal(await g.call({ op: 'stash', repo: dir, action: 'drop', index: 0 }), null);
  assert.deepEqual(await g.call({ op: 'stashes', repo: dir }), []);
  await assert.rejects(g.call({ op: 'stash', repo: dir, action: 'show', index: 3 }), { message: "There's no such stash." });
});

test('tags: create (annotated), list, delete; remotes: add, rename, set URL, remove', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  const first = sh(dir, 'rev-parse', 'HEAD').trim();
  await write(dir, { 'b.txt': 'b\n' });
  commitAll(dir, 'Second');
  await g.call({ op: 'tag', repo: dir, action: 'create', name: 'v1.0', sha: first, message: 'The first release' });
  await g.call({ op: 'tag', repo: dir, action: 'create', name: 'light' });
  const list = await g.call<Tag[]>({ op: 'tags', repo: dir });
  const v1 = list.find((t) => t.name === 'v1.0')!;
  assert.deepEqual([v1.sha, v1.annotated, v1.message, v1.tagger], [first, true, 'The first release', 'Ada Lovelace']);
  const light = list.find((t) => t.name === 'light')!;
  assert.deepEqual([light.annotated, light.sha], [false, sh(dir, 'rev-parse', 'HEAD').trim()]);
  await assert.rejects(g.call({ op: 'tag', repo: dir, action: 'create', name: 'light' }), { message: "There's a tag called light already." });
  await assert.rejects(g.call({ op: 'tag', repo: dir, action: 'create', name: 'bad name' }), { message: "“bad name” isn't a valid tag name." });
  await g.call({ op: 'tag', repo: dir, action: 'delete', name: 'light' });
  assert.deepEqual((await g.call<Tag[]>({ op: 'tags', repo: dir })).map((t) => t.name), ['v1.0']);
  await g.call({ op: 'remote', repo: dir, action: 'add', name: 'origin', url: 'https://example.com/a.git' });
  await g.call({ op: 'remote', repo: dir, action: 'rename', name: 'origin', to: 'upstream' });
  await g.call({ op: 'remote', repo: dir, action: 'setUrl', name: 'upstream', url: 'https://example.com/b.git' });
  assert.deepEqual(await g.call({ op: 'remotes', repo: dir }), [{ name: 'upstream', url: 'https://example.com/b.git' }]);
  assert.equal((await st(dir)).remote, 'upstream');
  await g.call({ op: 'remote', repo: dir, action: 'remove', name: 'upstream' });
  assert.deepEqual(await g.call({ op: 'remotes', repo: dir }), []);
});

test('changes to one repository wait for each other', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  for (let i = 0; i < 10; i++) await write(dir, { [`f${i}.txt`]: `${i}\n` });
  // Ten stages at once would fight over index.lock; queued, they all work.
  await Promise.all(Array.from({ length: 10 }, (_, i) => g.call({ op: 'stage', repo: dir, paths: [`f${i}.txt`] })));
  assert.equal((await st(dir)).files.filter((f) => f.staged === 'A').length, 10);
});
