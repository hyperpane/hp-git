// The Changes list's menus: a file's or a folder's (check or stage it,
// discard, stash, ignore, its history, copy, open), and the list's own ⋯
// (stash all, ignore a pattern, check or stage everything or nothing,
// discard everything).

import type { MenuEntry } from '@hyperpane/ui';
import type { FileStatus } from '../../../shared/index.ts';
import type { FileActions } from '../../app/actions/files.ts';
import { stashNow } from '../../app/actions/stashes.ts';
import type { Repo } from '../../app/repo.ts';
import type { Item } from '../../lib/changeRows.ts';
import { copy } from '../../lib/clipboard.ts';
import { plural } from '../../lib/format.ts';
import { basenameOf, dirnameOf, extOf, ignoreExact } from '../../lib/paths.ts';
import type { Side } from '../../lib/picks.ts';

/** The menu of a file (or the files picked with it) or a folder. */
export function fileMenu(repo: Repo, it: Exclude<Item, { t: 'section' }>, chosen: { side: Side; file: FileStatus }[], actions: FileActions): (MenuEntry | null)[] {
  const { api } = repo;
  const { stage, unstage, check, allChecked, discard, stashFiles } = actions;
  const files = chosen.map((c) => c.file);
  const one = it.t === 'file' && chosen.length === 1 ? chosen[0].file : null;
  const changes = chosen.filter((c) => c.side === 'changes').map((c) => c.file);
  const unstaged = chosen.filter((c) => c.side !== 'staged' && c.side !== 'changes').map((c) => c.file);
  const staged = chosen.filter((c) => c.side === 'staged').map((c) => c.file);
  const ext = one ? extOf(one.path) : '';
  const n = (what: string) => (changes.length > 1 ? `${what} ${plural(changes.length, 'File')}` : what);
  return [
    ...(changes.length && !changes.every((f) => allChecked([f])) ? [{ label: n('Include'), run: () => check(changes, true) }] : []),
    ...(changes.length && changes.some((f) => repo.choices[f.path] !== 'out') ? [{ label: n('Leave Out'), run: () => check(changes, false) }] : []),
    ...(unstaged.length ? [{ label: unstaged.length > 1 ? `Stage ${plural(unstaged.length, 'File')}` : chosen[0].side === 'conflict' ? 'Mark as Resolved' : 'Stage', run: () => stage(unstaged) }] : []),
    ...(staged.length ? [{ label: staged.length > 1 ? `Unstage ${plural(staged.length, 'File')}` : 'Unstage', run: () => unstage(staged) }] : []),
    { label: files.length > 1 ? `Discard Changes to ${plural(files.length, 'File')}…` : 'Discard Changes…', danger: true, run: () => discard(files) },
    { label: files.length > 1 ? `Stash ${plural(files.length, 'File')}…` : 'Stash This File…', run: () => stashFiles(files) },
    null,
    ...(one && one.untracked
      ? [
          { label: `Ignore ${basenameOf(one.path)}`, run: () => repo.run(() => api.ignore(ignoreExact(one.path)), { done: `Ignoring ${one.path}.` }) },
          ...(ext ? [{ label: `Ignore All .${ext} Files`, run: () => repo.run(() => api.ignore(`*.${ext}`), { done: `Ignoring *.${ext}.` }) }] : []),
          ...(dirnameOf(one.path) ? [{ label: `Ignore the Folder ${dirnameOf(one.path)}`, run: () => repo.run(() => api.ignore(`/${dirnameOf(one.path)}/`), { done: `Ignoring ${dirnameOf(one.path)}/.` }) }] : []),
          null,
        ]
      : it.t === 'dir'
        ? [{ label: `Ignore the Folder ${it.path}`, run: () => repo.run(() => api.ignore(`/${it.path}/`), { done: `Ignoring ${it.path}/.` }) }, null]
        : []),
    ...(one && !one.untracked
      ? [
          { label: 'File History', run: () => repo.open({ kind: 'fileHistory', path: one.path }) },
          { label: 'Blame', run: () => repo.open({ kind: 'blame', path: one.path }) },
          null,
        ]
      : []),
    { label: 'Copy Path', run: () => copy(it.t === 'dir' ? it.path : files.map((f) => f.path).join('\n'), repo.toast) },
    ...(one ? [{ label: 'Open in Editor', disabled: one.worktree === 'D' || one.staged === 'D', run: () => repo.openInEditor(one.path) }] : []),
    { label: 'Reveal in Explorer', run: () => repo.reveal(it.t === 'dir' ? `${it.path}/x` : (one?.path ?? '')) },
    { label: 'Open Terminal Here', run: () => repo.terminal(it.t === 'dir' ? it.path : one ? dirnameOf(one.path) : undefined) },
  ];
}

/** The list's ⋯ menu. */
export function changesMenu(repo: Repo, groups: Record<Side, FileStatus[]>, actions: FileActions): (MenuEntry | null)[] {
  const { status, api } = repo;
  const { discard, allIn, allOut } = actions;
  const none = repo.including ? status.files.every((f) => repo.choices[f.path] === 'out') : !groups.staged.length;
  return [
    { label: 'Stash All Changes…', disabled: !status.files.length, run: () => stashNow(repo) },
    {
      label: 'Ignore a Pattern…',
      run: async () => {
        const pattern = await repo.prompt('Ignore files', 'A .gitignore pattern', '', '*.log, build/, /secrets.env');
        if (pattern?.trim()) repo.run(() => api.ignore(pattern.trim()), { done: `Ignoring ${pattern.trim()}.` });
      },
    },
    null,
    { label: repo.including ? 'Check Everything' : 'Stage Everything', disabled: !status.files.length, run: allIn },
    { label: repo.including ? 'Uncheck Everything' : 'Unstage Everything', disabled: none, run: allOut },
    null,
    { label: 'Discard All Changes…', danger: true, disabled: !status.files.length, run: () => discard(status.files.filter((f) => !f.conflict)) },
  ];
}
