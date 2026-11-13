// `commit`, `undoCommit` and `authors`: a commit with its summary,
// description and trailers (sign-off, co-authors) written as Desktop
// writes them, of what's staged or (`only`) of exactly the files and lines
// checked, git's index left alone; the last commit taken back, its changes
// staged; and the people in the history, to pick co-authors from.

import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { PluginError } from '@hyperpane/sdk/server';
import type { Author } from '../../shared/index.ts';
import { asList, count } from '../lib/args.ts';
import { RS, US, parseCoAuthors } from '../lib/commits.ts';
import { checkPaths, literal, nulList } from '../lib/pathspec.ts';
import type { RunOptions } from '../lib/process.ts';
import type { Repo } from '../lib/repo.ts';
import { applyArgs, isPatch, patchPath } from './apply.ts';
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
  /** Commit exactly these, whatever's staged: whole files as the working
   * tree has them, and patches of some of a file's lines (src/shared/patch.ts,
   * from its diff against HEAD). */
  only?: { paths?: unknown; patches?: unknown };
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
  if (r.only) await commitOnly(repo, r.only, (env) => repo.run(args, { ...o, env }));
  else await repo.run(args, o);
  const out = await repo.text(['log', '-1', '--format=%H%x1f%s', 'HEAD', '--']);
  const [sha, subject] = out.trim().split('\x1f');
  return { sha, summary: subject ?? summary };
}

/**
 * A commit of exactly what's checked, made from an index of its own (HEAD,
 * then the files and the patches), as `git commit -- paths` does: git's
 * index isn't touched on the way, and a commit that fails leaves it as it
 * was. After the commit, the committed files' entries in it are the new
 * HEAD's, so they don't show as staged back to what they were.
 */
async function commitOnly(repo: Repo, only: NonNullable<CommitRequest['only']>, commit: (env: Record<string, string>) => Promise<unknown>) {
  const paths = checkPaths(asList(only.paths));
  const patches = asList(only.patches);
  if (!patches.every(isPatch)) throw new PluginError("That isn't a patch.");
  const patched = checkPaths(patches.map((p) => patchPath(p) ?? ''));
  const index = path.join(repo.gitDir, `hyperpane-commit-${process.pid}-${Date.now()}.index`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await repo.run(['read-tree', ...((await repo.hasHead()) ? ['HEAD'] : ['--empty'])], { env });
    const there = await present(repo, paths, env);
    if (there.length) await repo.run(['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, input: nulList(there) });
    for (const patch of patches) await repo.run(applyArgs(patch, true, false), { env, input: patch });
    await commit(env);
  } finally {
    await rm(index, { force: true });
    await rm(`${index}.lock`, { force: true });
  }
  const committed = [...new Set([...paths, ...patched])];
  if (committed.length) await repo.run(['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(committed) });
}

/** The paths there's something of to commit: in the working tree, or in
 * HEAD (to delete). One added and then deleted has neither. */
async function present(repo: Repo, paths: string[], env: Record<string, string>): Promise<string[]> {
  const gone: string[] = [];
  const out: string[] = [];
  for (const p of paths) {
    if (await lstat(repo.file(p)).then(() => true, () => false)) out.push(p);
    else gone.push(p);
  }
  if (gone.length) {
    const listed = await repo.text(['ls-files', '-z', '--', ...gone.map(literal)], { env });
    const known = new Set(listed.split('\0'));
    out.push(...gone.filter((p) => known.has(p)));
  }
  return out;
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
    for (const p of parseCoAuthors(trailers ?? '')) add(p.name, p.email);
  }
  return [...people.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}
