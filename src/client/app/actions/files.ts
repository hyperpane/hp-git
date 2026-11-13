// What the Changes list does with files: stage or unstage them (or the
// other way, by their section), or, when every change is checked for the
// next commit, check or uncheck them (nothing is staged until Commit:
// lib/include.ts); discard them (asking first; the working copies go to
// the Trash) and stash them.

import type { FileStatus } from '../../../shared/index.ts';
import { plural } from '../../lib/format.ts';
import { stateOf, withFiles } from '../../lib/include.ts';
import { basenameOf } from '../../lib/paths.ts';
import type { Side } from '../../lib/picks.ts';
import type { Repo } from '../repo.ts';

export type FileActions = ReturnType<typeof fileActions>;

export function fileActions(repo: Repo) {
  const { api } = repo;
  const paths = (files: FileStatus[]) => files.map((f) => f.path);
  const stage = (files: FileStatus[]) => repo.run(() => api.stage(paths(files)));
  const unstage = (files: FileStatus[]) => repo.run(() => api.unstage(paths(files)));
  /** In the next commit, whole (`on`), or left out. */
  const check = (files: FileStatus[], on: boolean) => repo.choose((c) => withFiles(c, paths(files.filter((f) => !f.conflict)), on));
  /** Whether these are all in, whole: a click then leaves them out. */
  const allChecked = (files: FileStatus[]) => files.every((f) => stateOf(repo.choices, f.path) === true);
  /** Everything in the next commit, or nothing. */
  const allIn = () => (repo.including ? check(repo.status.files, true) : repo.run(() => api.stage('all')));
  const allOut = () => (repo.including ? check(repo.status.files, false) : repo.run(() => api.unstage('all')));
  const toggle = (side: Side, files: FileStatus[]) => (side === 'changes' ? check(files, !allChecked(files)) : side === 'staged' ? unstage(files) : stage(files));
  const discard = async (files: FileStatus[]) => {
    if (!files.length) return;
    const one = files.length === 1;
    const ok = await repo.confirm(
      one ? `Discard the changes to ${basenameOf(files[0].path)}?` : `Discard the changes to ${plural(files.length, 'file')}?`,
      `${one ? 'Its' : 'Their'} staged and unstaged changes are discarded${files.some((f) => f.untracked) ? ' (new files are removed)' : ''}. The working ${one ? 'copy goes' : 'copies go'} to the Trash first, so ${one ? 'it' : 'they'} can be put back.`,
      { confirm: 'Discard', destructive: true },
    );
    if (ok) repo.run(() => api.discard(files.map((f) => f.path)));
  };

  const stashFiles = async (files: FileStatus[]) => {
    const message = await repo.prompt('Stash these changes', 'Message (optional)', '', 'What you were doing');
    if (message === null) return;
    repo.run(() => api.stashPush({ message: message || undefined, paths: files.map((f) => f.path), untracked: true }), { done: 'Stashed.' });
  };
  return { stage, unstage, check, allChecked, allIn, allOut, toggle, discard, stashFiles };
}
