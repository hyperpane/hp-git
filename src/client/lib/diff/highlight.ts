// Syntax colors for a diff, as the Editor colors code (@hyperpane/code's
// classes from the theme). Each side of the diff is parsed as one text, the
// old side from unchanged and removed lines, the new side from unchanged
// and added ones, a few milliseconds at a time so the frame never stalls;
// then each line gets its spans.

import { languageFor } from '@hyperpane/code';
import { codeHighlighter } from '@hyperpane/code';
import { highlightTree } from '@lezer/highlight';
import type { Diff } from '../../../shared/index.ts';
import { type LineKey, keyOf, shown } from './model.ts';

/** A colored stretch of a line: [from, to, class]. */
export type Span = [number, number, string];

/** The most text a side may have to be colored. */
const MAX_SIDE = 400_000;
/** How long a slice of work takes before giving the frame a turn. */
const SLICE = 8;

const turn = () => new Promise<void>((r) => setTimeout(r, 0));

/** Spans by line, for both sides (a context line's are its new side's).
 * Context rows shown between hunks are colored by `extra`, by new line
 * number. Resolves with null when the language isn't known or it's too
 * big; stops when `signal` aborts. */
export async function highlightDiff(diff: Diff, signal: AbortSignal): Promise<Map<LineKey, Span[]> | null> {
  const lang = languageFor(diff.path.slice(diff.path.lastIndexOf('/') + 1));
  if (!lang || diff.binary || !diff.hunks.length) return null;
  let support;
  try {
    support = await lang.load();
  } catch {
    return null;
  }
  if (signal.aborted) return null;
  const out = new Map<LineKey, Span[]>();
  for (const side of ['old', 'new'] as const) {
    const keys: LineKey[] = [];
    const texts: string[] = [];
    /** Whether a line's spans are this side's: an unchanged line's are the new side's. */
    const emit: boolean[] = [];
    let size = 0;
    diff.hunks.forEach((hunk, h) =>
      hunk.lines.forEach((line, i) => {
        if (line.kind === (side === 'old' ? '+' : '-')) return;
        keys.push(keyOf(h, i));
        emit.push(side === 'new' || line.kind === '-');
        const t = shown(line);
        texts.push(t);
        size += t.length + 1;
      }),
    );
    if (!texts.length || size > MAX_SIDE) continue;
    const doc = texts.join('\n');
    const parse = support.language.parser.startParse(doc);
    let tree = null;
    let started = performance.now();
    while (!(tree = parse.advance())) {
      if (performance.now() - started > SLICE) {
        await turn();
        if (signal.aborted) return null;
        started = performance.now();
      }
    }
    // Line starts, to place each span.
    const starts: number[] = [];
    let at = 0;
    for (const t of texts) {
      starts.push(at);
      at += t.length + 1;
    }
    let line = 0;
    const CHUNK = 20_000;
    for (let from = 0; from < doc.length; from += CHUNK) {
      highlightTree(
        tree,
        codeHighlighter,
        (a, b, cls) => {
          // Spans may cross lines (a block comment): cut them at each end of line.
          while (line + 1 < starts.length && starts[line + 1] <= a) line++;
          let l = line;
          let s = a;
          while (s < b && l < starts.length) {
            const lineEnd = starts[l] + texts[l].length;
            const e = Math.min(b, lineEnd);
            if (e > s && emit[l]) {
              const key = keys[l];
              let spans = out.get(key);
              if (!spans) out.set(key, (spans = []));
              spans.push([s - starts[l], e - starts[l], cls]);
            }
            l++;
            s = l < starts.length ? starts[l] : b;
          }
        },
        from,
        Math.min(doc.length, from + CHUNK),
      );
      if (performance.now() - started > SLICE) {
        await turn();
        if (signal.aborted) return null;
        started = performance.now();
      }
    }
  }
  return out;
}

/** Spans for plain lines of a file (context rows, blame), by index. */
export async function highlightLines(name: string, lines: string[], signal: AbortSignal): Promise<Span[][] | null> {
  const lang = languageFor(name);
  if (!lang || !lines.length) return null;
  let support;
  try {
    support = await lang.load();
  } catch {
    return null;
  }
  const doc = lines.join('\n');
  if (doc.length > MAX_SIDE * 2 || signal.aborted) return null;
  const parse = support.language.parser.startParse(doc);
  let tree = null;
  let started = performance.now();
  while (!(tree = parse.advance())) {
    if (performance.now() - started > SLICE) {
      await turn();
      if (signal.aborted) return null;
      started = performance.now();
    }
  }
  const starts: number[] = [];
  let at = 0;
  for (const t of lines) {
    starts.push(at);
    at += t.length + 1;
  }
  const out: Span[][] = lines.map(() => []);
  let line = 0;
  highlightTree(tree, codeHighlighter, (a, b, cls) => {
    while (line + 1 < starts.length && starts[line + 1] <= a) line++;
    let l = line;
    let s = a;
    while (s < b && l < starts.length) {
      const e = Math.min(b, starts[l] + lines[l].length);
      if (e > s) out[l].push([s - starts[l], e - starts[l], cls]);
      l++;
      s = l < starts.length ? starts[l] : b;
    }
  });
  return out;
}
