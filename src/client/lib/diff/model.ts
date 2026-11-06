// A diff as rows to draw: hunk headers, the unchanged lines between hunks
// (folded, to expand), and lines, one after another (unified) or removed
// beside added (side by side). Removed and added lines of one change are
// paired, in order, for the words that changed inside them.

import type { Diff, Line } from '../../../shared/index.ts';
import { type Range, wordDiff } from './words.ts';

/** A line of the diff: its hunk and its place in it. */
export type LineKey = `${number}:${number}`;
export const keyOf = (h: number, i: number): LineKey => `${h}:${i}`;

/** Unchanged lines shown between hunks: `above` follow the hunk before the
 * gap, `below` lead into the hunk after it. */
export interface Expansion {
  above: string[];
  below: string[];
  /** Everything there is was fetched (the end of the file, for the last gap). */
  done?: boolean;
}

/** The folded lines above hunk `h` (or below the last one, h = hunks.length):
 * new-side line numbers [from, to), `to` null when the end isn't known, and
 * what to add to a new line number for the old one. */
export interface Gap {
  h: number;
  from: number;
  to: number | null;
  shift: number;
}

export type ContextRow = { t: 'ctx'; old: number; new: number; text: string };

export type UnifiedRow = { t: 'gap'; gap: Gap; hidden: number | null } | { t: 'hunk'; h: number } | { t: 'line'; h: number; i: number } | ContextRow;

export type SplitRow =
  | { t: 'gap'; gap: Gap; hidden: number | null }
  | { t: 'hunk'; h: number }
  | { t: 'pair'; h: number; left: number | null; right: number | null }
  | ContextRow;

export interface Model {
  diff: Diff;
  unified: UnifiedRow[];
  split: SplitRow[];
  /** Each changed line's partner on the other side, if it has one. */
  partner: Map<LineKey, LineKey>;
  /** The longest line, in characters (for the width). */
  longest: number;
  /** The biggest line number (for the gutter). */
  maxLine: number;
  /** The row each line is on, unified and split. */
  rowOf: { unified: Map<LineKey, number>; split: Map<LineKey, number> };
  words(h: number, i: number): Range[] | null;
}

/** The text of a line as shown: without a CRLF file's '\r'. */
export const shown = (line: Line | string) => {
  const t = typeof line === 'string' ? line : line.text;
  return t.endsWith('\r') ? t.slice(0, -1) : t;
};

/** The folded stretches of a diff. */
export function gaps(diff: Diff): Gap[] {
  const out: Gap[] = [];
  let prevEnd = 1;
  let shift = 0;
  diff.hunks.forEach((hunk, h) => {
    const from = h === 0 ? 1 : prevEnd;
    const start = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
    shift = hunk.oldStart - hunk.newStart + (hunk.oldLines === 0 ? 1 : 0) - (hunk.newLines === 0 ? 1 : 0);
    if (start > from) out.push({ h, from, to: start, shift });
    prevEnd = start + hunk.newLines;
    shift = hunk.oldStart + hunk.oldLines - prevEnd + (hunk.oldLines === 0 ? 1 : 0);
  });
  const last = diff.hunks[diff.hunks.length - 1];
  if (last && !diff.truncated && diff.status !== 'D' && diff.status !== 'A') out.push({ h: diff.hunks.length, from: prevEnd, to: null, shift });
  return out;
}

