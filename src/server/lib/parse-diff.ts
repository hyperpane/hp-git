// A patch as git writes it, parsed: one file's header (new, deleted,
// renamed, its modes), its hunks with line numbers (at most `max` lines
// kept), and a submodule's change as its commits.

import type { Diff, Hunk, Line } from '../../shared/index.ts';

/** The header of a patch: what it is (new, deleted, renamed), its modes. */
export function parseHeader(out: Buffer): Diff {
  return parse(out, 0);
}

/** One file's patch (the first in `out`), keeping at most `max` lines. */
export function parse(out: Buffer | string, max = Infinity): Diff {
  const text = typeof out === 'string' ? out : out.toString('utf8');
  const d: Diff = { path: '', status: 'M', binary: false, truncated: false, size: text.length, additions: 0, deletions: 0, hunks: [] };
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let files = 0;
  let kept = 0;
  let last: Line | null = null;
  let start = 0;
  const n = text.length;
  while (start <= n) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = n;
    const line = text.slice(start, end);
    start = end + 1;
    if (end === n && !line) break;
    if (hunk) {
      const c = line[0];
      if (c === '+' || c === '-' || c === ' ') {
        if (c === '+') d.additions++;
        else if (c === '-') d.deletions++;
        if (kept >= max) {
          d.truncated = true;
          if (c !== '+') oldNo++;
          if (c !== '-') newNo++;
          last = null;
          continue;
        }
        const l: Line = { kind: c, text: line.slice(1) };
        if (c !== '+') l.old = oldNo++;
        if (c !== '-') l.new = newNo++;
        hunk.lines.push(l);
        kept++;
        last = l;
        continue;
      }
      if (c === '\\') {
        if (last) last.noNewline = true;
        continue;
      }
      if (line.startsWith('@@')) {
        hunk = startHunk(d, line, max, kept);
        if (hunk) {
          oldNo = hunk.oldStart;
          newNo = hunk.newStart;
        }
        last = null;
        continue;
      }
      hunk = null;
    }
    if (line.startsWith('diff --git ') || line.startsWith('diff --cc ') || line.startsWith('diff --combined ')) {
      if (++files > 1) break;
      continue;
    }
    if (line.startsWith('@@')) {
      hunk = startHunk(d, line, max, kept);
      if (hunk) {
        oldNo = hunk.oldStart;
        newNo = hunk.newStart;
      }
      last = null;
      continue;
    }
    if (line.startsWith('new file mode ')) {
      d.status = 'A';
      d.newMode = line.slice(14).trim();
    } else if (line.startsWith('deleted file mode ')) {
      d.status = 'D';
      d.oldMode = line.slice(18).trim();
    } else if (line.startsWith('old mode ')) d.oldMode = line.slice(9).trim();
    else if (line.startsWith('new mode ')) {
      d.newMode = line.slice(9).trim();
      if (d.oldMode && kindOfMode(d.oldMode) !== kindOfMode(d.newMode)) d.status = 'T';
    } else if (line.startsWith('similarity index ')) d.similarity = parseInt(line.slice(17), 10);
    else if (line.startsWith('rename from ')) {
      d.status = 'R';
      d.oldPath = line.slice(12);
    } else if (line.startsWith('copy from ')) {
      d.status = 'C';
      d.oldPath = line.slice(10);
    } else if (line.startsWith('index ')) {
      const m = /^index [0-9a-f]+\.\.[0-9a-f]+(?: (\d+))?/.exec(line);
      if (m?.[1]) {
        d.oldMode ??= m[1];
        d.newMode ??= m[1];
      }
    } else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) d.binary = true;
  }
  // A submodule's change: its commits, not lines.
  if (d.oldMode === '160000' || d.newMode === '160000' || d.hunks.some((h) => h.lines.some((l) => l.text.startsWith('Subproject commit ')))) {
    const pick = (kind: '+' | '-') => {
      for (const h of d.hunks) for (const l of h.lines) if (l.kind === kind && l.text.startsWith('Subproject commit ')) return l.text.slice(18).trim().split(/[\s-]/)[0];
      return null;
    };
    if (d.hunks.every((h) => h.lines.every((l) => l.text.startsWith('Subproject commit ')))) d.submodule = { before: pick('-'), after: pick('+') };
  }
  return d;
}

function kindOfMode(mode: string): string {
  return mode.slice(0, 2) === '12' ? 'link' : mode === '160000' ? 'submodule' : 'file';
}

function startHunk(d: Diff, header: string, max: number, kept: number): Hunk | null {
  const m = /^@@+ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@+ ?(.*)$/.exec(header);
  if (!m) return null;
  const h: Hunk = {
    header,
    oldStart: Number(m[1]),
    oldLines: m[2] === undefined ? 1 : Number(m[2]),
    newStart: Number(m[3]),
    newLines: m[4] === undefined ? 1 : Number(m[4]),
    lines: [],
  };
  if (m[5]) h.section = m[5];
  if (kept >= max) {
    d.truncated = true;
    return { ...h, lines: [] };
  }
  d.hunks.push(h);
  return h;
}
