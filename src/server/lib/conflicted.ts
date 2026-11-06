// Commands that may stop half-way (merge, rebase, cherry-pick, revert, a
// stash applied, a pull): stopping at conflicts is an outcome, not a
// failure.

import { PluginError } from '@hyperpane/sdk/server';
import type { Outcome } from '../../shared/index.ts';
import { explain } from './explain.ts';
import { operation } from './operation.ts';
import type { RunOptions } from './process.ts';
import type { Repo } from './repo.ts';

export const CONFLICT = /CONFLICT|Resolve all conflicts|could not apply|after resolving the conflicts|fix conflicts and then commit|Merge conflict in/;

/** Runs something that may stop with conflicts: that's an outcome, not a failure. */
export async function conflicted(repo: Repo, args: string[], o: RunOptions = {}): Promise<Outcome> {
  const out = await repo.exec(args, o);
  const stdout = out.stdout.toString('utf8');
  if (out.code === 0) {
    const message = /Already up to date/i.test(stdout) ? 'Already up to date.' : undefined;
    return message ? { conflicts: false, message } : { conflicts: false };
  }
  if (CONFLICT.test(`${stdout}\n${out.stderr}`) && (await operationOrUnmerged(repo))) {
    return { conflicts: true, message: 'There are conflicts to resolve.' };
  }
  throw new PluginError(explain(out.stderr, stdout));
}

export async function operationOrUnmerged(repo: Repo): Promise<boolean> {
  if (await operation(repo.gitDir)) return true;
  const out = await repo.exec(['ls-files', '-u', '-z']);
  return out.stdout.length > 0;
}
