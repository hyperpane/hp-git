// A repository's remotes: their names and which one each branch tracks
// (one read of the config), the remote sync goes to by default, and the
// remote a remote branch (`origin/x`) is on.

import type { Repo } from './repo.ts';

/** The remotes, and which remote each branch tracks, from one read of the
 * config. */
export interface Remotes {
  names: string[];
  branches: Map<string, string>;
  pushDefault: string | null;
}

export async function readRemotes(repo: Repo): Promise<Remotes> {
  const remotes: Remotes = { names: [], branches: new Map(), pushDefault: null };
  const out = await repo.exec(['config', '-z', '--get-regexp', String.raw`^(remote\..+\.url|branch\..+\.remote|remote\.pushdefault)$`]);
  if (out.code !== 0) return remotes;
  for (const entry of out.stdout.toString('utf8').split('\0')) {
    if (!entry) continue;
    const nl = entry.indexOf('\n');
    const key = nl < 0 ? entry : entry.slice(0, nl);
    const value = nl < 0 ? '' : entry.slice(nl + 1);
    const lower = key.toLowerCase();
    if (lower === 'remote.pushdefault') remotes.pushDefault = value;
    else if (lower.startsWith('remote.') && lower.endsWith('.url')) {
      const name = key.slice(7, -4);
      if (!remotes.names.includes(name)) remotes.names.push(name);
    } else if (lower.startsWith('branch.') && lower.endsWith('.remote')) remotes.branches.set(key.slice(7, -7), value);
  }
  return remotes;
}

/** Where sync goes from `branch`: its upstream's remote, else the push
 * default, else `origin`, else the only one. */
export function defaultRemote(remotes: Remotes, branch: string | null): string | null {
  if (branch) {
    const r = remotes.branches.get(branch);
    if (r && r !== '.') return r;
  }
  if (remotes.pushDefault) return remotes.pushDefault;
  if (remotes.names.includes('origin')) return 'origin';
  return remotes.names.length === 1 ? remotes.names[0] : null;
}

/** The remote a remote branch (`origin/x`) is on, and the branch: the
 * longest remote name that prefixes it. */
export async function splitRemote(repo: Repo, name: string): Promise<{ remote: string; branch: string } | null> {
  const remotes = (await repo.text(['remote'])).split('\n').filter(Boolean);
  const on = remotes.filter((r) => name.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0];
  return on ? { remote: on, branch: name.slice(on.length + 1) } : null;
}
