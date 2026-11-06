// The picked stash: its files and diffs (its untracked files too), and
// Apply, Pop and Drop.

import { Archive } from 'lucide-react';
import { NodeButton } from '@hyperpane/ui';
import type { Stash } from '../../../shared/index.ts';
import { stashActions } from '../../app/actions/stashes.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { ago } from '../../lib/format.ts';
import { CommitDetails } from '../commit/CommitDetails.tsx';

export function StashDetail({ stash }: { stash: Stash | null }) {
  const repo = useRepo();
  if (!stash) return <Blank icon={Archive}>Pick a stash.</Blank>;
  const ref = `stash@{${stash.index}}`;
  const actions = stashActions(repo, stash);
  return (
    <CommitDetails
      key={stash.sha}
      id={`${stash.sha}:${stash.index}`}
      place="stash"
      load={() => repo.api.stashShow(stash.index)}
      diffOf={(f) => ({ path: f.path, oldPath: f.from, commit: f.untracked ? `${ref}^3` : ref })}
      rev={() => ref}
      top={() => (
        <div className="flex h-9 flex-none items-center gap-1.5 border-b border-[var(--node-border)] px-3">
          <Archive className="size-3.5 text-[var(--node-muted)]" />
          <span className="min-w-0 flex-1 truncate text-2xs text-[var(--node-muted)]">
            {ref}
            {stash.branch ? ` on ${stash.branch}` : ''} · {ago(stash.date)}
          </span>
          {actions.map((a) => (
            <NodeButton key={a.label} onClick={a.run} className={a.danger ? 'text-[var(--ansi-1)]' : undefined}>
              {a.label.replace(/…$/, '')}
            </NodeButton>
          ))}
        </div>
      )}
    />
  );
}
