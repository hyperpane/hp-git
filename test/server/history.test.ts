// History: log pages and searches, refs, unpushed commits, one commit
// whole, changes between revisions, comparing branches, a file's history
// across a rename, and blame.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCoAuthors, parseRefs } from '../../src/server/lib/commits.ts';
import type { Blame, ChangedFile, Commit, CommitDetail, Compare, FileCommit, LogPage } from '../../src/shared/index.ts';
import { commitAll, plugin, repo, sh, write } from './support.ts';

const g = await plugin();

/** A repository with `n` commits, each adding a line to a.txt, the 5th
 * also renaming nothing, tagged and branched here and there. */
async function history(n: number) {
  const dir = await repo();
  for (let i = 1; i <= n; i++) {
    await write(dir, { 'a.txt': Array.from({ length: i }, (_, k) => `line ${k + 1}\n`).join(''), [`f${i % 3}.txt`]: `${i}\n` });
    commitAll(dir, i === 7 ? 'Fix the parser (seven)' : `Commit ${i}`);
  }
  return dir;
}

test('refs as git decorates them', () => {
  assert.deepEqual(parseRefs('HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main, refs/remotes/origin/HEAD, refs/stash'), [
    { name: 'main', kind: 'branch', current: true },
    { name: 'v1', kind: 'tag' },
    { name: 'origin/main', kind: 'remote' },
    { name: 'stash', kind: 'stash' },
  ]);
  assert.deepEqual(parseRefs('HEAD'), [{ name: 'HEAD', kind: 'head' }]);
  assert.deepEqual(parseRefs(''), []);
});

test('co-authors from trailers: each once, odd values left out', () => {
  assert.deepEqual(parseCoAuthors('Grace Hopper <grace@example.com>\nAlan Turing  <alan@example.com> \n\ngrace hopper <GRACE@example.com>\nnobody\n<x@example.com>\nEve <>\n'), [
    { name: 'Grace Hopper', email: 'grace@example.com' },
    { name: 'Alan Turing', email: 'alan@example.com' },
  ]);
  // authors' separator too.
  assert.deepEqual(parseCoAuthors('A <a@x>\x1dB <b@x>'), [
    { name: 'A', email: 'a@x' },
    { name: 'B', email: 'b@x' },
  ]);
  assert.deepEqual(parseCoAuthors(''), []);
});

test('log and show name a commit’s co-authors, the author left out; a commit without them has none', async () => {
  const dir = await history(2);
  await write(dir, { 'b.txt': 'pair\n' });
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'Pair on b\n\nWhy we paired.\n\nCo-authored-by: Grace Hopper <grace@example.com>\nco-authored-by: Alan Turing <alan@example.com>\nCo-authored-by: Ada Lovelace <ada@example.com>');
  const { commits } = await g.call<LogPage>({ op: 'log', repo: dir, skip: 0, limit: 5 });
  const people = [
    { name: 'Grace Hopper', email: 'grace@example.com' },
    { name: 'Alan Turing', email: 'alan@example.com' },
  ];
  assert.equal(commits[0].email, 'ada@example.com');
  assert.deepEqual(commits[0].coAuthors, people);
  assert.equal(commits[0].subject, 'Pair on b');
  assert.equal(commits[1].coAuthors, undefined);
  const c = await g.call<CommitDetail>({ op: 'show', repo: dir, sha: commits[0].sha });
  assert.deepEqual(c.coAuthors, people);
  assert.match(c.body, /^Why we paired\.\n\nCo-authored-by: Grace Hopper/);
  assert.deepEqual(c.files.map((f) => f.path), ['b.txt']);
  const files = await g.call<LogPage<FileCommit>>({ op: 'fileLog', repo: dir, path: 'b.txt', skip: 0, limit: 5 });
  assert.deepEqual(files.commits[0].coAuthors, people);
  assert.equal(files.commits[0].path, 'b.txt');
});

test('pages of history: limit, skip, more; parents and refs', async () => {
  const dir = await history(12);
  sh(dir, 'tag', 'v1', 'HEAD~2');
  const first = await g.call<LogPage>({ op: 'log', repo: dir, skip: 0, limit: 5 });
  assert.equal(first.commits.length, 5);
  assert.equal(first.more, true);
  assert.equal(first.commits[0].subject, 'Commit 12');
  assert.deepEqual(first.commits[0].refs, [{ name: 'main', kind: 'branch', current: true }]);
  assert.deepEqual(first.commits[2].refs, [{ name: 'v1', kind: 'tag' }]);
  assert.equal(first.commits[0].parents[0], first.commits[1].sha);
  assert.equal(first.commits[0].author, 'Ada Lovelace');
  assert.equal(first.commits[0].committerEmail, 'ada@example.com');
  assert.ok(first.commits[0].date > 1e12);
  const last = await g.call<LogPage>({ op: 'log', repo: dir, skip: 10, limit: 5 });
  assert.deepEqual(last.commits.map((c) => c.subject), ['Commit 2', 'Commit 1']);
  assert.equal(last.more, false);
  assert.equal(last.commits[1].parents.length, 0);
  // Exactly a page left: no more.
  assert.equal((await g.call<LogPage>({ op: 'log', repo: dir, skip: 7, limit: 5 })).more, false);
});

