// The repository's tags, read again on every change while they're shown.

import { useEffect, useState } from 'react';
import type { Tag } from '../../shared/index.ts';
import type { Repo } from '../app/repo.ts';

export function useTags(repo: Repo, enabled: boolean) {
  const [state, setState] = useState<{ tags: Tag[] | null; error: string | null }>({ tags: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    repo.api.tags().then(
      (tags) => live && setState({ tags, error: null }),
      (e: Error) => live && setState((s) => ({ ...s, error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [repo.api, repo.version, enabled]);
  return state;
}
