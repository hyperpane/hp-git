// No local changes: what's next, as GitHub Desktop suggests it.

import { CheckCheck } from '@hyperpane/icons';
import { useRepo } from '../../app/repo.ts';
import { Button } from '../../ui/parts.tsx';
import { Blank } from '../../components/Blank.tsx';
import { plural } from '../../lib/format.ts';

export function NoChanges() {
  const repo = useRepo();
  const { status } = repo;
  const next =
    status.behind > 0
      ? { label: `Pull ${plural(status.behind, 'commit')}`, run: () => repo.startSync('pull', {}, 'Pulling') }
      : status.ahead > 0
        ? { label: `Push ${plural(status.ahead, 'commit')}`, run: () => repo.startSync('push', {}, 'Pushing') }
        : status.branch && !status.upstream && status.remote
          ? { label: `Publish ${status.branch}`, run: () => repo.startSync('publish', {}, 'Publishing') }
          : null;
  return (
    <Blank
      icon={CheckCheck}
      title="No local changes"
      actions={
        <>
          {next && (
            <Button variant="primary" disabled={!!repo.sync} onClick={next.run}>
              {next.label}
            </Button>
          )}
          <Button onClick={() => repo.setTab('history')}>Show History</Button>
          <Button onClick={() => repo.terminal()}>Open Terminal</Button>
        </>
      }
    >
      There are no uncommitted changes in this repository{status.branch ? ` on ${status.branch}` : ''}.
      {status.ahead > 0 ? ` ${plural(status.ahead, 'commit')} to push` : ''}
      {status.behind > 0 ? ` ${plural(status.behind, 'commit')} to pull` : ''}
    </Blank>
  );
}
