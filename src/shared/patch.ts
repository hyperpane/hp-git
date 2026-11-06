// Patches for staging, unstaging and discarding some of a file's lines (or
// hunks): what the Changes tab sends as `apply {patch, cached, reverse}`.
//
// From a diff the server gave (`diff` op) and the lines picked in it:
//
// - stagePatch: from an unstaged (or untracked) diff, applied to the index
//   (`cached`). The lines not picked stay as they are in the index: a `-`
//   not picked becomes context, a `+` not picked is left out.
// - unstagePatch: from a staged diff, applied to the index in reverse
//   (`cached`, `reverse`). The index is the diff's new side, so a `+` not
//   picked becomes context and a `-` not picked is left out.
// - discardPatch: from an unstaged diff, applied to the working tree in
//   reverse (`reverse`), the same way.
//
// Each hunk's starts are worked out again for what's left of the hunks
// before it, so git applies the patch exactly (no fuzz). A line with no
// newline at the end of the file keeps the patch valid on both of its sides:
// see `fixEndOfFile`.

import type { Diff, Line } from './diff.ts';

/** The lines picked: `'hunk:line'` keys (indexes into `diff.hunks` and each
 * hunk's `lines`), or a function of the two. */
export type Selection = ReadonlySet<string> | ((hunk: number, line: number) => boolean);

/** A line's key in a Selection. */
export function lineKey(hunk: number, line: number): string {
  return `${hunk}:${line}`;
}

/** Whether a line can be picked: only changed lines can. */
export function selectable(line: Line): boolean {
  return line.kind !== ' ';
}

/** The keys of every changed line in a hunk: picking a whole hunk. */
export function hunkLines(diff: Pick<Diff, 'hunks'>, hunk: number): string[] {
  const lines = diff.hunks[hunk]?.lines ?? [];
  const keys: string[] = [];
  lines.forEach((line, i) => {
    if (selectable(line)) keys.push(lineKey(hunk, i));
  });
  return keys;
}

/** The keys of every changed line in the diff. */
export function allLines(diff: Pick<Diff, 'hunks'>): string[] {
  return diff.hunks.flatMap((_, h) => hunkLines(diff, h));
}

type PatchDiff = Pick<Diff, 'path' | 'oldPath' | 'status' | 'hunks' | 'oldMode' | 'newMode' | 'binary'>;

/** Stages the picked lines of an unstaged or untracked diff. */
export function stagePatch(diff: PatchDiff, selected: Selection): string | null {
  return build(diff, selected, false);
}

/** Unstages the picked lines of a staged diff. */
export function unstagePatch(diff: PatchDiff, selected: Selection): string | null {
  return build(diff, selected, true);
}

/** Discards the picked lines of an unstaged diff from the working tree. */
export function discardPatch(diff: PatchDiff, selected: Selection): string | null {
  return build(diff, selected, true);
}

interface Out {
  kind: ' ' | '+' | '-';
  text: string;
  noNewline: boolean;
}

function picker(selected: Selection): (hunk: number, line: number) => boolean {
  return typeof selected === 'function' ? selected : (h, l) => selected.has(lineKey(h, l));
}

/**
 * The patch for the picked lines: `reverse` for one applied in reverse (to
 * take changes out of the diff's new side), else forward (to put them into
 * its old side). Null when nothing that changes anything is picked.
 */
