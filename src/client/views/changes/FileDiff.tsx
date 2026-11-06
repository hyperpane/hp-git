// A changed file's diff in the Changes tab: its lines and hunks staged,
// unstaged or discarded one by one, the whole file staged or unstaged.

import { useMemo } from 'react';
import { NodeButton } from '@hyperpane/ui';
import type { Diff, FileStatus } from '../../../shared/index.ts';
import { discardPatch, stagePatch, unstagePatch } from '../../../shared/patch.ts';
import { useRepo } from '../../app/repo.ts';
import { DiffPane } from '../../components/diff/DiffPane.tsx';
import type { LineActions } from '../../components/diff/DiffView.tsx';
import type { LineKey } from '../../lib/diff/model.ts';
import { plural } from '../../lib/format.ts';
import { basenameOf } from '../../lib/paths.ts';
import type { Side } from '../../lib/picks.ts';

export function FileDiff({ side, file, onLines }: { side: Side; file: FileStatus; onLines(k: LineKey[]): void }) {
  const repo = useRepo();
  const { api } = repo;
  const request = useMemo(
    () => ({ path: file.path, oldPath: side === 'staged' ? file.from : undefined, staged: side === 'staged' || undefined, untracked: side === 'untracked' || undefined }),
    [file.path, file.from, side],
  );
  const stamp = `${file.staged}|${file.worktree}|${file.mtime}`;
  const actions = useMemo(
    () =>
      (diff: Diff): LineActions | undefined => {
        const apply = async (patch: string | null, o: { cached?: boolean; reverse?: boolean }) => {
          if (!patch) return;
          await repo.run(() => api.apply(patch, o));
        };
        if (side === 'staged') return { primary: { label: 'Unstage', run: (keys) => apply(unstagePatch(diff, new Set(keys)), { cached: true, reverse: true }) } };
        return {
          primary: { label: 'Stage', run: (keys) => apply(stagePatch(diff, new Set(keys)), { cached: true }) },
          discard: {
            label: 'Discard',
            run: async (keys) => {
              const ok = await repo.confirm(
                `Discard ${plural(keys.length, 'line')} in ${basenameOf(file.path)}?`,
                'Those changes go from the working copy. The file as it is now goes to the Trash first, so it can be put back.',
                { confirm: 'Discard', destructive: true },
              );
              if (ok) await apply(discardPatch(diff, new Set(keys)), { reverse: true });
            },
          },
        };
      },
    [side, file.path, api, repo],
  );
  const tools =
    side === 'staged' ? (
      <NodeButton onClick={() => repo.run(() => api.unstage([file.path]))}>Unstage File</NodeButton>
    ) : (
      <>
        <NodeButton onClick={() => repo.run(() => api.stage([file.path]))}>Stage File</NodeButton>
      </>
    );
  return (
    <DiffPane
      request={request}
      stamp={stamp}
      newRev={side === 'staged' ? ':0' : undefined}
      actions={actions}
      tools={tools}
      onSelection={onLines}
      menu={
        side === 'staged'
          ? []
          : [
              {
                label: 'Discard Changes to the File…',
                danger: true,
                run: async () => {
                  const ok = await repo.confirm(`Discard the changes to ${basenameOf(file.path)}?`, 'The working copy goes to the Trash first, so it can be put back.', { confirm: 'Discard', destructive: true });
                  if (ok) repo.run(() => api.discard([file.path]));
                },
              },
            ]
      }
    />
  );
}
