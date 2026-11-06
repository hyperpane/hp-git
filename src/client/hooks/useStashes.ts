// The repository's stashes, read again on every change while they're shown.

import { useEffect, useState } from 'react';
import type { Stash } from '../../shared/index.ts';
import type { Repo } from '../app/repo.ts';

export function useStashes(repo: Repo, enabled: boolean) {
  const [state, setState] = useState<{ stashes: Stash[] | null; error: string | null }>({ stashes: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    repo.api.stashes().then(
      (stashes) => live && setState({ stashes, error: null }),
      (e: Error) => live && setState((s) => ({ ...s, error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [repo.api, repo.version, enabled]);
  return state;
}
