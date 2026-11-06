// `config`: the few settings of git's the window reads and writes (who
// commits, signing, pull, line endings, the default branch), for the
// repository or every one.

import { PluginError } from '@hyperpane/sdk/server';
import type { Repo } from '../lib/repo.ts';

export const CONFIG_KEYS = [
  'user.name',
  'user.email',
  'user.signingkey',
  'commit.gpgsign',
  'pull.rebase',
  'pull.ff',
  'push.autoSetupRemote',
  'core.autocrlf',
  'init.defaultBranch',
  'fetch.prune',
];

export async function config(repo: Repo, r: { get?: unknown; set?: unknown; global?: boolean }) {
  const known = (k: string) => CONFIG_KEYS.find((c) => c.toLowerCase() === k.toLowerCase());
  const keys = new Set<string>();
  if (r.set && typeof r.set === 'object') {
    for (const [k, v] of Object.entries(r.set as Record<string, unknown>)) {
      const key = known(k);
      if (!key) throw new PluginError(`Only ${CONFIG_KEYS.join(', ')} can be set here.`);
      const scope = r.global ? '--global' : '--local';
      if (v === null || v === undefined || v === '') {
        await repo.run(['config', scope, '--unset-all', key], { ok: [5] });
      } else {
        const value = String(v);
        if (/[\r\n]/.test(value)) throw new PluginError(`A value for ${key} is one line.`);
        await repo.run(['config', scope, key, value]);
      }
      keys.add(key);
    }
  }
  for (const k of Array.isArray(r.get) ? r.get : []) {
    const key = known(String(k));
    if (!key) throw new PluginError(`Only ${CONFIG_KEYS.join(', ')} can be read here.`);
    keys.add(key);
  }
  const values: Record<string, string | null> = {};
  for (const key of keys) values[key] = await repo.config(key);
  return { values };
}
