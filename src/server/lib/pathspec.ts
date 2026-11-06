// Paths as git is given them: each one a literal pathspec (`a*.txt` is one
// file, not a pattern), a list of them on stdin, and refusing any that
// isn't inside the repository.

import { PluginError } from '@hyperpane/sdk/server';
import { WIN } from './platform.ts';

/** A path as a pathspec that means that file only (`a*.txt` is one file,
 * not a pattern). Not GIT_LITERAL_PATHSPECS: `stash -u` breaks with it. */
export function literal(p: string): string {
  return `:(literal)${p}`;
}

/** Paths for `--pathspec-from-file=- --pathspec-file-nul`. */
export function nulList(paths: readonly string[]): string {
  return paths.map((p) => `${literal(p)}\0`).join('');
}

/** Refuses paths that aren't inside the repository. */
export function checkPaths(paths: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (typeof p !== 'string') throw new PluginError(`${String(p)} isn't a path in the repository.`);
    const parts = p.split(/[\\/]/);
    const outside = WIN && (p.includes(':') || p.startsWith('\\'));
    if (!p || p.startsWith('/') || parts.includes('..') || outside || p.includes('\0')) throw new PluginError(`${p} isn't a path in the repository.`);
    out.push(p);
  }
  return out;
}
