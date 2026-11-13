// Diffs: one file's changes (in the working tree, staged, in a commit, or
// between two revisions), parsed into hunks with line numbers, with caps on
// size, images before and after, and files' contents (`blob`).
// The patch is parsed in lib/parse-diff.ts; where each side is read from
// in lib/sides.ts.

import { PluginError } from '@hyperpane/sdk/server';
import type { Blob, BlobContent, Diff } from '../../shared/index.ts';
import { baseOf } from '../lib/commits.ts';
import { parse, parseHeader } from '../lib/parse-diff.ts';
import { checkPaths, literal } from '../lib/pathspec.ts';
import type { Repo } from '../lib/repo.ts';
import { type Side, read, sizeOf } from '../lib/sides.ts';

/** A patch bigger than these comes back `tooLarge` unless asked `full`. */
export const SOFT_BYTES = 2 * 1024 * 1024;
export const SOFT_LINES = 20_000;
/** With `full`, it's cut (`truncated`) past these. */
export const HARD_BYTES = 64 * 1024 * 1024;
export const HARD_LINES = 400_000;
/** Images bigger than this aren't sent. */
export const IMAGE_MAX = 8 * 1024 * 1024;

const IMAGES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

export interface DiffRequest {
  path: string;
  oldPath?: string;
  staged?: boolean;
  /** The working tree against HEAD (before the first commit, against
   * nothing): what a commit of the file would take. */
  head?: boolean;
  untracked?: boolean;
  commit?: string;
  from?: string;
  to?: string;
  context?: number;
  ignoreWhitespace?: boolean;
  full?: boolean;
}

function revision(r: unknown, what: string): string {
  if (typeof r !== 'string' || !r.trim() || r.startsWith('-') || /[\0\n]/.test(r)) throw new PluginError(`That isn't a ${what}.`);
  return r.trim();
}

export async function diff(repo: Repo, r: DiffRequest, signal?: AbortSignal): Promise<Diff> {
  const [file] = checkPaths([r.path]);
  const oldPath = r.oldPath && r.oldPath !== file ? checkPaths([r.oldPath])[0] : undefined;
  const context = Number.isInteger(r.context) && (r.context as number) >= 0 ? Math.min(r.context as number, 100_000) : 3;
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', `-U${context}`];
  args.push(oldPath ? '-M' : '--no-renames');
  if (r.ignoreWhitespace) args.push('-w');
  const ok: number[] = [];
  let before: Side;
  let after: Side;
  const hasHead = await repo.hasHead();
  const old = oldPath ?? file;

  if (r.untracked) {
    args.push('--no-index', '--', '/dev/null', file);
    ok.push(1);
    before = null;
    after = { worktree: file };
  } else {
    if (r.commit) {
      const commit = revision(r.commit, 'commit');
      const base = await baseOf(repo, commit);
      args.push(base, commit);
      before = { spec: `${base}:${old}` };
      after = { spec: `${commit}:${file}` };
    } else if (r.from) {
      const from = revision(r.from, 'revision');
      args.push(from);
      before = { spec: `${from}:${old}` };
      if (r.to) {
        const to = revision(r.to, 'revision');
        args.push(to);
        after = { spec: `${to}:${file}` };
      } else after = { worktree: file };
    } else if (r.head) {
      args.push(hasHead ? 'HEAD' : await repo.emptyTree());
      before = hasHead ? { spec: `HEAD:${old}` } : null;
      after = { worktree: file };
    } else if (r.staged) {
      args.push('--cached', hasHead ? 'HEAD' : await repo.emptyTree());
      before = hasHead ? { spec: `HEAD:${old}` } : null;
      after = { spec: `:${file}` };
    } else {
      before = { spec: `:${old}` };
      after = { worktree: file };
    }
    args.push('--');
    if (oldPath) args.push(literal(oldPath));
    args.push(literal(file));
  }

  const limit = r.full ? HARD_BYTES : SOFT_BYTES;
  let out = await repo.run(args, { ok, limit: limit + 1, signal });
  // A conflicted file's diff is a combined one: show it against HEAD (ours)
  // instead, conflict markers and all.
  if (!r.staged && !r.head && !r.commit && !r.from && !r.untracked && out.stdout.subarray(0, 10).toString() === 'diff --cc ') {
    out = await repo.run(['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', `-U${context}`, '--no-renames', ...(r.ignoreWhitespace ? ['-w'] : []), hasHead ? 'HEAD' : await repo.emptyTree(), '--', literal(file)], { limit: limit + 1, signal });
    before = hasHead ? { spec: `HEAD:${file}` } : null;
  }
  const tooBig = out.cut || out.stdout.length > limit;
  let d: Diff;
  if (tooBig && !r.full) {
    d = parseHeader(out.stdout.subarray(0, 64 * 1024));
    d.tooLarge = true;
    d.hunks = [];
    const counts = await numstat(repo, args, ok, signal);
    d.additions = counts[0];
    d.deletions = counts[1];
    d.size = Math.max(await sizeOf(repo, before), await sizeOf(repo, after), out.stdout.length);
  } else {
    d = parse(out.stdout, r.full ? HARD_LINES : Infinity);
    if (!r.full && countLines(d) > SOFT_LINES) {
      d.tooLarge = true;
      d.hunks = [];
    }
    if (tooBig) d.truncated = true;
    d.size = out.stdout.length;
  }
  d.path = file;
  if (oldPath) d.oldPath = oldPath;
  else delete d.oldPath;
  if (d.status === 'A') before = null;
  if (d.status === 'D') after = null;
  if (d.binary) d.size = Math.max(await sizeOf(repo, before), await sizeOf(repo, after));

  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
  const mime = ext ? IMAGES[ext] : undefined;
  if (mime && (d.binary || ext === 'svg')) {
    d.image = { mime, before: await image(repo, before), after: await image(repo, after) };
  }
  return d;
}

