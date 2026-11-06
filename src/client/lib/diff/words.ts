// What changed inside a changed line: the words (and spaces and marks)
// that differ between a removed line and the added line paired with it,
// by Myers' diff over tokens. Lines that share too little get none: the
// whole line is the change then.

export type Range = [number, number];

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

function tokens(text: string): { t: string; at: number }[] {
  const out: { t: string; at: number }[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) out.push({ t: m[0], at: m.index });
  return out;
}

/** Index pairs of the longest common subsequence of `a` and `b`, or null
 * past `maxD` differences. */
export function lcs(a: ArrayLike<number>, b: ArrayLike<number>, maxD = 400): [number, number][] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let end = -1;
  outer: for (let d = 0; d <= Math.min(max, maxD); d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        end = d;
        break outer;
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  if (end < 0) return null;
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = end; d > 0; d--) {
    const prev = trace[d - 1];
    const at = (k: number) => prev[k + d - 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) pairs.push([--x, --y]);
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

/** The common start and end, as one changed range a side. */
function trimmed(a: string, b: string): [Range[], Range[]] | null {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  if (start + end < Math.min(a.length, b.length) * 0.3) return null;
  return [start < a.length - end ? [[start, a.length - end]] : [], start < b.length - end ? [[start, b.length - end]] : []];
}

/** The changed ranges of `a` (removed) and `b` (added), or null when the
 * lines are too different for it to help. */
export function wordDiff(a: string, b: string): [Range[], Range[]] | null {
  if (a === b) return [[], []];
  if (a.length > 2000 || b.length > 2000) return trimmed(a, b);
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length > 500 || tb.length > 500) return trimmed(a, b);
  const ids = new Map<string, number>();
  const id = (t: string) => {
    let n = ids.get(t);
    if (n === undefined) ids.set(t, (n = ids.size));
    return n;
  };
  const na = Int32Array.from(ta, (x) => id(x.t));
  const nb = Int32Array.from(tb, (x) => id(x.t));
  const pairs = lcs(na, nb, 200);
  if (!pairs) return trimmed(a, b);
  // How much is the same, in characters (not counting spaces).
  let same = 0;
  for (const [i] of pairs) if (!/^\s+$/.test(ta[i].t)) same += ta[i].t.length;
  const solid = (s: string) => s.replace(/\s+/g, '').length;
  if (same < Math.max(solid(a), solid(b)) * 0.35) return null;
  const changed = (toks: { t: string; at: number }[], kept: Set<number>, text: string): Range[] => {
    const out: Range[] = [];
    for (let i = 0; i < toks.length; i++) {
      if (kept.has(i)) continue;
      const from = toks[i].at;
      const to = i + 1 < toks.length ? toks[i + 1].at : text.length;
      const last = out[out.length - 1];
      if (last && last[1] === from) last[1] = to;
      else out.push([from, to]);
    }
    // A run broken only by one kept space reads as one change.
    for (let i = out.length - 2; i >= 0; i--) {
      const gap = text.slice(out[i][1], out[i + 1][0]);
      if (gap.length <= 1 && /^\s?$/.test(gap)) {
        out[i][1] = out[i + 1][1];
        out.splice(i + 1, 1);
      }
    }
    return out;
  };
  return [changed(ta, new Set(pairs.map((p) => p[0])), a), changed(tb, new Set(pairs.map((p) => p[1])), b)];
}
