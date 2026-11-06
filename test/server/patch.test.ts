// The patch builder (src/shared/patch.ts): staging, unstaging and
// discarding lines and hunks, checked against git itself on temporary
// repositories: what's in the index and the working tree after.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { allLines, discardPatch, hunkLines, lineKey, quote, stagePatch, unstagePatch } from '../../src/shared/patch.ts';
import type { Diff } from '../../src/shared/index.ts';
import { WIN, plugin, repo, sh, trashed, write } from './support.ts';

const g = await plugin();

const lines = (n: number, f = (i: number) => `line ${i}`) => Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join('');
const index = (dir: string, file: string) => sh(dir, 'show', `:${file}`);
const keys = (diff: Diff, pred: (text: string, kind: string) => boolean) => {
  const out = new Set<string>();
  diff.hunks.forEach((h, hi) => h.lines.forEach((l, li) => l.kind !== ' ' && pred(l.text, l.kind) && out.add(lineKey(hi, li))));
  return out;
};

test('stages some lines of a change, leaving the rest unstaged', async () => {
  const dir = await repo({ 'a.txt': lines(30) });
  // Two hunks: one changed near the top, one near the bottom.
  await write(dir, { 'a.txt': lines(30, (i) => (i === 3 ? 'three!' : i === 25 ? 'twenty-five!' : `line ${i}`)).replace('line 5\n', 'line 5\nnew after 5\n') });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  assert.equal(diff.hunks.length, 2);
  // Only the second hunk's change, and only its + side.
  const pick = keys(diff, (t, k) => t === 'twenty-five!' && k === '+');
  const patch = stagePatch(diff, pick)!;
  await g.call({ op: 'apply', repo: dir, patch, cached: true });
  const staged = index(dir, 'a.txt');
  // The added line is in, the removed one stays (it wasn't picked).
  assert.match(staged, /line 25\ntwenty-five!\nline 26/);
  assert.match(staged, /line 3\nline 4/);
  assert.doesNotMatch(staged, /three!|new after 5/);
  // The working tree is untouched.
  assert.match(await readFile(path.join(dir, 'a.txt'), 'utf8'), /three!/);
});

test('stages a whole hunk after an earlier hunk left out, at the right lines', async () => {
  const dir = await repo({ 'a.txt': lines(40) });
  await write(dir, { 'a.txt': lines(40).replace('line 2\n', 'line 2\nadded 1\nadded 2\nadded 3\n').replace('line 30\n', 'thirty\n') });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  assert.equal(diff.hunks.length, 2);
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(diff, new Set(hunkLines(diff, 1))), cached: true });
  assert.equal(index(dir, 'a.txt'), lines(40).replace('line 30\n', 'thirty\n'));
  // Then the first, from the diff as it is now.
  const again = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(again, new Set(allLines(again))), cached: true });
  assert.equal(index(dir, 'a.txt'), await readFile(path.join(dir, 'a.txt'), 'utf8'));
});

test('unstages some lines of a staged change', async () => {
  const dir = await repo({ 'a.txt': lines(10) });
  await write(dir, { 'a.txt': lines(10).replace('line 4\n', 'four\n').replace('line 6\n', 'line 6\nsix and a half\n') });
  sh(dir, 'add', 'a.txt');
  const staged = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', staged: true });
  const patch = unstagePatch(staged, keys(staged, (t) => t === 'six and a half'))!;
  await g.call({ op: 'apply', repo: dir, patch, cached: true, reverse: true });
  assert.equal(index(dir, 'a.txt'), lines(10).replace('line 4\n', 'four\n'));
  // Unstaging the replacement's two lines takes it back too.
  const left = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt', staged: true });
  await g.call({ op: 'apply', repo: dir, patch: unstagePatch(left, new Set(allLines(left))), cached: true, reverse: true });
  assert.equal(index(dir, 'a.txt'), lines(10));
});

test('discards some lines from the working tree, a copy going to the Trash first', async () => {
  const dir = await repo({ 'a.txt': lines(10) });
  await write(dir, { 'a.txt': lines(10).replace('line 2\n', 'two\n').replace('line 9\n', 'nine\n') });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  const before = (await trashed(g.trash)).length;
  const patch = discardPatch(diff, keys(diff, (t) => t === 'nine' || t === 'line 9'))!;
  await g.call({ op: 'apply', repo: dir, patch, reverse: true });
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), lines(10).replace('line 2\n', 'two\n'));
  const now = await trashed(g.trash);
  assert.equal(now.length, before + 1);
  assert.ok(now.some((n) => n.startsWith('a.txt')));
});

test('stages part of a new file, and unstages part of it again', async () => {
  const dir = await repo({ 'keep.txt': 'x\n' });
  await write(dir, { 'new.txt': 'one\ntwo\nthree\n' });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'new.txt', untracked: true });
  assert.equal(diff.status, 'A');
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(diff, keys(diff, (t) => t !== 'two')), cached: true });
  assert.equal(index(dir, 'new.txt'), 'one\nthree\n');
  const staged = await g.call<Diff>({ op: 'diff', repo: dir, path: 'new.txt', staged: true });
  await g.call({ op: 'apply', repo: dir, patch: unstagePatch(staged, keys(staged, (t) => t === 'one')), cached: true, reverse: true });
  assert.equal(index(dir, 'new.txt'), 'three\n');
  // All of it unstaged: the file leaves the index.
  const rest = await g.call<Diff>({ op: 'diff', repo: dir, path: 'new.txt', staged: true });
  await g.call({ op: 'apply', repo: dir, patch: unstagePatch(rest, new Set(allLines(rest))), cached: true, reverse: true });
  assert.equal(sh(dir, 'ls-files', 'new.txt'), '');
});

