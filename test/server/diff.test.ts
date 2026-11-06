// Diffs: every kind (working tree, staged, untracked, a commit, between
// revisions), renames, binary files and images, the size caps, and blob.

import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from '../../src/server/lib/parse-diff.ts';
import type { BlobContent, Diff } from '../../src/shared/index.ts';
import { commitAll, plugin, repo, sh, write } from './support.ts';

const g = await plugin();

test('the parser: hunks, line numbers, sections, no newline, modes', () => {
  const d = parse(
    'diff --git a/x b/x\nold mode 100644\nnew mode 100755\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@ fn main\n a\n-b\n+B\n c\n@@ -10 +10,2 @@\n-z\n\\ No newline at end of file\n+z\n+y\n\\ No newline at end of file\n',
  );
  assert.equal(d.oldMode, '100644');
  assert.equal(d.newMode, '100755');
  assert.equal(d.status, 'M');
  assert.equal(d.hunks.length, 2);
  assert.equal(d.hunks[0].section, 'fn main');
  assert.deepEqual(d.hunks[0].lines, [
    { kind: ' ', text: 'a', old: 1, new: 1 },
    { kind: '-', text: 'b', old: 2 },
    { kind: '+', text: 'B', new: 2 },
    { kind: ' ', text: 'c', old: 3, new: 3 },
  ]);
  assert.deepEqual([d.hunks[1].oldStart, d.hunks[1].oldLines, d.hunks[1].newStart, d.hunks[1].newLines], [10, 1, 10, 2]);
  assert.equal(d.hunks[1].lines[0].noNewline, true);
  assert.equal(d.hunks[1].lines[2].noNewline, true);
  assert.deepEqual([d.additions, d.deletions], [3, 2]);
  const capped = parse('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n', 2);
  assert.equal(capped.truncated, true);
  assert.equal(capped.hunks[0].lines.length, 2);
  assert.deepEqual([capped.additions, capped.deletions], [1, 1]);
});