export function build(diff: PatchDiff, selected: Selection, reverse: boolean): string | null {
  if (diff.binary) return null;
  const picked = picker(selected);
  const hunks: string[] = [];
  // How many more lines the new side has than the old, in the hunks so far.
  let offset = 0;
  let every = true;
  let any = false;

  diff.hunks.forEach((hunk, h) => {
    const chosen = hunk.lines.map((line, i) => selectable(line) && picked(h, i));
    for (let i = 0; i < hunk.lines.length; i++) if (selectable(hunk.lines[i]) && !chosen[i]) every = false;
    const out = fixEndOfFile(hunk.lines, chosen, reverse);
    if (!out.some((l) => l.kind !== ' ')) return;
    any = true;
    const oldLines = out.filter((l) => l.kind !== '+').length;
    const newLines = out.filter((l) => l.kind !== '-').length;
    // The first line each side's hunk covers (a side with no lines names the
    // line before, as diffs do).
    let firstOld: number;
    let firstNew: number;
    if (reverse) {
      firstNew = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
      firstOld = firstNew - offset;
    } else {
      firstOld = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart;
      firstNew = firstOld + offset;
    }
    offset += newLines - oldLines;
    const oldStart = oldLines === 0 ? firstOld - 1 : firstOld;
    const newStart = newLines === 0 ? firstNew - 1 : firstNew;
    const header = `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${hunk.section ? ` ${hunk.section}` : ''}`;
    const body = out.map((l) => `${l.kind}${l.text}\n${l.noNewline ? '\\ No newline at end of file\n' : ''}`).join('');
    hunks.push(`${header}\n${body}`);
  });
  if (!any) return null;

  // A new file stays new going forward (only what's picked is in it); going
  // back, it's taken away only when all of it is. A deleted file the same
  // way round.
  const created = diff.status === 'A' && (!reverse || every);
  const deleted = diff.status === 'D' && (reverse || every);
  const path = diff.path;
  const oldName = created ? '/dev/null' : quote(`a/${path}`);
  const newName = deleted ? '/dev/null' : quote(`b/${path}`);
  let head = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\n`;
  if (created) head += `new file mode ${diff.newMode ?? '100644'}\n`;
  if (deleted) head += `deleted file mode ${diff.oldMode ?? '100644'}\n`;
  head += `--- ${oldName}${tab(oldName)}\n+++ ${newName}${tab(newName)}\n`;
  return head + hunks.join('');
}

/**
 * One hunk's lines as the patch has them, with the picked ones changed and
 * the rest kept as the side the patch applies to has them. Then the end of
 * the file: a line that is the last of a side with no newline after it must
 * stay the last line of that side in the patch, or git refuses it.
 *
 * - Forward: an unpicked `-` with no newline becomes context, so the old
 *   last line would be followed by picked `+` lines. It's picked too, and
 *   the same line with a newline is added after it (unless a picked `+` is
 *   that already), so the lines picked follow it.
 * - In reverse: a picked `-` with no newline puts back a last line that
 *   other lines now follow, so it's put back with a newline.
 */
export function fixEndOfFile(lines: readonly Line[], chosen: readonly boolean[], reverse: boolean): Out[] {
  const pick = [...chosen];
  const extra = new Set<number>();
  if (!reverse) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.kind !== '-' || !line.noNewline || pick[i]) continue;
      const later = lines.some((l, j) => j > i && l.kind === '+' && pick[j]);
      if (!later) continue;
      pick[i] = true;
      const again = lines.findIndex((l, j) => j > i && l.kind === '+' && !l.noNewline && l.text === line.text);
      if (again >= 0) pick[again] = true;
      else extra.add(i);
    }
  }
  const out: Out[] = [];
  lines.forEach((line, i) => {
    const noNewline = !!line.noNewline;
    if (line.kind === ' ') out.push({ kind: ' ', text: line.text, noNewline });
    else if (pick[i]) {
      out.push({ kind: line.kind, text: line.text, noNewline });
      if (extra.has(i)) out.push({ kind: '+', text: line.text, noNewline: false });
    } else if ((line.kind === '-') === !reverse) out.push({ kind: ' ', text: line.text, noNewline });
    // Otherwise it isn't on the side the patch applies to: left out.
  });
  if (reverse) {
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      if (l.kind === '-' && l.noNewline && out.some((m, j) => j > i && m.kind !== '+')) l.noNewline = false;
    }
  }
  return out;
}

/** A path as git writes it in a patch: in double quotes, C-style, when it
 * has a quote, a backslash or a control character. */
export function quote(name: string): string {
  if (!/["\\\u0000-\u001f\u007f]/.test(name)) return name;
  const escapes: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r', '\u0007': '\\a', '\b': '\\b', '\f': '\\f', '\v': '\\v' };
  let out = '"';
  for (const ch of name) {
    if (escapes[ch]) out += escapes[ch];
    else if (ch < ' ' || ch === '\u007f') out += `\\${ch.charCodeAt(0).toString(8).padStart(3, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/** Git ends a `---`/`+++` name that has a space with a tab, so it's read whole. */
function tab(name: string): string {
  return !name.startsWith('"') && name.includes(' ') ? '\t' : '';
}