test('stages part of a deletion as a change, all of it as the deletion', async () => {
  const dir = await repo({ 'gone.txt': 'a\nb\nc\n' });
  sh(dir, 'rm', '-q', '--cached', 'gone.txt');
  sh(dir, 'reset', '-q');
  await import('node:fs/promises').then((fs) => fs.rm(path.join(dir, 'gone.txt')));
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'gone.txt' });
  assert.equal(diff.status, 'D');
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(diff, keys(diff, (t) => t === 'b')), cached: true });
  assert.equal(index(dir, 'gone.txt'), 'a\nc\n');
  const rest = await g.call<Diff>({ op: 'diff', repo: dir, path: 'gone.txt' });
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(rest, new Set(allLines(rest))), cached: true });
  assert.equal(sh(dir, 'ls-files', 'gone.txt'), '');
});

test('keeps “no newline at end of file” right on both sides', async () => {
  const dir = await repo({ 'n.txt': 'a\nb' });
  await write(dir, { 'n.txt': 'a\nb\nc' });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'n.txt' });
  // -b (no newline), +b, +c (no newline): only c picked.
  assert.ok(diff.hunks[0].lines.some((l) => l.noNewline));
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(diff, keys(diff, (t, k) => t === 'c' && k === '+')), cached: true });
  assert.equal(index(dir, 'n.txt'), 'a\nb\nc');
  // In reverse: discard only the deleted b's return: the file keeps c.
  sh(dir, 'reset', '-q');
  const again = await g.call<Diff>({ op: 'diff', repo: dir, path: 'n.txt' });
  await g.call({ op: 'apply', repo: dir, patch: discardPatch(again, keys(again, (t, k) => t === 'c' && k === '+')), reverse: true });
  assert.equal(await readFile(path.join(dir, 'n.txt'), 'utf8'), 'a\nb\n');
});

test('picking the old last line alone puts it back with a newline', async () => {
  const dir = await repo({ 'n.txt': 'a\nb' });
  await write(dir, { 'n.txt': 'a\nB\nc\n' });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'n.txt' });
  const patch = discardPatch(diff, keys(diff, (t, k) => t === 'b' && k === '-'))!;
  await g.call({ op: 'apply', repo: dir, patch, reverse: true });
  assert.equal(await readFile(path.join(dir, 'n.txt'), 'utf8'), 'a\nb\nB\nc\n');
});

test('CRLF lines, odd names and zero context apply as they are', async () => {
  // Quotes and tabs can't be in names on Windows.
  const name = WIN ? 'a [quoted] name.txt' : 'a "quoted" name\twith tab.txt';
  const dir = await repo({ [name]: 'one\r\ntwo\r\nthree\r\n', 'with space.txt': 'x\ny\n' });
  await write(dir, { [name]: 'one\r\nTWO\r\nthree\r\nfour\r\n', 'with space.txt': 'x\nY\n' });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: name, context: 0 });
  assert.ok(diff.hunks.every((h) => h.lines.every((l) => l.kind !== ' ')));
  assert.equal(diff.hunks[0].lines[0].text, 'two\r');
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(diff, keys(diff, (t) => t === 'four\r')), cached: true });
  assert.equal(index(dir, name), 'one\r\ntwo\r\nthree\r\nfour\r\n');
  const spaced = await g.call<Diff>({ op: 'diff', repo: dir, path: 'with space.txt' });
  await g.call({ op: 'apply', repo: dir, patch: stagePatch(spaced, new Set(allLines(spaced))), cached: true });
  assert.equal(index(dir, 'with space.txt'), 'x\nY\n');
  assert.equal(quote('a/x"y'), '"a/x\\"y"');
  assert.equal(quote('a/plain é.txt'), 'a/plain é.txt');
});

test('nothing picked, or only context: no patch', async () => {
  const diff: Diff = {
    path: 'a',
    status: 'M',
    binary: false,
    truncated: false,
    size: 0,
    additions: 1,
    deletions: 0,
    hunks: [{ header: '@@ -1,1 +1,2 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [{ kind: ' ', text: 'a', old: 1, new: 1 }, { kind: '+', text: 'b', new: 2 }] }],
  };
  assert.equal(stagePatch(diff, new Set()), null);
  assert.equal(stagePatch(diff, new Set(['0:0'])), null);
  assert.equal(stagePatch({ ...diff, binary: true }, new Set(['0:1'])), null);
  assert.equal(
    stagePatch(diff, (h, l) => h === 0 && l === 1),
    'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,1 +1,2 @@\n a\n+b\n',
  );
});

test('a patch that no longer applies is refused plainly, and nothing goes to the Trash', async () => {
  const dir = await repo({ 'a.txt': lines(5) });
  await write(dir, { 'a.txt': lines(5).replace('line 3', 'three') });
  const diff = await g.call<Diff>({ op: 'diff', repo: dir, path: 'a.txt' });
  await write(dir, { 'a.txt': 'something else entirely\n' });
  const before = (await trashed(g.trash)).length;
  await assert.rejects(g.call({ op: 'apply', repo: dir, patch: discardPatch(diff, new Set(allLines(diff))), reverse: true }), {
    message: 'The file changed since its diff was shown. Look again, then try once more.',
  });
  assert.equal((await trashed(g.trash)).length, before);
  await assert.rejects(g.call({ op: 'apply', repo: dir, patch: 'rm -rf /', cached: true }), { message: "That isn't a patch." });
});
