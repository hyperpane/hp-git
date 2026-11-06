// A commit's menu, wherever a commit is listed (the history, a compare, a
// file's history): check it out, branch or tag it, cherry-pick, revert or
// reset to it, compare it with the working tree, copy it.

import { menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Commit } from '../../../shared/index.ts';
import { copy } from '../../lib/clipboard.ts';
import { shortSha } from '../../lib/format.ts';
import type { Repo } from '../repo.ts';

/** A commit's menu: everything it can do. */
export function commitMenu(repo: Repo, c: Commit, e: { clientX: number; clientY: number }) {
  const { api, status } = repo;
  const sha = shortSha(c.sha);
  const isHead = c.sha === status.head;
  const items: (MenuEntry | null)[] = [
    {
      label: 'Check Out This Commit…',
      disabled: isHead && status.detached,
      run: async () => {
        const ok = await repo.confirm(
          `Check out ${sha}?`,
          'You’ll be on no branch (a detached HEAD): new commits there belong to no branch until you make one. Your changes come along if they don’t conflict.',
          { confirm: 'Check Out' },
        );
        if (ok) repo.run(() => api.checkout(c.sha, { detach: true }));
      },
    },
    {
      label: 'Create Branch Here…',
      run: async () => {
        const result = await repo.host.ui.dialog<{ name: string; checkout: boolean }>('branch', {
          title: 'Create a branch',
          data: { from: c.sha, fromLabel: `${sha} ${c.subject}`, checkout: true },
          width: 440,
          height: 200,
        });
        if (result) repo.run(() => api.branch('create', { name: result.name, from: c.sha, checkout: result.checkout }), { done: `Created ${result.name}.` });
      },
    },
    {
      label: 'Create Tag Here…',
      run: async () => {
        const result = await repo.host.ui.dialog<{ name: string; message: string }>('tag', { title: `Tag ${sha}`, data: { sha: c.sha }, width: 440, height: 240 });
        if (result) repo.run(() => api.tagCreate(result.name, c.sha, result.message), { done: `Tagged ${sha} ${result.name}.` });
      },
    },
    null,
    {
      label: 'Cherry-Pick onto This Branch',
      disabled: isHead,
      run: async () => repo.outcome(await repo.run(() => api.cherryPick(c.sha)), 'Cherry-picking'),
    },
    {
      label: 'Revert This Commit',
      run: async () => repo.outcome(await repo.run(() => api.revert(c.sha)), 'Reverting'),
    },
    {
      label: 'Reset to This Commit…',
      disabled: isHead,
      run: () => resetTo(repo, c, e),
    },
    null,
    { label: 'Compare with Working Tree', run: () => repo.open({ kind: 'compare', base: c.sha, head: '' }) },
    { label: 'Copy SHA', run: () => copy(c.sha, repo.toast) },
    { label: 'Copy Short SHA', run: () => copy(sha, repo.toast) },
    { label: 'Copy Subject', run: () => copy(c.subject, repo.toast) },
  ];
  repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
    const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
    if (item && !item.disabled) item.run();
  });
}

async function resetTo(repo: Repo, c: Commit, at: { clientX: number; clientY: number }) {
  const sha = shortSha(c.sha);
  const modes: (MenuEntry | null)[] = [
    { label: 'Soft: keep the changes staged', run: () => repo.run(() => repo.api.reset(c.sha, 'soft'), { done: `Reset to ${sha} (soft).` }) },
    { label: 'Mixed: keep the changes, unstaged', run: () => repo.run(() => repo.api.reset(c.sha, 'mixed'), { done: `Reset to ${sha}.` }) },
    {
      label: 'Hard: discard every change…',
      danger: true,
      run: async () => {
        const ok = await repo.confirm(
          `Reset hard to ${sha}?`,
          `${repo.status.branch ?? 'HEAD'} moves to ${sha} and every uncommitted change is discarded. Commits after it stay reachable only from the reflog.`,
          { confirm: 'Reset Hard', destructive: true },
        );
        if (ok) repo.run(() => repo.api.reset(c.sha, 'hard'), { done: `Reset hard to ${sha}.` });
      },
    },
  ];
  const id = await repo.host.ui.menu({ x: at.clientX, y: at.clientY }, menuItems(modes));
  const item = id !== null && /^\d+$/.test(id) ? modes[Number(id)] : null;
  item?.run();
}
