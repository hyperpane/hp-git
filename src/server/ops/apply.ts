// `apply`: a patch of picked lines or hunks (src/shared/patch.ts), to the
// index or the working tree, where what's there now goes to the Trash
// first.

import { lstat } from 'node:fs/promises';
import { PluginError } from '@hyperpane/sdk/server';
import { explain } from '../lib/explain.ts';
import { checkPaths } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';
import { type Trash, copyToTrash } from '../lib/trash.ts';

/** Applies a patch made by src/shared/patch.ts: to the index (`cached`) or
 * the working tree, where what's there now goes to the Trash first. */
export async function apply(repo: Repo, patch: unknown, cached: boolean, reverse: boolean, trash: Trash) {
  if (!isPatch(patch)) throw new PluginError("That isn't a patch.");
  const args = applyArgs(patch, cached, reverse);
  if (!cached) {
    // Checked first, so nothing goes to the Trash for a patch that won't apply.
    const check = await repo.exec([...args.slice(0, -1), '--check', '-'], { input: patch });
    if (check.code !== 0) throw new PluginError(explain(check.stderr));
    const name = patchPath(patch);
    if (name) {
      const file = repo.file(checkPaths([name])[0]);
      if (await lstat(file).then((s) => s.isFile(), () => false)) await copyToTrash(repo, file, trash);
    }
  }
  await repo.run(args, { input: patch });
}

export const isPatch = (patch: unknown): patch is string => typeof patch === 'string' && patch.startsWith('diff --git ');

/** `git apply` for a patch of src/shared/patch.ts, read from stdin. */
export function applyArgs(patch: string, cached: boolean, reverse: boolean): string[] {
  const args = ['apply', '--whitespace=nowarn', '--recount'];
  if (cached) args.push('--cached');
  if (reverse) args.push('--reverse');
  // A hunk without context (a diff asked with no context lines).
  if (hasHunkWithoutContext(patch)) args.push('--unidiff-zero');
  args.push('-');
  return args;
}

/** The file a patch changes (its new name, or its old one if it goes). */
export function patchPath(patch: string): string | null {
  const m = /^\+\+\+ (?:"b\/(.*)"|b\/(.*?))\t?$/m.exec(patch) ?? /^--- (?:"a\/(.*)"|a\/(.*?))\t?$/m.exec(patch);
  return m ? (m[1] !== undefined ? unquote(m[1]) : m[2]) : null;
}

function unquote(text: string): string {
  return text.replace(/\\([\\"tnrabfv]|[0-7]{3})/g, (_, c: string) => {
    if (/^[0-7]{3}$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ t: '\t', n: '\n', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v' } as Record<string, string>)[c] ?? c;
  });
}

/** Whether a hunk of the patch has no context lines (git applies those only
 * with --unidiff-zero). */
export function hasHunkWithoutContext(patch: string): boolean {
  let inHunk = false;
  let context = true;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      if (inHunk && !context) return true;
      inHunk = true;
      context = false;
    } else if (inHunk && line.startsWith(' ')) context = true;
    else if (inHunk && line.startsWith('diff --git ')) {
      if (!context) return true;
      inHunk = false;
      context = true;
    }
  }
  return inHunk && !context;
}
