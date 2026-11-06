// A line of code as spans: its syntax colors, and over them the words that
// changed (a stronger tint). Long lines are cut where nobody reads them.

import type { ReactNode } from 'react';
import type { Span } from './highlight.ts';
import type { Range } from './words.ts';

/** Past this, a line is cut (with …): wider than anything on screen. */
export const MAX_SHOWN = 4000;

export function paint(text: string, spans: Span[] | undefined, words: Range[] | null | undefined, wordClass: string): ReactNode {
  const cut = text.length > MAX_SHOWN;
  const t = cut ? text.slice(0, MAX_SHOWN) : text;
  if (!spans?.length && !words?.length) return cut ? `${t}…` : t || ' ';
  // Every place a style starts or stops.
  const stops = new Set<number>([0, t.length]);
  for (const [a, b] of spans ?? []) {
    if (a < t.length) stops.add(a);
    if (b < t.length) stops.add(b);
  }
  for (const [a, b] of words ?? []) {
    if (a < t.length) stops.add(a);
    if (b < t.length) stops.add(b);
  }
  const at = [...stops].sort((x, y) => x - y);
  const out: ReactNode[] = [];
  let si = 0;
  let wi = 0;
  for (let k = 0; k < at.length - 1; k++) {
    const a = at[k];
    const b = at[k + 1];
    if (b <= a) continue;
    while (spans && si < spans.length && spans[si][1] <= a) si++;
    while (words && wi < words.length && words[wi][1] <= a) wi++;
    const span = spans && si < spans.length && spans[si][0] <= a ? spans[si][2] : '';
    const word = !!(words && wi < words.length && words[wi][0] <= a);
    const piece = t.slice(a, b);
    if (!span && !word) out.push(piece);
    else
      out.push(
        <span key={a} className={word ? (span ? `${span} ${wordClass}` : wordClass) : span}>
          {piece}
        </span>,
      );
  }
  if (cut) out.push('…');
  return out;
}
