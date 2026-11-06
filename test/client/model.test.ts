// The window's logic without a DOM: what changed inside a line, a diff as
// rows (unified and side by side, folded stretches between hunks), the
// branch graph as it pages in, and conflicts parsed and merged.

import './support/hooks.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Diff } from '../../src/shared/index.ts';

const { wordDiff, lcs } = await import('../../src/client/lib/diff/words.ts');
const { gaps, keyOf, linesBetween, model } = await import('../../src/client/lib/diff/model.ts');
const { Graph, segmentPath } = await import('../../src/client/lib/graph.ts');
const { merged, parseConflicts } = await import('../../src/client/lib/conflicts.ts');
const { branchName, branchProblem } = await import('../../src/client/lib/branchNames.ts');
const { ignoreExact, relativeTo } = await import('../../src/client/lib/paths.ts');
const { initials } = await import('../../src/client/lib/people.ts');

function diff(hunks: Diff['hunks'], o: Partial<Diff> = {}): Diff {
  return { path: 'src/a.ts', status: 'M', binary: false, truncated: false, size: 100, additions: 0, deletions: 0, hunks, ...o };
}

test('the words that changed inside a line, and none for lines that share too little', () => {
  const [a, b] = wordDiff('const total = price * count;', 'const total = price * amount;')!;
  assert.deepEqual(a, [[22, 27]]);
  assert.deepEqual(b, [[22, 28]]);
  assert.equal('const total = price * count;'.slice(...a[0]), 'count');
  assert.equal(wordDiff('alpha beta gamma', 'one two three'), null);
  assert.deepEqual(wordDiff('same', 'same'), [[], []]);
  // Long lines: the common start and end only.
  const long = 'x'.repeat(3000);
  const [la, lb] = wordDiff(`${long}a${long}`, `${long}b${long}`)!;
  assert.deepEqual(la, [[3000, 3001]]);
  assert.deepEqual(lb, [[3000, 3001]]);
  assert.deepEqual(lcs([1, 2, 3, 4], [1, 3, 4, 5]), [
    [0, 0],
    [2, 1],
    [3, 2],
  ]);
});

const sample = diff([
  {
    header: '@@ -10,4 +10,5 @@ fn main',
    oldStart: 10,
    oldLines: 4,
    newStart: 10,
    newLines: 5,
    section: 'fn main',
    lines: [
      { kind: ' ', old: 10, new: 10, text: 'a' },
      { kind: '-', old: 11, text: 'let x = 1;' },
      { kind: '+', new: 11, text: 'let x = 2;' },
      { kind: '+', new: 12, text: 'let y = 3;' },
      { kind: ' ', old: 12, new: 13, text: 'b' },
      { kind: ' ', old: 13, new: 14, text: 'c\r' },
    ],
  },
  {
    header: '@@ -30,2 +31,1 @@',
    oldStart: 30,
    oldLines: 2,
    newStart: 31,
    newLines: 1,
    lines: [
      { kind: '-', old: 30, text: 'gone' },
      { kind: ' ', old: 31, new: 31, text: 'kept', noNewline: true },
    ],
  },
]);

test('a diff as rows: gaps, hunks and lines; removed paired with added side by side', () => {
  const m = model(sample);
  assert.deepEqual(
    m.unified.map((r) => (r.t === 'line' ? `${r.h}:${r.i}` : r.t)),
    ['gap', 'hunk', '0:0', '0:1', '0:2', '0:3', '0:4', '0:5', 'gap', 'hunk', '1:0', '1:1', 'gap'],
  );
  const pairs = m.split.filter((r) => r.t === 'pair').map((r) => (r.t === 'pair' ? [r.left, r.right] : null));
  assert.deepEqual(pairs.slice(0, 4), [
    [0, 0],
    [1, 2],
    [null, 3],
    [4, 4],
  ]);
  assert.equal(m.partner.get(keyOf(0, 1)), keyOf(0, 2));
  assert.deepEqual(m.words(0, 1), [[8, 9]]);
  assert.deepEqual(m.words(0, 2), [[8, 9]]);
  assert.equal(m.words(0, 3), null);
  assert.equal(m.maxLine, 31);
  // The folded stretches: lines 1–9 above, 15–30 between, the rest below.
  assert.deepEqual(gaps(sample), [
    { h: 0, from: 1, to: 10, shift: 0 },
    { h: 1, from: 15, to: 31, shift: -1 },
    { h: 2, from: 32, to: null, shift: 0 },
  ]);
  const g = m.unified.find((r) => r.t === 'gap' && r.gap.h === 1);
  assert.ok(g && g.t === 'gap' && g.hidden === 16);
});

