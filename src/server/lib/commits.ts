// Commits as `git log` prints them for this plugin: the format (fields
// split by US, records by RS), a record parsed with its refs, a page of
// them read as git writes it (git is stopped once the page is full), and
// what a commit is compared with.

import type { Commit, LogPage, Ref } from '../../shared/index.ts';
import type { Repo } from './repo.ts';

export const RS = '\x1e';
export const US = '\x1f';
/** sha, parents, author, email, time, committer, email, time, subject, refs. */
export const FIELDS = ['%H', '%P', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%s', '%D'].join('%x1f');
export const FORMAT = `--format=%x1e${FIELDS}`;

export function parseCommit(record: string): Commit | null {
  const f = record.split(US);
  if (f.length < 10) return null;
  return {
    sha: f[0],
    parents: f[1] ? f[1].split(' ') : [],
    author: f[2],
    email: f[3],
    date: Number(f[4]) * 1000,
    committer: f[5],
    committerEmail: f[6],
    committerDate: Number(f[7]) * 1000,
    subject: f[8],
    refs: parseRefs(f[9]),
  };
}

/** `%D` with `--decorate=full`: `HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main`. */
export function parseRefs(text: string): Ref[] {
  const refs: Ref[] = [];
  for (let part of text.split(', ')) {
    part = part.trim();
    if (!part) continue;
    if (part === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' });
      continue;
    }
    let current = false;
    if (part.startsWith('HEAD -> ')) {
      current = true;
      part = part.slice(8);
    }
    if (part.startsWith('tag: ')) part = part.slice(5);
    let ref: Ref | null = null;
    if (part.startsWith('refs/heads/')) ref = { name: part.slice(11), kind: 'branch' };
    else if (part.startsWith('refs/remotes/')) {
      const name = part.slice(13);
      if (name.endsWith('/HEAD')) continue;
      ref = { name, kind: 'remote' };
    } else if (part.startsWith('refs/tags/')) ref = { name: part.slice(10), kind: 'tag' };
    else if (part === 'refs/stash') ref = { name: 'stash', kind: 'stash' };
    if (!ref) continue;
    if (current) ref.current = true;
    refs.push(ref);
  }
  return refs;
}

/** `git log` with these arguments: `limit` commits after `skip`, and whether there are more. */
export async function walk(repo: Repo, args: string[], paths: string[], skip: number, limit: number, signal?: AbortSignal): Promise<LogPage> {
  const commits: Commit[] = [];
  let more = false;
  let rest = '';
  const decoder = new TextDecoder();
  const take = (record: string) => {
    if (!record) return true;
    const c = parseCommit(record.replace(/\n$/, ''));
    if (!c) return true;
    if (commits.length >= limit) {
      more = true;
      return false;
    }
    commits.push(c);
    return true;
  };
  await repo.run(
    ['log', '--decorate=full', '--no-color', '--no-show-signature', FORMAT, `--skip=${skip}`, `--max-count=${limit + 1}`, ...args, '--', ...paths],
    {
      signal,
      onStdout: (chunk) => {
        rest += decoder.decode(chunk, { stream: true });
        const records = rest.split(RS);
        rest = records.pop() ?? '';
        for (const record of records) if (!take(record)) return false;
        return true;
      },
    },
  );
  if (!more) take(rest + decoder.decode());
  return { commits, more };
}

/** What a commit is compared with: its first parent, or nothing. */
export async function baseOf(repo: Repo, commit: string): Promise<string> {
  const out = await repo.text(['rev-list', '--parents', '-n', '1', commit, '--']);
  return out.trim().split(/\s+/)[1] ?? (await repo.emptyTree());
}
