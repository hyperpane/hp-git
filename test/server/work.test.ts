// Staging, discarding (to the Trash), ignoring, committing, undoing a
// commit, authors and config.

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { Author, Status } from '../../src/shared/index.ts';
import { WIN, as, commitAll, folder, plugin, repo, sh, trashed, write } from './support.ts';

const g = await plugin();
const files = async (dir: string) => (await g.call<Status>({ op: 'status', repo: dir })).files;
const exists = (p: string) => stat(p).then(() => true, () => false);

// A name that's a pattern (the * isn't allowed on Windows).
const ODD = WIN ? '[x]+.txt' : '[x]*.txt';

test('stages and unstages files: new, changed, deleted, odd names, all', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'gone.txt': 'g\n', [ODD]: 'odd\n' });
  await write(dir, { 'a.txt': 'A\n', 'new.txt': 'n\n', [ODD]: 'odd!\n' });
  await import('node:fs/promises').then((fs) => fs.rm(path.join(dir, 'gone.txt')));
  await g.call({ op: 'stage', repo: dir, paths: ['a.txt', 'new.txt', 'gone.txt', ODD] });
  let f = await files(dir);
  assert.deepEqual(f.map((x) => [x.path, x.staged, x.worktree]), [
    [ODD, 'M', null],
    ['a.txt', 'M', null],
    ['gone.txt', 'D', null],
    ['new.txt', 'A', null],
  ]);
  await g.call({ op: 'unstage', repo: dir, paths: ['new.txt', ODD] });
  f = await files(dir);
  assert.equal(f.find((x) => x.path === 'new.txt')?.untracked, true);
  assert.equal(f.find((x) => x.path === ODD)?.worktree, 'M');
  await g.call({ op: 'unstage', repo: dir, all: true });
  assert.ok((await files(dir)).every((x) => x.staged === null));
  await g.call({ op: 'stage', repo: dir, all: true });
  assert.ok((await files(dir)).every((x) => x.staged !== null));
});

test('unstages before the first commit', async () => {
  const dir = await repo();
  await write(dir, { 'a.txt': 'a\n', 'b.txt': 'b\n' });
  await g.call({ op: 'stage', repo: dir, all: true });
  await g.call({ op: 'unstage', repo: dir, paths: ['a.txt'] });
  const f = await files(dir);
  assert.deepEqual(f.map((x) => [x.path, x.staged, x.untracked]), [['a.txt', null, true], ['b.txt', 'A', false]]);
  await g.call({ op: 'unstage', repo: dir, all: true });
  assert.ok((await files(dir)).every((x) => x.untracked));
});

test('discards changes to the Trash: changed (a copy), new (the file), staged, renamed', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'old.txt': 'o\no\no\n', 'dir/deep.txt': 'd\n' });
  await write(dir, { 'a.txt': 'changed\n', 'new/brand new.txt': 'n\n', 'dir/deep.txt': 'D\n' });
  sh(dir, 'add', 'dir/deep.txt');
  sh(dir, 'mv', 'old.txt', 'moved.txt');
  const before = (await trashed(g.trash)).length;
  await g.call({ op: 'discard', repo: dir, paths: ['a.txt', 'new/brand new.txt', 'dir/deep.txt', 'moved.txt'] });
  assert.deepEqual(await files(dir), []);
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'a\n');
  assert.equal(await readFile(path.join(dir, 'old.txt'), 'utf8'), 'o\no\no\n');
  assert.equal(await exists(path.join(dir, 'new')), false, 'the emptied folder went too');
  const t = await trashed(g.trash);
  assert.equal(t.length - before, 4);
  assert.ok(t.includes('brand new.txt'));
  // What went to the Trash is what was there.
  const copy = t.find((n) => n.startsWith('a.txt'))!;
  assert.equal(await readFile(path.join(g.trash, copy), 'utf8'), 'changed\n');
  // Its temporary folder in .git is gone.
  assert.equal(await exists(path.join(dir, '.git', 'hyperpane-discarded')), false);
});

test('discards in a repository with no commit yet', async () => {
  const dir = await repo();
  await write(dir, { 'a.txt': 'a\n', 'b.txt': 'b\n' });
  sh(dir, 'add', 'a.txt');
  await g.call({ op: 'discard', repo: dir, paths: ['a.txt', 'b.txt'] });
  assert.deepEqual(await files(dir), []);
});

test('ignores a pattern once, keeping the file’s line endings', async () => {
  const dir = await repo({ '.gitignore': 'dist/\r\n' });
  await write(dir, { 'debug.log': 'x\n' });
  await g.call({ op: 'ignore', repo: dir, pattern: '*.log' });
  await g.call({ op: 'ignore', repo: dir, pattern: '*.log' });
  assert.equal(await readFile(path.join(dir, '.gitignore'), 'utf8'), 'dist/\r\n*.log\r\n');
  assert.ok(!(await files(dir)).some((f) => f.path === 'debug.log'));
  await assert.rejects(g.call({ op: 'ignore', repo: dir, pattern: 'a\nb' }), { message: "That isn't a pattern." });
});

