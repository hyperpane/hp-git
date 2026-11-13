// The right side of the Changes tab: the picked file's diff, a conflict to
// resolve, or what to do with several files.

import { useState } from 'react';
import { keys } from '@hyperpane/sdk/client';
import { NodeButton } from '@hyperpane/ui';
import { fileActions } from '../../app/actions/files.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import type { LineKey } from '../../lib/diff/model.ts';
import { plural } from '../../lib/format.ts';
import { type Pick, SIDES, type Side, sideFiles, splitPick } from '../../lib/picks.ts';
import { ConflictView } from '../conflict/ConflictView.tsx';
import { FileDiff } from './FileDiff.tsx';
import { NoChanges } from './NoChanges.tsx';

/** The right side of Changes: the picked file's diff (or a conflict, or
 * what to do with several). */
export function ChangesDetail({ picked }: { picked: Pick[] }) {
  const repo = useRepo();
  const { status } = repo;
  const [lines, setLines] = useState<LineKey[]>([]);
  void lines;
  if (picked.length > 1) {
    const { stage, unstage, check } = fileActions(repo);
    const chosen = picked.map(splitPick);
    const filesOf = (paths: string[]) => status.files.filter((f) => paths.includes(f.path));
    const unstaged = filesOf(chosen.filter(([s]) => s !== 'staged').map(([, p]) => p));
    const staged = filesOf(chosen.filter(([s]) => s === 'staged').map(([, p]) => p));
    if (repo.including) {
      const changes = filesOf(chosen.filter(([s]) => s === 'changes').map(([, p]) => p));
      return (
        <Blank
          title={plural(picked.length, 'file') + ' picked'}
          actions={
            changes.length > 0 && (
              <>
                <NodeButton onClick={() => check(changes, true)}>Include {changes.length}</NodeButton>
                <NodeButton onClick={() => check(changes, false)}>Leave Out {changes.length}</NodeButton>
              </>
            )
          }
        >
          Space checks or unchecks them for the commit; {keys('⌘⌫')} discards them.
        </Blank>
      );
    }
    return (
      <Blank
        title={plural(picked.length, 'file') + ' picked'}
        actions={
          <>
            {unstaged.length > 0 && <NodeButton onClick={() => stage(unstaged)}>Stage {unstaged.length}</NodeButton>}
            {staged.length > 0 && <NodeButton onClick={() => unstage(staged)}>Unstage {staged.length}</NodeButton>}
          </>
        }
      >
        Space stages or unstages them; {keys('⌘⌫')} discards them.
      </Blank>
    );
  }
  // Nothing picked (the list is folded away): the first file, as the list would.
  const first = (): [Side, string] => {
    const g = sideFiles(status.files, repo.including);
    const side = SIDES.find((x) => g[x].length);
    return side ? [side, g[side][0].path] : ['unstaged', ''];
  };
  const [side, path] = picked[0] ? splitPick(picked[0]) : first();
  const file = status.files.find((f) => f.path === path);
  if (!file) return <NoChanges />;
  if (side === 'conflict') return <ConflictView key={path} file={file} />;
  return <FileDiff key={`${side}:${path}`} side={side} file={file} onLines={setLines} />;
}
