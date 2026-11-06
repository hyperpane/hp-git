// `blame`: who last changed each line of a file (at a revision, or as it is
// now), with each commit's author, date and summary once.

import type { Blame, BlameCommit } from '../../shared/index.ts';
import { rev } from '../lib/args.ts';
import { checkPaths } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';

const BLAME_LINES = 50_000;

export async function blame(repo: Repo, p: string, revision?: string, signal?: AbortSignal): Promise<Blame> {
  const [file] = checkPaths([p]);
  const args = ['blame', '--porcelain'];
  if (revision) args.push(rev(revision));
  args.push('--', file);
  const out = await repo.run(args, { signal, limit: 256 * 1024 * 1024 });
  const lines: Blame['lines'] = [];
  const commits: Record<string, BlameCommit> = {};
  const text = out.stdout.toString('utf8');
  let truncated = out.cut;
  let current: { sha: string; line: number } | null = null;
  let pending: Partial<BlameCommit> & { time?: number } = {};
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    if (line.startsWith('\t')) {
      if (current) {
        if (lines.length >= BLAME_LINES) {
          truncated = true;
          break;
        }
        lines.push({ sha: current.sha, line: current.line, text: line.slice(1) });
        if (!commits[current.sha]) {
          const c: BlameCommit = {
            author: pending.author ?? '',
            email: (pending.email ?? '').replace(/^<|>$/g, ''),
            date: (pending.time ?? 0) * 1000,
            summary: pending.summary ?? '',
          };
          if (pending.previous) c.previous = pending.previous;
          if (pending.boundary) c.boundary = true;
          commits[current.sha] = c;
        }
      }
      current = null;
      continue;
    }
    const m = /^([0-9a-f]{40,64}) (\d+) (\d+)/.exec(line);
    if (m) {
      current = { sha: m[1], line: Number(m[2]) };
      if (!commits[m[1]]) pending = {};
      continue;
    }
    const space = line.indexOf(' ');
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? '' : line.slice(space + 1);
    if (key === 'author') pending.author = value;
    else if (key === 'author-mail') pending.email = value;
    else if (key === 'author-time') pending.time = Number(value);
    else if (key === 'summary') pending.summary = value;
    else if (key === 'boundary') pending.boundary = true;
    else if (key === 'previous') {
      const sp = value.indexOf(' ');
      pending.previous = { sha: value.slice(0, sp), path: value.slice(sp + 1) };
    }
  }
  return { lines, commits, truncated };
}
