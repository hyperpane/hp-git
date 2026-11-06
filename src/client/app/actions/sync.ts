// Syncing as the toolbar offers it: the one action that fits now (add a
// remote, publish, pull, push or fetch), and the rest in a menu (fetch
// every remote, force push, remotes added and removed).

import { ArrowDown, ArrowUp, CloudUpload, RefreshCw, type LucideIcon } from 'lucide-react';
import type { MenuEntry } from '@hyperpane/ui';
import { ago } from '../../lib/format.ts';
import type { Repo } from '../repo.ts';

/** What the sync button does now. */
export function syncChoice(repo: Repo): { label: string; sub: string; icon: LucideIcon; run?: () => void } {
  const s = repo.status;
  const fetched = s.fetched ? `Last fetched ${ago(s.fetched)}` : 'Never fetched';
  if (!s.remote)
    return {
      label: 'Add a remote',
      sub: 'To publish this repository',
      icon: CloudUpload,
      run: () => addRemote(repo),
    };
  if (s.unborn) return { label: `Fetch ${s.remote}`, sub: 'Commit first to publish', icon: RefreshCw, run: () => repo.startSync('fetch', {}, `Fetching ${s.remote}`) };
  if (s.detached) return { label: `Fetch ${s.remote}`, sub: fetched, icon: RefreshCw, run: () => repo.startSync('fetch', {}, `Fetching ${s.remote}`) };
  if (!s.upstream || s.upstreamGone)
    return { label: 'Publish branch', sub: `Push ${s.branch} to ${s.remote}`, icon: CloudUpload, run: () => repo.startSync('publish', {}, 'Publishing') };
  if (s.behind > 0)
    return {
      label: `Pull ${s.remote}`,
      sub: fetched,
      icon: ArrowDown,
      run: async () => repo.outcome(await repo.startSync('pull', {}, `Pulling ${s.remote}`), 'Pulling'),
    };
  if (s.ahead > 0) return { label: `Push ${s.remote}`, sub: fetched, icon: ArrowUp, run: () => repo.startSync('push', {}, `Pushing to ${s.remote}`) };
  return { label: `Fetch ${s.remote}`, sub: fetched, icon: RefreshCw, run: () => repo.startSync('fetch', {}, `Fetching ${s.remote}`) };
}

export async function addRemote(repo: Repo) {
  const result = await repo.host.ui.dialog<{ name: string; url: string }>('remote', {
    title: 'Add a remote',
    data: { name: repo.status.remotes.includes('origin') ? '' : 'origin' },
    width: 440,
    height: 200,
  });
  if (result) repo.run(() => repo.api.remote('add', result.name, { url: result.url }), { done: `Added the remote ${result.name}.` });
}

export function syncMenu(repo: Repo): (MenuEntry | null)[] {
  const s = repo.status;
  const busy = !!repo.sync;
  return [
    { label: `Fetch ${s.remote ?? ''}`.trim(), disabled: !s.remote || busy, run: () => repo.startSync('fetch', {}, `Fetching ${s.remote}`) },
    { label: 'Fetch Every Remote', disabled: s.remotes.length < 2 || busy, run: () => repo.startSync('fetch', { all: true }, 'Fetching every remote') },
    { label: 'Pull', disabled: !s.upstream || busy, run: async () => repo.outcome(await repo.startSync('pull', {}, `Pulling ${s.remote}`), 'Pulling') },
    { label: s.upstream ? 'Push' : 'Publish Branch', disabled: !s.remote || !s.branch || busy, run: () => repo.startSync(s.upstream ? 'push' : 'publish', {}, s.upstream ? 'Pushing' : 'Publishing') },
    {
      label: 'Force Push (with Lease)…',
      danger: true,
      disabled: !s.upstream || busy || s.detached,
      run: async () => {
        const ok = await repo.confirm(
          `Force push ${s.branch}?`,
          `Commits on ${s.upstream} that ${s.branch} doesn't have are overwritten. With the lease, it stops if someone pushed there since your last fetch.`,
          { confirm: 'Force Push', destructive: true },
        );
        if (ok) repo.startSync('push', { force: 'lease' }, 'Force pushing');
      },
    },
    null,
    { label: 'Add Remote…', run: () => addRemote(repo) },
    ...s.remotes.map((r) => ({
      label: `Remove Remote ${r}…`,
      danger: true,
      run: async () => {
        const ok = await repo.confirm(`Remove the remote ${r}?`, 'Its remote branches go from this repository. Nothing changes on the remote itself.', { confirm: 'Remove', destructive: true });
        if (ok) repo.run(() => repo.api.remote('remove', r), { done: `Removed ${r}.` });
      },
    })),
  ];
}
