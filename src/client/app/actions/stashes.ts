// Stashing what's changed now (from the dialog), and what can be done with
// a stash: apply, pop, drop.

import type { MenuEntry } from '@hyperpane/ui';
import type { Stash } from '../../../shared/index.ts';
import type { Repo } from '../repo.ts';

export async function stashNow(repo: Repo) {
  if (!repo.status.files.length) {
    repo.toast('There are no changes to stash.');
    return;
  }
  const result = await repo.host.ui.dialog<{ message: string; untracked: boolean; keepIndex: boolean }>('stash', {
    title: 'Stash changes',
    data: { count: repo.status.files.length, untracked: repo.status.files.filter((f) => f.untracked).length },
    width: 440,
    height: 216,
  });
  if (result) repo.run(() => repo.api.stashPush({ message: result.message || undefined, untracked: result.untracked, keepIndex: result.keepIndex || undefined }), { done: 'Stashed.' });
}

export function stashActions(repo: Repo, s: Stash): MenuEntry[] {
  const name = `stash@{${s.index}}`;
  return [
    { label: 'Apply', run: async () => repo.outcome(await repo.run(() => repo.api.stashApply(s.index, false), { done: `Applied ${name}.` }), 'Applying the stash') },
    { label: 'Pop', run: async () => repo.outcome(await repo.run(() => repo.api.stashApply(s.index, true), { done: `Popped ${name}.` }), 'Popping the stash') },
    {
      label: 'Drop…',
      danger: true,
      run: async () => {
        const ok = await repo.confirm(`Drop ${name}?`, `“${s.message}” goes for good (git keeps it unreachable for a while, but nothing here can bring it back).`, { confirm: 'Drop', destructive: true });
        if (ok) repo.run(() => repo.api.stashDrop(s.index), { done: `Dropped ${name}.` });
      },
    },
  ];
}
