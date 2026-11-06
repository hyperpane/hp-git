// The repository's branches, read again on every change while they're shown.

import { useEffect, useState } from 'react';
import type { Branches } from '../../shared/index.ts';
import type { Repo } from '../app/repo.ts';

/** The repository's branches, again on every change. */
export function useBranches(repo: Repo, enabled = true): { branches: Branches | null; error: string | null } {
  const [state, setState] = useState<{ branches: Branches | null; error: string | null }>({ branches: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    repo.api.branches().then(
      (branches) => live && setState({ branches, error: null }),
      (e: Error) => live && setState((s) => ({ ...s, error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [repo.api, repo.version, enabled]);
  return state;
}
