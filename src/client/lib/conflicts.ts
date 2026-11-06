// A conflicted file's text, from its markers: plain stretches and
// conflicts (ours, the base when the markers have it, theirs); the file
// again with each conflict as chosen; and what each kind of conflict is.

import type { ConflictKind } from '../../shared/index.ts';

export type Block =
  | { t: 'text'; lines: string[] }
  | { t: 'conflict'; ours: string[]; base: string[] | null; theirs: string[]; oursLabel: string; theirsLabel: string; at: number };

/** The file's text as plain stretches and conflicts, from its markers. */
export function parseConflicts(lines: string[]): Block[] {
  const out: Block[] = [];
  let text: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('<<<<<<<')) {
      const start = i;
      const ours: string[] = [];
      const theirs: string[] = [];
      let base: string[] | null = null;
      let part: 'ours' | 'base' | 'theirs' = 'ours';
      let theirsLabel = '';
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (part === 'ours' && l.startsWith('|||||||')) {
          part = 'base';
          base = [];
        } else if ((part === 'ours' || part === 'base') && l.startsWith('=======')) part = 'theirs';
        else if (part === 'theirs' && l.startsWith('>>>>>>>')) {
          theirsLabel = l.slice(7).trim();
          closed = true;
          break;
        } else if (part === 'ours') ours.push(l);
        else if (part === 'base') base!.push(l);
        else theirs.push(l);
      }
      if (!closed) {
        // Not a conflict after all: a line that looks like a marker.
        text.push(line);
        i++;
        continue;
      }
      if (text.length) out.push({ t: 'text', lines: text });
      text = [];
      out.push({ t: 'conflict', ours, base, theirs, oursLabel: line.slice(7).trim(), theirsLabel, at: start + 1 });
      i = j + 1;
      continue;
    }
    text.push(line);
    i++;
  }
  if (text.length) out.push({ t: 'text', lines: text });
  return out;
}

export type Choice = 'ours' | 'theirs' | 'both' | 'bothTheirsFirst';

/** The file with each conflict as chosen (unchosen ones keep their markers). */
export function merged(blocks: Block[], choices: Map<number, Choice>, eol: string): string {
  const out: string[] = [];
  blocks.forEach((b, k) => {
    if (b.t === 'text') return out.push(...b.lines);
    const c = choices.get(k);
    if (c === 'ours') out.push(...b.ours);
    else if (c === 'theirs') out.push(...b.theirs);
    else if (c === 'both') out.push(...b.ours, ...b.theirs);
    else if (c === 'bothTheirsFirst') out.push(...b.theirs, ...b.ours);
    else {
      out.push(`<<<<<<< ${b.oursLabel}`.trimEnd(), ...b.ours);
      if (b.base) out.push('|||||||', ...b.base);
      out.push('=======', ...b.theirs, `>>>>>>> ${b.theirsLabel}`.trimEnd());
    }
  });
  return out.join(eol);
}

export const KIND: Record<ConflictKind, string> = {
  bothModified: 'Both sides changed it.',
  bothAdded: 'Both sides added it.',
  bothDeleted: 'Both sides deleted it.',
  addedByUs: 'Added on this branch; the other side doesn’t have it.',
  addedByThem: 'Added on the other side; this branch doesn’t have it.',
  deletedByUs: 'Deleted on this branch, changed on the other side.',
  deletedByThem: 'Changed on this branch, deleted on the other side.',
};