export function model(diff: Diff, expansions: Map<number, Expansion> = new Map()): Model {
  const unified: UnifiedRow[] = [];
  const split: SplitRow[] = [];
  const partner = new Map<LineKey, LineKey>();
  const rowOf = { unified: new Map<LineKey, number>(), split: new Map<LineKey, number>() };
  let longest = 0;
  let maxLine = 0;
  const byHunk = new Map(gaps(diff).map((g) => [g.h, g]));

  const context = (n: number, text: string, shift: number) => {
    const row: ContextRow = { t: 'ctx', old: n + shift, new: n, text };
    if (text.length > longest) longest = text.length;
    if (n > maxLine) maxLine = n;
    unified.push(row);
    split.push(row);
  };
  const gapRows = (gap: Gap) => {
    const e = expansions.get(gap.h);
    const above = e?.above ?? [];
    const below = e?.below ?? [];
    above.forEach((text, k) => context(gap.from + k, text, gap.shift));
    const hidden = gap.to === null ? null : gap.to - gap.from - above.length - below.length;
    if ((hidden === null && !e?.done) || (hidden !== null && hidden > 0)) {
      const row = { t: 'gap' as const, gap, hidden };
      unified.push(row);
      split.push(row);
    }
    if (gap.to !== null) below.forEach((text, k) => context(gap.to! - below.length + k, text, gap.shift));
  };

  diff.hunks.forEach((hunk, h) => {
    const gap = byHunk.get(h);
    if (gap) gapRows(gap);
    unified.push({ t: 'hunk', h });
    split.push({ t: 'hunk', h });
    let removed: number[] = [];
    let added: number[] = [];
    const flush = () => {
      const n = Math.max(removed.length, added.length);
      for (let k = 0; k < n; k++) {
        const left = removed[k] ?? null;
        const right = added[k] ?? null;
        if (left !== null && right !== null) {
          partner.set(keyOf(h, left), keyOf(h, right));
          partner.set(keyOf(h, right), keyOf(h, left));
        }
        if (left !== null) rowOf.split.set(keyOf(h, left), split.length);
        if (right !== null) rowOf.split.set(keyOf(h, right), split.length);
        split.push({ t: 'pair', h, left, right });
      }
      removed = [];
      added = [];
    };
    hunk.lines.forEach((line, i) => {
      if (line.text.length > longest) longest = line.text.length;
      const n = Math.max(line.old ?? 0, line.new ?? 0);
      if (n > maxLine) maxLine = n;
      rowOf.unified.set(keyOf(h, i), unified.length);
      unified.push({ t: 'line', h, i });
      if (line.kind === '-') {
        if (added.length) flush();
        removed.push(i);
      } else if (line.kind === '+') {
        added.push(i);
      } else {
        flush();
        rowOf.split.set(keyOf(h, i), split.length);
        split.push({ t: 'pair', h, left: i, right: i });
      }
    });
    flush();
  });
  const end = byHunk.get(diff.hunks.length);
  if (end) gapRows(end);

  const cache = new Map<LineKey, Range[] | null>();
  const words = (h: number, i: number): Range[] | null => {
    const key = keyOf(h, i);
    if (cache.has(key)) return cache.get(key)!;
    const other = partner.get(key);
    if (!other) {
      cache.set(key, null);
      return null;
    }
    const [oh, oi] = other.split(':').map(Number);
    const line = diff.hunks[h].lines[i];
    const peer = diff.hunks[oh].lines[oi];
    const removedFirst = line.kind === '-';
    const result = removedFirst ? wordDiff(shown(line), shown(peer)) : wordDiff(shown(peer), shown(line));
    cache.set(key, result ? (removedFirst ? result[0] : result[1]) : null);
    cache.set(other, result ? (removedFirst ? result[1] : result[0]) : null);
    return cache.get(key)!;
  };

  return { diff, unified, split, partner, longest, maxLine, rowOf, words };
}

/** The changed lines of a hunk. */
export function changedLines(diff: Diff, h: number): LineKey[] {
  const out: LineKey[] = [];
  diff.hunks[h]?.lines.forEach((l, i) => l.kind !== ' ' && out.push(keyOf(h, i)));
  return out;
}

/** Every changed line between two, in the diff's order (for a shift-click
 * or a drag). */
export function linesBetween(diff: Diff, a: LineKey, b: LineKey): LineKey[] {
  const order = (k: LineKey) => k.split(':').map(Number) as [number, number];
  let [h0, i0] = order(a);
  let [h1, i1] = order(b);
  if (h0 > h1 || (h0 === h1 && i0 > i1)) [h0, i0, h1, i1] = [h1, i1, h0, i0];
  const out: LineKey[] = [];
  for (let h = h0; h <= h1; h++) {
    const lines = diff.hunks[h]?.lines ?? [];
    for (let i = h === h0 ? i0 : 0; i <= (h === h1 ? i1 : lines.length - 1); i++) if (lines[i] && lines[i].kind !== ' ') out.push(keyOf(h, i));
  }
  return out;
}
