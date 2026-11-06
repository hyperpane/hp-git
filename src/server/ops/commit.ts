// `commit`, `undoCommit` and `authors`: a commit with its summary,
// description and trailers (sign-off, co-authors) written as Desktop
// writes them; the last commit taken back, its changes staged; and the
// people in the history, to pick co-authors from.

import { PluginError } from '@hyperpane/sdk/server';
import type { Author } from '../../shared/index.ts';
import { count } from '../lib/args.ts';
import { RS, US } from '../lib/commits.ts';
import type { RunOptions } from '../lib/process.ts';
import type { Repo } from '../lib/repo.ts';
import { stage } from './stage.ts';

export interface CommitRequest {
  summary?: string;
  description?: string;
  amend?: boolean;
  signoff?: boolean;
  coAuthors?: ({ name: string; email: string } | string)[];
  all?: boolean;
  allowEmpty?: boolean;
  noVerify?: boolean;
}

export async function commit(repo: Repo, r: CommitRequest, signal?: AbortSignal): Promise<{ sha: string; summary: string }> {
  const summary = String(r.summary ?? '').trim();
  const description = String(r.description ?? '').trim();
  if (!summary && !r.amend) throw new PluginError('A commit needs a summary.');
  if (/\n/.test(summary)) throw new PluginError('The summary is one line: put the rest in the description.');
  if (r.all) await stage(repo, [], true);
  const args = ['commit', '--quiet'];
  if (r.amend) args.push('--amend');
  if (r.allowEmpty) args.push('--allow-empty');
  if (r.noVerify) args.push('--no-verify');
  const trailers: string[] = [];
  for (const a of r.coAuthors ?? []) {
    const text = typeof a === 'string' ? a.trim() : `${String(a?.name ?? '').trim()} <${String(a?.email ?? '').trim()}>`;
    if (!/^[^<>\n]+ <[^<>\s]+>$/.test(text)) throw new PluginError(`“${text}” isn't a co-author: a name and an email are needed.`);
    trailers.push(`Co-authored-by: ${text}`);
  }
  const o: RunOptions = { signal };
  if (summary) {
    // The trailers written here, at the very end: git's own would go above
    // a last line that starts with # (a comment to it, an issue to people).
    if (r.signoff) {
      const ident = (await repo.text(['var', 'GIT_COMMITTER_IDENT'])).trim().replace(/ \d+ [+-]\d{4}$/, '');
      trailers.push(`Signed-off-by: ${ident}`);
    }
    let message = description ? `${summary}\n\n${description}` : summary;
    const lastParagraph = message.split(/\n\s*\n/).pop() ?? '';
    const isTrailers = message.includes('\n\n') && lastParagraph.split('\n').every((l) => /^[A-Za-z0-9-]+: /.test(l));
    const fresh = trailers.filter((t) => !message.split('\n').includes(t));
    if (fresh.length) message += `${isTrailers ? '\n' : '\n\n'}${fresh.join('\n')}`;
    args.push('--cleanup=whitespace', '-F', '-');
    o.input = `${message}\n`;
  } else {
    if (r.signoff) args.push('--signoff');
    for (const t of trailers) args.push('--trailer', t);
    args.push('--no-edit');
  }
  await repo.run(args, o);
  const out = await repo.text(['log', '-1', '--format=%H%x1f%s', 'HEAD', '--']);
  const [sha, subject] = out.trim().split('\x1f');
  return { sha, summary: subject ?? summary };
}

/** Takes the last commit back, its changes staged; gives its message back. */
export async function undoCommit(repo: Repo): Promise<{ summary: string; description: string }> {
  if (!(await repo.hasHead())) throw new PluginError('There is no commit to undo.');
  const message = (await repo.text(['log', '-1', '--format=%B', 'HEAD', '--'])).trim();
  const nl = message.indexOf('\n');
  const summary = nl < 0 ? message : message.slice(0, nl);
  const description = nl < 0 ? '' : message.slice(nl + 1);
  if (await repo.ok(['rev-parse', '--verify', '--quiet', 'HEAD^'])) await repo.run(['reset', '--soft', 'HEAD^']);
  // The first commit: back to no commit at all, the files staged.
  else await repo.run(['update-ref', '-d', 'HEAD']);
  return { summary: summary.trim(), description: description.trim() };
}

export async function authors(repo: Repo, limit = 2000, signal?: AbortSignal): Promise<Author[]> {
  if (!(await repo.hasHead())) return [];
  const n = Math.max(1, count(limit, 2000, 20_000));
  const out = await repo.text(['log', `-n${n}`, '--no-color', '--format=%an%x1f%ae%x1f%(trailers:key=Co-authored-by,valueonly,separator=%x1d)%x1e', 'HEAD', '--'], { signal });
  const people = new Map<string, Author>();
  const add = (name: string, email: string) => {
    name = name.trim();
    email = email.trim();
    if (!name || !email) return;
    const key = email.toLowerCase();
    const a = people.get(key);
    if (a) a.commits++;
    else people.set(key, { name, email, commits: 1 });
  };
  for (const record of out.split(RS)) {
    const [name, email, trailers] = record.replace(/^\n/, '').split(US);
    if (name === undefined || email === undefined) continue;
    add(name, email);
    for (const t of (trailers ?? '').split('\x1d')) {
      const m = /^(.*?)\s*<([^>]+)>/.exec(t.trim());
      if (m) add(m[1], m[2]);
    }
  }
  return [...people.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}