function countLines(d: Diff): number {
  let n = 0;
  for (const h of d.hunks) n += h.lines.length;
  return n;
}

async function numstat(repo: Repo, args: string[], ok: number[], signal?: AbortSignal): Promise<[number, number]> {
  const copy = args.filter((a) => !a.startsWith('-U'));
  copy.splice(1, 0, '--numstat');
  const out = await repo.exec(copy, { ok, signal, limit: 1024 * 1024 });
  let a = 0;
  let d = 0;
  for (const line of out.stdout.toString('utf8').split('\n')) {
    const m = /^(\d+)\t(\d+)\t/.exec(line);
    if (m) {
      a += Number(m[1]);
      d += Number(m[2]);
    }
  }
  return [a, d];
}

async function image(repo: Repo, side: Side): Promise<Blob | null> {
  if (!side) return null;
  const size = await sizeOf(repo, side);
  if (size > IMAGE_MAX) return { size, tooLarge: true };
  const data = await read(repo, side, IMAGE_MAX);
  return data === null ? null : { size: data.length, data: data.toString('base64') };
}

const READ_MAX = 32 * 1024 * 1024;

export interface BlobRequest {
  path: string;
  rev?: string;
  start?: number;
  count?: number;
  base64?: boolean;
}

/** A file's content: in the working tree, the index (`:0`, a conflict's
 * `:1` `:2` `:3`), or a revision. */
export async function blob(repo: Repo, r: BlobRequest, signal?: AbortSignal): Promise<BlobContent> {
  const [file] = checkPaths([r.path]);
  let side: Side;
  if (r.rev === undefined || r.rev === null || r.rev === '') side = { worktree: file };
  else if (/^:[0-3]$/.test(r.rev)) side = { spec: `${r.rev}:${file}` };
  else side = { spec: `${revision(r.rev, 'revision')}:${file}` };
  const size = await sizeOf(repo, side);
  if (signal?.aborted) throw new PluginError('Cancelled.');
  const data = await read(repo, side, r.base64 ? 16 * 1024 * 1024 : READ_MAX);
  if (data === null) throw new PluginError(`${file} isn't there${'spec' in side ? ` in ${r.rev}` : ''}.`);
  const binary = data.subarray(0, 8000).includes(0);
  if (r.base64) return { size, binary, data: data.toString('base64') };
  if (binary) return { size, binary };
  const text = data.toString('utf8');
  const all = text.split('\n');
  if (all.length && all[all.length - 1] === '') all.pop();
  const from = Math.max(1, Math.floor(r.start ?? 1));
  const count = Math.min(Math.max(0, Math.floor(r.count ?? 100_000)), 100_000);
  return { size, binary, total: all.length, lines: all.slice(from - 1, from - 1 + count) };
}
