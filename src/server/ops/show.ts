// `show` and `changes`: one commit whole (its message, its signature, the
// files it changed with their lines; a stash's untracked files too), and
// the files changed from one revision to another or to the working tree.

import { PluginError } from '@hyperpane/sdk/server';
import type { ChangedFile, CommitDetail } from '../../shared/index.ts';
import { rev } from '../lib/args.ts';
import { changes } from '../lib/changes.ts';
import { FIELDS, RS, US, baseOf, parseCommit } from '../lib/commits.ts';
import type { Repo } from '../lib/repo.ts';

const FILES_MAX = 5000;

export async function show(repo: Repo, sha: string, signal?: AbortSignal): Promise<CommitDetail> {
  const commit = rev(sha, 'commit');
  const out = await repo.exec(['show', '-s', '--decorate=full', '--no-color', `--format=%x1e${FIELDS}%x1f%G?%x1f%GS%x1f%B`, commit, '--'], { signal });
  if (out.code !== 0) throw new PluginError(`There's no commit ${commit} here.`);
  const record = out.stdout.toString('utf8').split(RS)[1] ?? '';
  const f = record.split(US);
  const c = parseCommit(f.slice(0, 10).join(US));
  if (!c) throw new PluginError(`There's no commit ${commit} here.`);
  const message = f.slice(12).join(US).replace(/\n+$/, '');
  const nl = message.indexOf('\n');
  const body = nl < 0 ? '' : message.slice(nl + 1).replace(/^\n+/, '');
  const detail: CommitDetail = { ...c, body, files: [], truncated: false };
  const sig = SIGNATURES[f[10]];
  if (sig) detail.signature = { status: sig, signer: f[11] ?? '' };
  const base = await baseOf(repo, c.sha);
  const changed = await changes(repo, base, c.sha, signal);
  // A stash: its untracked files are a third parent.
  if (c.parents.length === 3 && c.refs.some((r) => r.kind === 'stash') || (await isStash(repo, c.sha, c.parents))) {
    const untracked = await changes(repo, await repo.emptyTree(), c.parents[2], signal);
    for (const u of untracked.files) changed.files.push({ ...u, untracked: true });
  }
  detail.files = changed.files.slice(0, FILES_MAX);
  detail.truncated = changed.files.length > FILES_MAX;
  return detail;
}

const SIGNATURES: Record<string, NonNullable<CommitDetail['signature']>['status']> = {
  G: 'good',
  B: 'bad',
  U: 'unknown',
  X: 'expired',
  Y: 'expired',
  R: 'revoked',
  E: 'missingKey',
};

async function isStash(repo: Repo, sha: string, parents: string[]): Promise<boolean> {
  if (parents.length !== 3) return false;
  const out = await repo.exec(['rev-list', '-g', '--format=%H', 'refs/stash', '--']);
  return out.code === 0 && out.stdout.toString().includes(sha);
}

/** The files changed from `from` to `to`, or to the working tree (tracked files). */
export async function changesBetween(repo: Repo, from: unknown, to?: unknown, signal?: AbortSignal): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  const a = rev(from);
  const b = to === undefined || to === null || to === '' ? null : rev(to);
  const { files } = await changes(repo, a, b, signal);
  return { files: files.slice(0, FILES_MAX), truncated: files.length > FILES_MAX };
}
