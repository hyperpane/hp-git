// `merge`, `rebase`, `cherryPick`, `revert`, `reset` and `operation`: what
// may stop at conflicts (an outcome, not a failure), and what's under way
// continued, skipped or aborted.

import { PluginError } from '@hyperpane/sdk/server';
import type { Outcome } from '../../shared/index.ts';
import { ref } from '../lib/args.ts';
import { CONFLICT, conflicted, operationOrUnmerged } from '../lib/conflicted.ts';
import { explain } from '../lib/explain.ts';
import { operation } from '../lib/operation.ts';
import type { Repo } from '../lib/repo.ts';

export async function merge(repo: Repo, r: { ref: unknown; ffOnly?: boolean; noFf?: boolean; squash?: boolean }) {
  const args = ['merge', '--no-edit'];
  if (r.ffOnly) args.push('--ff-only');
  if (r.noFf) args.push('--no-ff');
  if (r.squash) args.push('--squash');
  args.push(ref(r.ref));
  return conflicted(repo, args);
}

export async function rebase(repo: Repo, onto: unknown) {
  return conflicted(repo, ['rebase', ref(onto)]);
}

export async function cherryPick(repo: Repo, shas: unknown[]) {
  const list = shas.map((s) => ref(s, 'commit'));
  if (!list.length) throw new PluginError('Which commit?');
  const args = ['cherry-pick'];
  // A merge: picked against its first parent.
  if (list.length === 1 && (await parents(repo, list[0])) > 1) args.push('-m', '1');
  return conflicted(repo, [...args, ...list]);
}

async function parents(repo: Repo, sha: string): Promise<number> {
  const out = await repo.text(['rev-list', '--parents', '-n', '1', sha, '--']);
  return out.trim().split(/\s+/).length - 1;
}

export async function revert(repo: Repo, sha: unknown) {
  const s = ref(sha, 'commit');
  const args = ['revert', '--no-edit'];
  if ((await parents(repo, s)) > 1) args.push('-m', '1');
  return conflicted(repo, [...args, s]);
}

export async function reset(repo: Repo, sha: unknown, mode: unknown) {
  if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') throw new PluginError('Reset soft, mixed or hard.');
  await repo.run(['reset', '--quiet', `--${mode}`, ref(sha, 'commit'), '--']);
}

/** Continue, abort or skip whatever is under way. */
export async function operationAction(repo: Repo, action: unknown): Promise<Outcome> {
  const op = await operation(repo.gitDir);
  if (!op) throw new PluginError('Nothing is under way to abort or continue.');
  const command = { merge: 'merge', rebase: 'rebase', cherryPick: 'cherry-pick', revert: 'revert', am: 'am', bisect: 'bisect' }[op.kind];
  if (op.kind === 'bisect') {
    if (action === 'abort') {
      await repo.run(['bisect', 'reset']);
      return { conflicts: false };
    }
    throw new PluginError('Bisect from a terminal.');
  }
  if (action === 'abort') {
    await repo.run([command, '--abort']);
    return { conflicts: false };
  }
  if (action === 'skip') {
    if (op.kind === 'merge') throw new PluginError('A merge has nothing to skip: abort it, or resolve and continue.');
    return conflicted(repo, [command, '--skip']);
  }
  if (action !== 'continue') throw new PluginError('Continue, abort or skip.');
  const unmerged = await repo.exec(['ls-files', '-u', '-z']);
  if (unmerged.stdout.length) throw new PluginError('Some files still have conflicts. Resolve them first.');
  // A merge is concluded by committing it, with the message git prepared.
  if (op.kind === 'merge') {
    await repo.run(['commit', '--no-edit', '--quiet']);
    return { conflicts: false };
  }
  const out = await repo.exec([command, '--continue']);
  const text = `${out.stdout.toString('utf8')}\n${out.stderr}`;
  if (out.code === 0) return { conflicts: false };
  if (CONFLICT.test(text) && (await operationOrUnmerged(repo))) return { conflicts: true, message: 'There are conflicts to resolve.' };
  if (/nothing to commit|No changes - did you forget|previous cherry-pick is now empty|nothing added to commit/i.test(text)) {
    throw new PluginError('Nothing is left to commit for this step: skip it instead.');
  }
  throw new PluginError(explain(out.stderr, out.stdout.toString('utf8')));
}
