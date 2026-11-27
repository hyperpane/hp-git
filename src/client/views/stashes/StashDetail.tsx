// The picked stash: its files and diffs (its untracked files too), and
// Apply, Pop and Drop.

import { Archive } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';
import type { Stash } from '../../../shared/index.ts';
import { stashActions } from '../../app/actions/stashes.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { ago } from '../../lib/format.ts';
import { header } from '../../ui/classes.ts';
import { Button } from '../../ui/parts.tsx';
import { CommitDetails } from '../commit/CommitDetails.tsx';

export function StashDetail({ stash }: { stash: Stash | null }) {
  const repo = useRepo();
  if (!stash)
    return (
      <Blank icon={Archive} title="No stash picked">
        Pick one to see what it put aside.
      </Blank>
    );
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
        <div className={cn(header.base, 'gap-2 ps-3.5 pe-2')}>
          <Archive className="size-4 flex-none text-[var(--git-stash)]" />
          <span className={header.title}>{ref}</span>
          <span className={cn(header.meta, 'flex-1')}>
            {stash.branch ? `on ${stash.branch} · ` : ''}
            {ago(stash.date)}
          </span>
          {actions.map((a) => (
            <Button key={a.label} onClick={a.run} variant={a.danger ? 'danger' : a.label === 'Pop' ? 'primary' : 'secondary'}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    />
  );
}
