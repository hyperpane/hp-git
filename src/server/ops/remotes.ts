// `remotes` and `remote`: the remotes with their URLs, and adding,
// removing, renaming one or setting its URL.

import { PluginError } from '@hyperpane/sdk/server';
import type { Repo } from '../lib/repo.ts';

export async function remotes(repo: Repo) {
  const list: { name: string; url: string; pushUrl?: string }[] = [];
  for (const line of (await repo.text(['remote', '-v'])).split('\n')) {
    const m = /^(\S+)\t(.*) \((fetch|push)\)$/.exec(line);
    if (!m) continue;
    const [, name, url, kind] = m;
    const r = list.find((x) => x.name === name);
    if (!r) list.push({ name, url });
    else if (kind === 'push' && r.url !== url) r.pushUrl = url;
  }
  return list;
}

export async function remoteAction(repo: Repo, r: { action: unknown; name?: unknown; url?: unknown; to?: unknown }) {
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || /\s/.test(name) || name.startsWith('-')) throw new PluginError('A remote needs a name with no spaces.');
  const url = typeof r.url === 'string' ? r.url.trim() : '';
  switch (r.action) {
    case 'add':
      if (!url || url.startsWith('-')) throw new PluginError('A remote needs a URL.');
      await repo.run(['remote', 'add', name, url]);
      return;
    case 'remove':
      await repo.run(['remote', 'remove', name]);
      return;
    case 'rename': {
      const to = typeof r.to === 'string' ? r.to.trim() : '';
      if (!to || /\s/.test(to) || to.startsWith('-')) throw new PluginError('A remote needs a name with no spaces.');
      await repo.run(['remote', 'rename', name, to]);
      return;
    }
    case 'setUrl':
      if (!url || url.startsWith('-')) throw new PluginError('A remote needs a URL.');
      await repo.run(['remote', 'set-url', name, url]);
      return;
    default:
      throw new PluginError('Add, remove, rename a remote, or set its URL.');
  }
}