test('searches: message, author, path, pickaxe, a SHA, every branch', async () => {
  const dir = await history(9);
  const bySearch = await g.call<LogPage>({ op: 'log', repo: dir, search: 'PARSER', skip: 0, limit: 50 });
  assert.deepEqual(bySearch.commits.map((c) => c.subject), ['Fix the parser (seven)']);
  assert.equal((await g.call<LogPage>({ op: 'log', repo: dir, author: 'lovelace', skip: 0, limit: 50 })).commits.length, 9);
  assert.equal((await g.call<LogPage>({ op: 'log', repo: dir, author: 'nobody', skip: 0, limit: 50 })).commits.length, 0);
  const byPath = await g.call<LogPage>({ op: 'log', repo: dir, path: 'f0.txt', skip: 0, limit: 50 });
  assert.deepEqual(byPath.commits.map((c) => c.subject), ['Commit 9', 'Commit 6', 'Commit 3']);
  const pickaxe = await g.call<LogPage>({ op: 'log', repo: dir, pickaxe: { text: 'line 4' }, skip: 0, limit: 50 });
  assert.deepEqual(pickaxe.commits.map((c) => c.subject), ['Commit 4']);
  const regex = await g.call<LogPage>({ op: 'log', repo: dir, pickaxe: { text: '^line [56]$', regex: true }, skip: 0, limit: 50 });
  assert.deepEqual(regex.commits.map((c) => c.subject), ['Commit 6', 'Commit 5']);
  const sha = sh(dir, 'rev-parse', 'HEAD~3').trim();
  assert.deepEqual((await g.call<LogPage>({ op: 'log', repo: dir, sha: sha.slice(0, 8), skip: 0, limit: 50 })).commits.map((c) => c.sha), [sha]);
  assert.deepEqual((await g.call<LogPage>({ op: 'log', repo: dir, sha: 'zzzz', skip: 0, limit: 50 })).commits, []);
  sh(dir, 'switch', '-q', '-c', 'side', 'HEAD~4');
  await write(dir, { 'side.txt': 's\n' });
  commitAll(dir, 'On the side');
  sh(dir, 'switch', '-q', 'main');
  const all = await g.call<LogPage>({ op: 'log', repo: dir, all: true, skip: 0, limit: 50 });
  assert.equal(all.commits.length, 10);
  assert.ok(all.commits.some((c) => c.refs.some((r) => r.name === 'side')));
  assert.equal((await g.call<LogPage>({ op: 'log', repo: dir, ref: 'side', skip: 0, limit: 50 })).commits[0].subject, 'On the side');
  assert.deepEqual(await g.call<LogPage>({ op: 'log', repo: await repo(), skip: 0, limit: 10 }), { commits: [], more: false });
});

test('one commit whole: body, files with their lines; a merge against its first parent', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'old.txt': 'same\nsame\nsame\nsame\n' });
  await write(dir, { 'a.txt': 'a\nb\nc\n', 'bin.dat': Buffer.from([0, 1, 2]) });
  sh(dir, 'mv', 'old.txt', 'new.txt');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'Several things\n\nThe body,\nin two lines.');
  const c = await g.call<CommitDetail>({ op: 'show', repo: dir, sha: 'HEAD' });
  assert.equal(c.subject, 'Several things');
  assert.equal(c.body, 'The body,\nin two lines.');
  assert.deepEqual(
    c.files.map((f) => [f.path, f.from, f.status, f.additions, f.deletions, f.binary]),
    [
      ['a.txt', undefined, 'M', 2, 0, false],
      ['bin.dat', undefined, 'A', 0, 0, true],
      ['new.txt', 'old.txt', 'R', 0, 0, false],
    ],
  );
  const root = await g.call<CommitDetail>({ op: 'show', repo: dir, sha: 'HEAD~1' });
  assert.deepEqual(root.files.map((f) => f.path), ['a.txt', 'old.txt']);
  sh(dir, 'switch', '-q', '-c', 'side');
  await write(dir, { 'side.txt': 's\n' });
  commitAll(dir, 'side');
  sh(dir, 'switch', '-q', 'main');
  sh(dir, 'merge', '-q', '--no-ff', '--no-edit', 'side');
  const merge = await g.call<CommitDetail>({ op: 'show', repo: dir, sha: 'HEAD' });
  assert.equal(merge.parents.length, 2);
  assert.deepEqual(merge.files.map((f) => f.path), ['side.txt']);
  await assert.rejects(g.call({ op: 'show', repo: dir, sha: 'nope' }), { message: "There's no commit nope here." });
});