test('opened stretches between hunks show as unchanged lines, numbered on both sides', () => {
  const m = model(sample, new Map([[1, { above: ['l15', 'l16'], below: ['l30'] }]]));
  const ctx = m.unified.filter((r) => r.t === 'ctx');
  assert.deepEqual(
    ctx.map((r) => (r.t === 'ctx' ? [r.new, r.old, r.text] : null)),
    [
      [15, 14, 'l15'],
      [16, 15, 'l16'],
      [30, 29, 'l30'],
    ],
  );
  const g = m.unified.find((r) => r.t === 'gap' && r.gap.h === 1);
  assert.ok(g && g.t === 'gap' && g.hidden === 13);
  // All of it: no gap row is left.
  const all = model(sample, new Map([[1, { above: Array.from({ length: 16 }, (_, k) => `l${15 + k}`), below: [] }]]));
  assert.ok(!all.unified.some((r) => r.t === 'gap' && r.gap.h === 1));
});

test('a range of picked lines skips unchanged ones and crosses hunks', () => {
  assert.deepEqual(linesBetween(sample, keyOf(0, 3), keyOf(1, 0)), ['0:3', '1:0']);
  assert.deepEqual(linesBetween(sample, keyOf(1, 0), keyOf(0, 1)), ['0:1', '0:2', '0:3', '1:0']);
});

test('the graph: lanes for branches, a merge joining them, paged in without redrawing', () => {
  // m3 merges f1 into m2; f1 and m2 both come from m1.
  const commits = [
    { sha: 'm3', parents: ['m2', 'f1'] },
    { sha: 'f1', parents: ['m1'] },
    { sha: 'm2', parents: ['m1'] },
    { sha: 'm1', parents: [] },
  ];
  const whole = new Graph();
  whole.add(commits);
  const paged = new Graph();
  paged.add(commits.slice(0, 2));
  paged.add(commits.slice(2));
  assert.deepEqual(paged.rows, whole.rows);
  const lanes = whole.rows.map((r) => r.lane);
  assert.deepEqual(lanes, [0, 1, 0, 0]);
  assert.equal(whole.rows[0].merge, true);
  assert.equal(whole.width, 2);
  // m1 is where both lanes meet.
  assert.ok(whole.rows[3].segments.some((s) => s.x0 === 1 && s.x1 === 0 && s.y1 === 0.5));
  assert.equal(segmentPath({ x0: 0, y0: 0, x1: 0, y1: 1, color: 0 }, 26), 'M6 0V26');
  assert.match(segmentPath({ x0: 0, y0: 0.5, x1: 1, y1: 1, color: 0 }, 26), /^M6 13C/);
});

test('conflicts parsed from their markers (with a base), and merged as chosen', () => {
  const lines = ['top', '<<<<<<< HEAD', 'ours 1', 'ours 2', '||||||| base', 'base', '=======', 'theirs', '>>>>>>> feature', 'middle', '<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> feature', 'end'];
  const blocks = parseConflicts(lines);
  assert.deepEqual(
    blocks.map((b) => b.t),
    ['text', 'conflict', 'text', 'conflict', 'text'],
  );
  const c = blocks[1];
  assert.ok(c.t === 'conflict');
  assert.deepEqual(c.ours, ['ours 1', 'ours 2']);
  assert.deepEqual(c.base, ['base']);
  assert.deepEqual(c.theirs, ['theirs']);
  assert.equal(c.theirsLabel, 'feature');
  assert.equal(merged(blocks, new Map([[1, 'theirs'], [3, 'both']]), '\n'), 'top\ntheirs\nmiddle\na\nb\nend');
  assert.equal(merged(blocks, new Map([[3, 'bothTheirsFirst']]), '\n').split('\n').slice(-3).join('|'), 'b|a|end');
  // An unchosen conflict keeps its markers.
  assert.match(merged(blocks, new Map(), '\n'), /<<<<<<< HEAD\nours 1/);
  // A line that only looks like a marker isn't a conflict.
  assert.deepEqual(parseConflicts(['<<<<<<< not closed', 'x']).map((b) => b.t), ['text']);
});

test('names and paths', () => {
  assert.equal(branchName('my new  feature'), 'my-new-feature');
  assert.equal(branchName('a..b~c^d:e'), 'a.b-c-d-e');
  assert.equal(branchProblem('main', ['main']), 'A branch named main already exists.');
  assert.equal(branchProblem('x.lock'), 'That isn’t a valid branch name.');
  assert.equal(branchProblem('ok/name'), null);
  assert.equal(ignoreExact('build/out[1].log'), '/build/out\\[1\\].log');
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials('ada'), 'AD');
  assert.equal(relativeTo('/r/app', '/r/app/src/a.ts'), 'src/a.ts');
  assert.equal(relativeTo('/r/app', '/r/apps/a.ts'), null);
});
