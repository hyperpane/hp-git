// `stashes` and `stash`: the stashes, newest first; and stashing (some
// files, untracked ones, keeping the index), applying, popping and dropping
// one. (`stash {action: 'show'}` is a commit shown: ops/show.ts.)

import { PluginError } from '@hyperpane/sdk/server';
import type { Outcome, Stash } from '../../shared/index.ts';
import { asList } from '../lib/args.ts';
import { US } from '../lib/commits.ts';
import { conflicted } from '../lib/conflicted.ts';
import { checkPaths, nulList } from '../lib/pathspec.ts';
import type { RunOptions } from '../lib/process.ts';
import type { Repo } from '../lib/repo.ts';

export async function stashes(repo: Repo, signal?: AbortSignal): Promise<Stash[]> {
  const out = await repo.exec(['stash', 'list', '--format=%H%x1f%gd%x1f%gs%x1f%ct'], { signal });
  if (out.code !== 0) return [];
  const list: Stash[] = [];
  for (const line of out.stdout.toString('utf8').split('\n')) {
    if (!line) continue;
    const [sha, name, subject, time] = line.split(US);
    const index = Number(/\{(\d+)\}/.exec(name)?.[1] ?? list.length);
    const m = /^(WIP on|On) ([^:]+): (.*)$/s.exec(subject);
    const branch = m ? (m[2] === '(no branch)' ? null : m[2]) : null;
    const message = m ? (m[1] === 'On' ? m[3] : subject) : subject;
    list.push({ index, sha, message, branch, date: Number(time) * 1000 });
  }
  return list;
}

export async function stashPush(repo: Repo, r: { message?: string; untracked?: boolean; paths?: unknown; keepIndex?: boolean }) {
  const args = ['stash', 'push'];
  if (r.untracked !== false) args.push('--include-untracked');
  if (r.keepIndex) args.push('--keep-index');
  const message = String(r.message ?? '').trim();
  if (message) args.push('-m', message);
  const list = r.paths === undefined ? [] : checkPaths(asList(r.paths));
  const o: RunOptions = {};
  if (list.length) {
    args.push('--pathspec-from-file=-', '--pathspec-file-nul');
    o.input = nulList(list);
  }
  const out = await repo.run(args, o);
  if (/No local changes to save/.test(out.stdout.toString() + out.stderr)) throw new PluginError('There are no changes to stash.');
}

export async function stashAction(repo: Repo, action: string, index: unknown): Promise<Outcome> {
  const n = Number(index ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new PluginError("That isn't a stash.");
  const name = `stash@{${n}}`;
  if (action === 'drop') {
    await repo.run(['stash', 'drop', '-q', name]);
    return { conflicts: false };
  }
  if (action !== 'apply' && action !== 'pop') throw new PluginError('Push, apply, pop, drop or show a stash.');
  let outcome: Outcome;
  try {
    outcome = await conflicted(repo, ['stash', action, '--index', name]);
  } catch (e) {
    // `--index` fails when the staged part doesn't apply: again without it.
    if (/index/i.test((e as Error).message)) outcome = await conflicted(repo, ['stash', action, name]);
    else throw e;
  }
  if (outcome.conflicts && action === 'pop') {
    return { conflicts: true, message: "The stash made conflicts, so it's kept. Resolve them, then drop the stash." };
  }
  return outcome;
}
