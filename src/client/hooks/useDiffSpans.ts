// A diff's syntax colors: worked out after the plain text is up, a few
// milliseconds at a time, and for the unchanged lines opened between its
// hunks.

import { useEffect, useState } from 'react';
import type { Diff } from '../../shared/index.ts';
import { type Span, highlightDiff, highlightLines } from '../lib/diff/highlight.ts';
import type { Expansion, LineKey, Model } from '../lib/diff/model.ts';

export function useDiffSpans(diff: Diff, m: Model, expansions?: Map<number, Expansion>) {
  const [spans, setSpans] = useState<Map<LineKey, Span[]> | null>(null);
  const [ctxSpans, setCtxSpans] = useState<Map<number, Span[]>>(new Map());

  // Colors: after the plain text is up, a few milliseconds at a time.
  useEffect(() => {
    setSpans(null);
    const ac = new AbortController();
    highlightDiff(diff, ac.signal).then((s) => !ac.signal.aborted && setSpans(s), () => {});
    return () => ac.abort();
  }, [diff]);
  // And the unchanged lines opened between hunks.
  useEffect(() => {
    if (!expansions?.size) return;
    const rows = m.unified.filter((r) => r.t === 'ctx');
    if (!rows.length) return;
    const ac = new AbortController();
    highlightLines(diff.path.slice(diff.path.lastIndexOf('/') + 1), rows.map((r) => r.text), ac.signal).then(
      (s) => {
        if (!s || ac.signal.aborted) return;
        setCtxSpans(new Map(rows.map((r, k) => [r.new, s[k]])));
      },
      () => {},
    );
    return () => ac.abort();
  }, [m, expansions, diff.path]);
  return { spans, ctxSpans };
}
