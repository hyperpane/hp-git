// What goes in the next commit, as GitHub Desktop has it: every change,
// unless it's left out. That's this window's own say, kept beside the
// repository and never in git's index: the index is left alone until
// Commit, which commits exactly what's checked (server `commit {only}`).
//
// A file with no choice is in, whole, its changes to come too (a new file,
// a file staged in a terminal, a file changed again). A file unchecked is
// out, whole, until it's checked again. A file some of whose lines were
// unchecked is in but for those lines, named by what they are (their kind,
// their text, which of the same they are) rather than where, so they stay
// out as the lines around them move. A file gone from the changes
// (committed, discarded) loses its choice: when it changes again, it's in.
// After a commit, what's left of a file committed in part is out, as
// GitHub Desktop leaves it.

import type { Diff, FileStatus } from '../../shared/index.ts';
import { stagePatch } from '../../shared/patch.ts';
import { type LineKey, keyOf } from './diff/model.ts';
import { local } from './local.ts';

/** `out`: the whole file is left out. `{out}`: these lines are. */
export type Choice = 'out' | { out: string[] };
export type Choices = Record<string, Choice>;

/** A file's checkbox: in, out, or in part. */
export function stateOf(choices: Choices, path: string): boolean | 'mixed' {
  const c = choices[path];
  return c === undefined ? true : c === 'out' ? false : 'mixed';
}

/** These files in, whole (`on`), or out. */
export function withFiles(choices: Choices, paths: string[], on: boolean): Choices {
  const next = { ...choices };
  for (const p of paths) {
    if (on) delete next[p];
    else next[p] = 'out';
  }
  return next;
}

/** Every changed line's name, by its key: `+2:text` is the third added line
 * reading `text`. */
export function lineIds(diff: Pick<Diff, 'hunks'>): Map<LineKey, string> {
  const ids = new Map<LineKey, string>();
  const seen = new Map<string, number>();
  diff.hunks.forEach((hunk, h) =>
    hunk.lines.forEach((line, i) => {
      if (line.kind === ' ') return;
      const what = `${line.kind}${line.text}`;
      const n = seen.get(what) ?? 0;
      seen.set(what, n + 1);
      ids.set(keyOf(h, i), `${line.kind}${n}:${line.text}`);
    }),
  );
  return ids;
}

/** The changed lines of a file's diff (against HEAD) that are in. */
export function includedLines(diff: Pick<Diff, 'hunks'>, choice: Choice | undefined): Set<LineKey> {
  const ids = lineIds(diff);
  if (choice === 'out') return new Set();
  const out = new Set(choice?.out ?? []);
  return new Set([...ids].filter(([, id]) => !out.has(id)).map(([k]) => k));
}

/** These lines of a file in (`on`) or out; the file's choice as it then is
 * (none when every line is in, `out` when none is). */
export function withLines(choices: Choices, path: string, diff: Pick<Diff, 'hunks'>, keys: LineKey[], on: boolean): Choices {
  const ids = lineIds(diff);
  const now = includedLines(diff, choices[path]);
  for (const k of keys) {
    if (!ids.has(k)) continue;
    if (on) now.add(k);
    else now.delete(k);
  }
  const next = { ...choices };
  if (now.size === ids.size) delete next[path];
  else if (now.size === 0) next[path] = 'out';
  else next[path] = { out: [...ids].filter(([k]) => !now.has(k)).map(([, id]) => id) };
  return next;
}

/** The choices for the files there now (of a cut list, the others' too). */
export function pruned(choices: Choices, files: FileStatus[], truncated = false): Choices {
  if (truncated) return choices;
  const there = new Set(files.map((f) => f.path));
  const keys = Object.keys(choices);
  if (keys.every((p) => there.has(p))) return choices;
  return Object.fromEntries(Object.entries(choices).filter(([p]) => there.has(p)));
}

/** After a commit: what's left of the files committed in part is out. */
export const afterCommit = (choices: Choices): Choices => Object.fromEntries(Object.keys(choices).map((p) => [p, 'out' as const]));

/** The files in the next commit, in whole or in part. */
export const checkedFiles = (files: FileStatus[], choices: Choices) => files.filter((f) => !f.conflict && choices[f.path] !== 'out');

/**
 * What Commit sends (`commit {only}`): the files in whole (with a rename's
 * old path, which goes), and for each file in part a patch of its lines
 * that are in, from its diff against HEAD as it is now.
 */
export async function selection(files: FileStatus[], choices: Choices, diffOf: (f: FileStatus) => Promise<Diff>): Promise<{ paths: string[]; patches: string[] }> {
  const paths: string[] = [];
  const patches: string[] = [];
  for (const f of checkedFiles(files, choices)) {
    const choice = choices[f.path];
    if (choice !== undefined && !f.from) {
      const diff = await diffOf(f);
      if (!diff.binary && diff.hunks.length) {
        const patch = stagePatch(diff, includedLines(diff, choice));
        if (patch) patches.push(patch);
        continue;
      }
    }
    paths.push(f.path);
    if (f.from) paths.push(f.from);
  }
  return { paths, patches };
}

const key = (root: string) => `include.${root}`;

/** A repository's choices, as this machine keeps them (every window on it
 * reads the same). */
export const inclusion = {
  key,
  get: (root: string): Choices => local.get<Choices>(key(root), {}),
  set: (root: string, choices: Choices) => local.set(key(root), choices),
};