test('changes between revisions, and from one to the working tree', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'b.txt': 'b\n' });
  const base = sh(dir, 'rev-parse', 'HEAD').trim();
  await write(dir, { 'a.txt': 'a\nA\n', 'c.txt': 'c\n' });
  commitAll(dir, 'two');
  await write(dir, { 'b.txt': 'B\nB\n', 'untracked.txt': 'u\n' });
  const between = await g.call<{ files: ChangedFile[]; truncated: boolean }>({ op: 'changes', repo: dir, from: base, to: 'HEAD' });
  assert.deepEqual(between.files.map((f) => [f.path, f.status, f.additions]), [['a.txt', 'M', 1], ['c.txt', 'A', 1]]);
  const toTree = await g.call<{ files: ChangedFile[] }>({ op: 'changes', repo: dir, from: base });
  assert.deepEqual(toTree.files.map((f) => [f.path, f.status, f.additions, f.deletions]), [['a.txt', 'M', 1, 0], ['b.txt', 'M', 2, 1], ['c.txt', 'A', 1, 0]]);
  await assert.rejects(g.call({ op: 'changes', repo: dir, from: '--exec=x' }), { message: "That isn't a revision." });
});

test('compares two branches: commits on each side, the merge base', async () => {
  const dir = await history(3);
  const base = sh(dir, 'rev-parse', 'HEAD').trim();
  sh(dir, 'switch', '-q', '-c', 'feature');
  await write(dir, { 'x.txt': '1\n' });
  commitAll(dir, 'feature 1');
  await write(dir, { 'x.txt': '2\n' });
  commitAll(dir, 'feature 2');
  sh(dir, 'switch', '-q', 'main');
  await write(dir, { 'y.txt': '1\n' });
  commitAll(dir, 'main 1');
  const c = await g.call<Compare>({ op: 'compare', repo: dir, base: 'main', head: 'feature' });
  assert.deepEqual(c.ahead.map((x: Commit) => x.subject), ['feature 2', 'feature 1']);
  assert.deepEqual(c.behind.map((x: Commit) => x.subject), ['main 1']);
  assert.deepEqual([c.aheadCount, c.behindCount, c.mergeBase], [2, 1, base]);
});

test('a file’s history follows renames; blame names each line’s commit', async () => {
  const dir = await repo({ 'first.txt': 'one\ntwo\n' }, 'Add first');
  sh(dir, 'mv', 'first.txt', 'second.txt');
  commitAll(dir, 'Rename it');
  await write(dir, { 'second.txt': 'one\nTWO\nthree\n', 'other.txt': 'o\n' });
  commitAll(dir, 'Change it');
  const fl = await g.call<LogPage<FileCommit>>({ op: 'fileLog', repo: dir, path: 'second.txt', skip: 0, limit: 10 });
  assert.deepEqual(
    fl.commits.map((c) => [c.subject, c.status, c.path, c.from]),
    [
      ['Change it', 'M', 'second.txt', undefined],
      ['Rename it', 'R', 'second.txt', 'first.txt'],
      ['Add first', 'A', 'first.txt', undefined],
    ],
  );
  assert.equal(fl.more, false);
  const b = await g.call<Blame>({ op: 'blame', repo: dir, path: 'second.txt' });
  assert.deepEqual(b.lines.map((l) => l.text), ['one', 'TWO', 'three']);
  const [add, , change] = b.lines.map((l) => b.commits[l.sha].summary);
  assert.equal(add, 'Add first');
  assert.equal(change, 'Change it');
  assert.equal(b.commits[b.lines[1].sha].author, 'Ada Lovelace');
  assert.equal(b.commits[b.lines[1].sha].email, 'ada@example.com');
  assert.ok(b.commits[b.lines[1].sha].previous);
  // Uncommitted lines: the all-zero commit.
  await write(dir, { 'second.txt': 'one\nTWO\nthree\nfour\n' });
  const live = await g.call<Blame>({ op: 'blame', repo: dir, path: 'second.txt' });
  assert.match(live.lines[3].sha, /^0+$/);
  const old = await g.call<Blame>({ op: 'blame', repo: dir, path: 'second.txt', rev: 'HEAD~1' });
  assert.deepEqual(old.lines.map((l) => l.text), ['one', 'two']);
});

test('marks commits not pushed yet', async () => {
  const remote = await repo();
  sh(remote, 'config', 'receive.denyCurrentBranch', 'ignore');
  const dir = await history(3);
  sh(dir, 'remote', 'add', 'origin', remote);
  sh(dir, 'push', '-q', '-u', 'origin', 'main');
  await write(dir, { 'n.txt': 'n\n' });
  commitAll(dir, 'Not pushed');
  const page = await g.call<LogPage>({ op: 'log', repo: dir, skip: 0, limit: 10 });
  assert.deepEqual(page.commits.map((c) => !!c.unpushed), [true, false, false, false]);
});

test('once: any call as a subscription, its reply one event, then the end', async () => {
  const dir = await history(3);
  const run = g.stream<LogPage>(g.plugin, { op: 'once', repo: dir, call: { op: 'log', skip: 0, limit: 2 } });
  const page = await run.next();
  assert.equal(page.commits.length, 2);
  assert.equal(await run.end, null);
  // An op that isn't there, or once itself: the end says so.
  const none = g.stream(g.plugin, { op: 'once', repo: dir, call: { op: 'nothing' } });
  assert.match(String(await none.end), /no “nothing” to run/);
  const nested = g.stream(g.plugin, { op: 'once', repo: dir, call: { op: 'once' } });
  assert.match(String(await nested.end), /no “once” to run/);
});
