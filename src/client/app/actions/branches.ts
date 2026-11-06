// What can be done with a branch, wherever one is listed: check it out,
// merge it in, rebase onto it, compare it, branch from it, rename it, set
// its upstream, push or publish it, delete it here or on the remote; and
// making one, from the dialog.

import type { MenuEntry } from '@hyperpane/ui';
import type { LocalBranch } from '../../../shared/index.ts';
import { branchName } from '../../lib/branchNames.ts';
import type { Repo } from '../repo.ts';

export type BranchPick = { kind: 'local'; name: string } | { kind: 'remote'; name: string };

/** Makes a branch, from the dialog: its name, where from, whether to switch. */
export async function createBranch(repo: Repo, from?: string, fromLabel?: string) {
  const result = await repo.host.ui.dialog<{ name: string; from: string; checkout: boolean }>('branch', {
    title: 'Create a branch',
    data: { from: from ?? '', fromLabel: fromLabel ?? (repo.status.branch ? `${repo.status.branch} (current)` : 'HEAD'), checkout: true, pickFrom: !from },
    width: 440,
    height: 230,
  });
  if (!result) return;
  repo.run(() => (result.checkout ? repo.api.checkout(result.name, { create: true, from: result.from || undefined }) : repo.api.branch('create', { name: result.name, from: result.from || undefined })), {
    done: result.checkout ? `Switched to the new branch ${result.name}.` : `Created ${result.name}.`,
  });
}

export function branchActions(repo: Repo, b: BranchPick, local?: LocalBranch): (MenuEntry | null)[] {
  const { api, status } = repo;
  const current = b.kind === 'local' && b.name === status.branch;
  const short = b.kind === 'remote' ? b.name.slice(b.name.indexOf('/') + 1) : b.name;
  const into = status.branch ?? 'HEAD';
  return [
    {
      label: b.kind === 'remote' ? `Check Out as ${short}` : 'Check Out',
      disabled: current,
      run: () => repo.run(() => api.checkout(b.name)),
    },
    {
      label: `Merge into ${into}…`,
      disabled: current,
      run: async () => {
        const ok = await repo.confirm(`Merge ${b.name} into ${into}?`, `Its commits join ${into}; conflicts, if any, stop it for you to resolve.`, { confirm: 'Merge' });
        if (ok) repo.outcome(await repo.run(() => api.merge(b.name)), 'Merging');
      },
    },
    {
      label: `Rebase ${into} onto ${b.name}…`,
      disabled: current || status.detached,
      run: async () => {
        const ok = await repo.confirm(
          `Rebase ${into} onto ${b.name}?`,
          `${into}'s own commits are made again on top of ${b.name}. If they were pushed, pushing again needs a force push.`,
          { confirm: 'Rebase' },
        );
        if (ok) repo.outcome(await repo.run(() => api.rebase(b.name)), 'Rebasing');
      },
    },
    { label: 'Compare with Current', disabled: current, run: () => repo.open({ kind: 'compare', base: status.branch ?? 'HEAD', head: b.name }) },
    { label: 'Create Branch from Here…', run: () => createBranch(repo, b.name, b.name) },
    null,
    ...(b.kind === 'local'
      ? [
          {
            label: 'Rename…',
            run: async () => {
              const to = await repo.prompt(`Rename ${b.name}`, 'New name', b.name);
              const name = to && branchName(to.trim());
              if (name && name !== b.name) repo.run(() => api.branch('rename', { name: b.name, to: name }), { done: `Renamed to ${name}.` });
            },
          },
          {
            label: local?.upstream ? `Upstream: ${local.upstream}…` : 'Set Upstream…',
            run: async () => {
              const to = await repo.prompt(`The upstream of ${b.name}`, 'Remote branch (empty: none)', local?.upstream ?? `${status.remote ?? 'origin'}/${b.name}`);
              if (to === null) return;
              repo.run(() => api.branch('setUpstream', { name: b.name, upstream: to.trim() || null }));
            },
          },
          ...(local?.upstream
            ? [{ label: `Push`, disabled: !current, run: () => repo.startSync('push', {}, 'Pushing') }]
            : [{ label: `Publish to ${status.remote ?? 'the remote'}`, disabled: !current || !status.remote, run: () => repo.startSync('publish', {}, 'Publishing') }]),
          null,
          {
            label: 'Delete…',
            danger: true,
            disabled: current,
            run: async () => {
              const unmerged = local && !local.merged;
              const ok = await repo.confirm(
                `Delete ${b.name}?`,
                unmerged ? `${b.name} isn't merged into ${into}: deleting it loses its commits (they stay in the reflog for a while).` : `It's merged into ${into}, so nothing is lost.`,
                { confirm: 'Delete', destructive: true },
              );
              if (!ok) return;
              try {
                await api.branch('delete', { name: b.name, force: unmerged || undefined });
                repo.toast(`Deleted ${b.name}.`);
              } catch (e) {
                // Not merged after all (HEAD moved since the list was read): ask again.
                if (unmerged || !/fully merged/i.test((e as Error).message)) return repo.toast((e as Error).message, { error: true });
                const sure = await repo.confirm(`${b.name} isn't merged into ${into}`, 'Deleting it loses its commits (they stay in the reflog for a while). Delete it anyway?', { confirm: 'Delete Anyway', destructive: true });
                if (sure) await repo.run(() => api.branch('delete', { name: b.name, force: true }), { done: `Deleted ${b.name}.` });
              } finally {
                repo.bump();
              }
            },
          },
        ]
      : [
          {
            label: `Delete ${b.name} on the Remote…`,
            danger: true,
            run: async () => {
              const ok = await repo.confirm(`Delete ${b.name} on the remote?`, `The branch goes from ${b.name.slice(0, b.name.indexOf('/'))} for everyone. Local branches stay.`, { confirm: 'Delete', destructive: true });
              if (ok) repo.startSync('deleteRemoteBranch', { name: b.name }, 'Deleting');
            },
          },
        ]),
  ];
}