test('commits: summary and description, sign-off, co-authors, amend, all; and the bus hears', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  const p = await plugin({ projects: [{ id: 'p1', name: 'app', folder: dir }] });
  await write(dir, { 'a.txt': 'b\n' });
  sh(dir, 'add', 'a.txt');
  const committed = p.bus.next('git.committed');
  const { sha, summary } = await p.call({
    op: 'commit',
    repo: dir,
    summary: 'Change a',
    description: 'Because.\n#123 stays',
    signoff: true,
    coAuthors: [{ name: 'Grace Hopper', email: 'grace@example.com' }, 'Alan Turing <alan@example.com>'],
  });
  assert.equal(summary, 'Change a');
  assert.equal(sh(dir, 'rev-parse', 'HEAD').trim(), sha);
  const message = sh(dir, 'log', '-1', '--format=%B');
  assert.match(message, /^Change a\n\nBecause\.\n#123 stays\n/);
  assert.match(message, /Signed-off-by: Ada Lovelace <ada@example.com>/);
  assert.match(message, /Co-authored-by: Grace Hopper <grace@example.com>\nCo-authored-by: Alan Turing <alan@example.com>/);
  const event = await committed;
  assert.deepEqual(event.data, { repo: as(dir), sha, summary: 'Change a' });
  assert.equal(event.project, 'p1');
  // Amend with no summary keeps the message; with one, replaces it.
  await write(dir, { 'b.txt': 'b\n' });
  sh(dir, 'add', 'b.txt');
  const amended = await p.call({ op: 'commit', repo: dir, amend: true });
  assert.notEqual(amended.sha, sha);
  assert.equal(sh(dir, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(amended.summary, 'Change a');
  // `all` stages everything first.
  await write(dir, { 'c.txt': 'c\n' });
  await p.call({ op: 'commit', repo: dir, summary: 'All of it', all: true });
  assert.deepEqual(await files(dir), []);
  await assert.rejects(p.call({ op: 'commit', repo: dir, summary: '' }), { message: 'A commit needs a summary.' });
  await assert.rejects(p.call({ op: 'commit', repo: dir, summary: 'Nothing' }), { message: "There's nothing to commit." });
  await assert.rejects(p.call({ op: 'commit', repo: dir, summary: 'x', coAuthors: ['nobody'] }), { message: "“nobody” isn't a co-author: a name and an email are needed." });
});

test('undoes the last commit, its changes staged and its message back; the first one too', async () => {
  const dir = await repo({ 'a.txt': 'a\n' }, 'First\n\nThe body.');
  await write(dir, { 'b.txt': 'b\n' });
  commitAll(dir, 'Second');
  assert.deepEqual(await g.call({ op: 'undoCommit', repo: dir }), { summary: 'Second', description: '' });
  assert.deepEqual((await files(dir)).map((f) => [f.path, f.staged]), [['b.txt', 'A']]);
  sh(dir, 'commit', '-q', '-m', 'Second again');
  await g.call({ op: 'undoCommit', repo: dir });
  assert.deepEqual(await g.call({ op: 'undoCommit', repo: dir }), { summary: 'First', description: 'The body.' });
  assert.equal((await g.call<Status>({ op: 'status', repo: dir })).unborn, true);
  await assert.rejects(g.call({ op: 'undoCommit', repo: dir }), { message: 'There is no commit to undo.' });
});

test('authors from history, co-authors included', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  await write(dir, { 'b.txt': 'b\n' });
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'Pair\n\nCo-authored-by: Grace Hopper <grace@example.com>');
  const list = await g.call<Author[]>({ op: 'authors', repo: dir });
  assert.deepEqual(list, [
    { name: 'Ada Lovelace', email: 'ada@example.com', commits: 2 },
    { name: 'Grace Hopper', email: 'grace@example.com', commits: 1 },
  ]);
  assert.deepEqual(await g.call({ op: 'authors', repo: await repo() }), []);
});

test('config: reads and writes the identity, refuses other keys', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  assert.deepEqual(await g.call({ op: 'config', repo: dir, get: ['user.name', 'user.email'] }), { values: { 'user.name': 'Ada Lovelace', 'user.email': 'ada@example.com' } });
  await g.call({ op: 'config', repo: dir, set: { 'user.name': 'Someone Else' } });
  assert.equal(sh(dir, 'config', '--local', 'user.name').trim(), 'Someone Else');
  assert.equal((await g.call<Status>({ op: 'status', repo: dir })).identity.name, 'Someone Else');
  await g.call({ op: 'config', repo: dir, set: { 'user.name': null } });
  assert.equal((await g.call<Status>({ op: 'status', repo: dir })).identity.name, 'Ada Lovelace');
  await assert.rejects(g.call({ op: 'config', repo: dir, set: { 'core.hooksPath': '/tmp' } }), { message: /^Only user\.name, user\.email/ });
  await assert.rejects(g.call({ op: 'config', repo: dir, set: { 'user.name': 'a\nb' } }), { message: 'A value for user.name is one line.' });
  assert.ok(folder);
});