test('working tree, staged, untracked and conflicted diffs', async () => {
  const dir = await repo({ 'a.txt': 'one\ntwo\nthree\n' });
  await write(dir, { 'a.txt': 'one\nTWO\nthree\n' });
  const unstaged = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  assert.equal(unstaged.status, 'M');
  assert.deepEqual(unstaged.hunks[0].lines.map((l) => l.kind + l.text), [' one', '-two', '+TWO', ' three']);
  assert.equal(unstaged.binary, false);
  sh(dir, 'add', 'a.txt');
  assert.equal((await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' })).hunks.length, 0);
  const staged = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', staged: true });
  assert.deepEqual([staged.additions, staged.deletions], [1, 1]);
  await write(dir, { 'n.txt': 'n1\nn2\n' });
  const untracked = await g.call<Diff>({ op: 'diff', repo: dir, path: 'n.txt', untracked: true });
  assert.equal(untracked.status, 'A');
  assert.equal(untracked.newMode, '100644');
  assert.deepEqual(untracked.hunks[0].lines.map((l) => [l.kind, l.new]), [['+', 1], ['+', 2]]);
  // Context and whitespace.
  await write(dir, { 'w.txt': 'a\nb\nc\nd\ne\nf\ng\n' });
  commitAll(dir, 'w');
  await write(dir, { 'w.txt': 'a\nb\nc\nD\ne\nf\ng  \n' });
  assert.equal((await g.call<Diff>({ op: 'diff', repo: dir, path: 'w.txt', context: 0 })).hunks.length, 2);
  const ws = await g.call<Diff>({ op: 'diff', repo: dir, path: 'w.txt', ignoreWhitespace: true, context: 1 });
  assert.equal(ws.hunks.length, 1);
  assert.equal(ws.additions, 1);
});

test('a staged diff before the first commit', async () => {
  const dir = await repo();
  await write(dir, { 'a.txt': 'x\n' });
  sh(dir, 'add', 'a.txt');
  const d = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', staged: true });
  assert.equal(d.status, 'A');
  assert.equal(d.hunks[0].lines[0].text, 'x');
});

test('a commit’s diff, a root commit’s, between revisions, and a revision against the tree', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  const root = sh(dir, 'rev-parse', 'HEAD').trim();
  await write(dir, { 'a.txt': 'a\nb\n' });
  const second = commitAll(dir, 'b');
  const inRoot = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', commit: root });
  assert.equal(inRoot.status, 'A');
  const inSecond = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', commit: second });
  assert.deepEqual(inSecond.hunks[0].lines.map((l) => l.kind + l.text), [' a', '+b']);
  const between = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', from: second, to: root });
  assert.deepEqual(between.hunks[0].lines.map((l) => l.kind + l.text), [' a', '-b']);
  await write(dir, { 'a.txt': 'a\nb\nc\n' });
  const toTree = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', from: root });
  assert.equal(toTree.additions, 2);
  await assert.rejects(g.call({ op: 'diff', repo: dir, path: 'a.txt', commit: '--output=/tmp/x' }), { message: "That isn't a commit." });
});

test('renames with similarity, binary files and images before and after', async () => {
  const dir = await repo({ 'old.txt': 'same\nsame\nsame\nsame\n', 'pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) });
  sh(dir, 'mv', 'old.txt', 'new.txt');
  const renamed = await g.call<Diff>({ op: 'diff', repo: dir, path: 'new.txt', oldPath: 'old.txt', staged: true });
  assert.equal(renamed.status, 'R');
  assert.equal(renamed.similarity, 100);
  assert.equal(renamed.oldPath, 'old.txt');
  await write(dir, { 'pic.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9, 9, 9]) });
  const img = await g.call<Diff>({ op: 'diff', repo: dir, path: 'pic.png' });
  assert.equal(img.binary, true);
  assert.equal(img.hunks.length, 0);
  assert.equal(img.image?.mime, 'image/png');
  assert.deepEqual(Buffer.from(img.image!.before!.data!, 'base64'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  assert.equal(img.image!.after!.size, 9);
  assert.equal(img.size, 9);
});

test('a huge diff comes back too large, with counts; full shows it anyway', async () => {
  const dir = await repo({ 'big.txt': 'x\n' });
  const big = Array.from({ length: 30_000 }, (_, i) => `line ${i} ${'y'.repeat(60)}`).join('\n') + '\n';
  await write(dir, { 'big.txt': big });
  const started = Date.now();
  const capped = await g.call<Diff>({ op: 'diff', repo: dir, path: 'big.txt' });
  assert.equal(capped.tooLarge, true);
  assert.equal(capped.hunks.length, 0);
  assert.equal(capped.additions, 30_000);
  assert.ok(capped.size >= big.length);
  const full = await g.call<Diff>({ op: 'diff', repo: dir, path: 'big.txt', full: true });
  assert.equal(full.tooLarge, undefined);
  assert.equal(full.hunks[0].lines.length, 30_001);
  assert.ok(Date.now() - started < 5000);
});

test('blob: the working tree, the index, a revision, lines and base64', async () => {
  const dir = await repo({ 'a.txt': 'one\ntwo\nthree\n' });
  await write(dir, { 'a.txt': 'ONE\ntwo\nthree\nfour\n' });
  const tree = await g.call<BlobContent>({ op: 'blob', repo: dir, path: 'a.txt', start: 2, count: 2 });
  assert.deepEqual(tree, { size: 19, binary: false, total: 4, lines: ['two', 'three'] });
  assert.deepEqual((await g.call<BlobContent>({ op: 'blob', repo: dir, path: 'a.txt', rev: ':0' })).lines, ['one', 'two', 'three']);
  assert.deepEqual((await g.call<BlobContent>({ op: 'blob', repo: dir, path: 'a.txt', rev: 'HEAD' })).total, 3);
  assert.equal(Buffer.from((await g.call<BlobContent>({ op: 'blob', repo: dir, path: 'a.txt', base64: true })).data!, 'base64').toString(), 'ONE\ntwo\nthree\nfour\n');
  await rm(path.join(dir, 'a.txt'));
  await assert.rejects(g.call({ op: 'blob', repo: dir, path: 'a.txt' }), { message: "a.txt isn't there." });
});
