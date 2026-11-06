// `log`, `compare` and `fileLog`: a page of history (searched by message,
// author, SHA, path or content), what isn't pushed marked; two refs' own
// commits and where they parted; a file's history, through renames.

import type { Commit, Compare, FileCommit, Letter, LogPage } from '../../shared/index.ts';
import { count, rev } from '../lib/args.ts';
import { FORMAT, RS, parseCommit, walk } from '../lib/commits.ts';
import { checkPaths, literal } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';

export interface LogRequest {
  ref?: string;
  all?: boolean;
  path?: string;
  search?: string;
  author?: string;
  pickaxe?: { text: string; regex?: boolean };
  sha?: string;
  since?: number;
  until?: number;
  firstParent?: boolean;
  skip?: number;
  limit?: number;
}

/**
 * A page of history. Git's output is parsed as it comes, and git is stopped
 * once the page is full.
 */
export async function log(repo: Repo, r: LogRequest, signal?: AbortSignal): Promise<LogPage> {
  const skip = count(r.skip, 0, Number.MAX_SAFE_INTEGER);
  const limit = Math.max(1, count(r.limit, 100, 1000));
  // What isn't pushed is worked out while git walks.
  const unpushed = unpushedSet(repo);
  if (r.sha !== undefined) {
    const sha = String(r.sha).trim();
    if (!/^[0-9a-f]{4,64}$/i.test(sha)) return { commits: [], more: false };
    const out = await repo.exec(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
    if (out.code !== 0 || skip > 0) return { commits: [], more: false };
    const page = await walk(repo, ['--no-walk', out.stdout.toString().trim()], [], 0, 1, signal);
    mark(page.commits, await unpushed);
    return page;
  }
  const args: string[] = ['--topo-order'];
  if (r.firstParent) args.push('--first-parent');
  if (r.search || r.author) args.push('--regexp-ignore-case', '--fixed-strings');
  if (r.search) args.push(`--grep=${r.search}`);
  if (r.author) args.push(`--author=${r.author}`);
  if (r.pickaxe?.text) args.push(r.pickaxe.regex ? `-G${r.pickaxe.text}` : `-S${r.pickaxe.text}`);
  if (Number.isFinite(r.since)) args.push(`--max-age=${Math.floor(Number(r.since) / 1000)}`);
  if (Number.isFinite(r.until)) args.push(`--min-age=${Math.floor(Number(r.until) / 1000)}`);
  if (r.all) {
    args.push('--branches', '--remotes', '--tags');
    if (await repo.hasHead()) args.push('HEAD');
  } else args.push(r.ref ? rev(r.ref, 'branch or commit') : 'HEAD');
  const paths = r.path ? checkPaths([r.path]).map(literal) : [];
  let page: LogPage;
  try {
    page = await walk(repo, args, paths, skip, limit, signal);
  } catch (e) {
    // No commit yet: no history.
    if (!r.ref && !r.all && /does not have any commits yet|unknown revision|bad (default )?revision/i.test((e as Error).message) && !(await repo.hasHead())) return { commits: [], more: false };
    throw e;
  }
  mark(page.commits, await unpushed);
  return page;
}

function mark(commits: Commit[], unpushed: Set<string>) {
  for (const c of commits) if (unpushed.has(c.sha)) c.unpushed = true;
}

/** Commits on HEAD that aren't on its upstream; with no upstream, those on
 * no remote branch (when there are remotes). */
async function unpushedSet(repo: Repo): Promise<Set<string>> {
  const [upstream, remotes] = await Promise.all([repo.ok(['rev-parse', '--verify', '--quiet', '@{upstream}']), repo.exec(['remote'])]);
  let out;
  if (upstream) out = await repo.exec(['rev-list', '--max-count=5000', 'HEAD', '^@{upstream}', '--']);
  else if (remotes.stdout.toString().trim()) out = await repo.exec(['rev-list', '--max-count=5000', 'HEAD', '--not', '--remotes', '--']);
  else return new Set();
  if (out.code !== 0) return new Set();
  return new Set(out.stdout.toString().split('\n').filter(Boolean));
}

export async function compare(repo: Repo, base: string, head: string, limit = 500, signal?: AbortSignal): Promise<Compare> {
  const b = rev(base, 'branch or commit');
  const h = rev(head, 'branch or commit');
  const max = Math.max(1, count(limit, 500, 5000));
  const counts = await repo.text(['rev-list', '--left-right', '--count', `${b}...${h}`, '--'], { signal });
  const [behindCount, aheadCount] = counts.trim().split(/\s+/).map(Number);
  const [ahead, behind, mb] = await Promise.all([
    walk(repo, ['--topo-order', `^${b}`, h], [], 0, max, signal),
    walk(repo, ['--topo-order', `^${h}`, b], [], 0, max, signal),
    repo.exec(['merge-base', b, h]),
  ]);
  return { ahead: ahead.commits, behind: behind.commits, aheadCount: aheadCount || 0, behindCount: behindCount || 0, mergeBase: mb.code === 0 ? mb.stdout.toString().trim() : null };
}

export async function fileLog(repo: Repo, p: string, skip = 0, limit = 100, signal?: AbortSignal): Promise<LogPage<FileCommit>> {
  const [file] = checkPaths([p]);
  const max = Math.max(1, count(limit, 100, 1000));
  const out = await repo.run(
    ['log', '--follow', '--name-status', '-z', '-M', '--decorate=full', '--no-color', FORMAT, `--skip=${count(skip, 0, Number.MAX_SAFE_INTEGER)}`, `--max-count=${max + 1}`, 'HEAD', '--', literal(file)],
    { signal, limit: 64 * 1024 * 1024 },
  );
  const commits: FileCommit[] = [];
  for (const record of out.stdout.toString('utf8').split(RS)) {
    if (!record) continue;
    const nul = record.indexOf('\0');
    const c = parseCommit(nul < 0 ? record : record.slice(0, nul));
    if (!c) continue;
    const t = (nul < 0 ? '' : record.slice(nul + 1)).replace(/^\n/, '').split('\0');
    const status = (t[0]?.[0] ?? 'M') as Letter;
    const fc: FileCommit = { ...c, path: file, status };
    if ((status === 'R' || status === 'C') && t[2]) {
      fc.from = t[1];
      fc.path = t[2];
    } else if (t[1]) fc.path = t[1];
    commits.push(fc);
  }
  const more = commits.length > max;
  return { commits: commits.slice(0, max), more };
}
