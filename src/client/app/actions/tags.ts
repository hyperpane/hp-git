// Making a tag (from the dialog), and what can be done with one: push it,
// check it out, copy its name, delete it here or on the remote.

import type { MenuEntry } from '@hyperpane/ui';
import type { Tag } from '../../../shared/index.ts';
import { copy } from '../../lib/clipboard.ts';
import { shortSha } from '../../lib/format.ts';
import type { Repo } from '../repo.ts';

export async function createTag(repo: Repo, sha?: string) {
  const result = await repo.host.ui.dialog<{ name: string; message: string }>('tag', {
    title: sha ? `Tag ${shortSha(sha)}` : 'Tag the current commit',
    data: { sha: sha ?? repo.status.head },
    width: 440,
    height: 240,
  });
  if (result) repo.run(() => repo.api.tagCreate(result.name, sha, result.message), { done: `Created the tag ${result.name}.` });
}

export function tagActions(repo: Repo, t: Tag): MenuEntry[] {
  const remote = repo.status.remote;
  return [
    { label: `Push to ${remote ?? 'the remote'}`, disabled: !remote, run: () => repo.startSync('pushTag', { name: t.name }, `Pushing ${t.name}`) },
    { label: 'Check Out…', run: async () => (await repo.confirm(`Check out ${t.name}?`, 'You’ll be on no branch (a detached HEAD) at the tagged commit.', { confirm: 'Check Out' })) && repo.run(() => repo.api.checkout(t.name, { detach: true })) },
    { label: 'Copy Name', run: () => copy(t.name, repo.toast) },
    {
      label: 'Delete…',
      danger: true,
      run: async () => {
        const ok = await repo.confirm(`Delete the tag ${t.name}?`, 'It goes from this repository. A copy pushed to the remote stays there until deleted on the remote too.', { confirm: 'Delete', destructive: true });
        if (ok) repo.run(() => repo.api.tagDelete(t.name), { done: `Deleted ${t.name}.` });
      },
    },
    {
      label: 'Delete on the Remote…',
      danger: true,
      disabled: !remote,
      run: async () => {
        const ok = await repo.confirm(`Delete ${t.name} on ${remote}?`, 'The tag goes from the remote for everyone.', { confirm: 'Delete', destructive: true });
        if (ok) repo.startSync('deleteRemoteTag', { name: t.name }, `Deleting ${t.name}`);
      },
    },
  ];
}
