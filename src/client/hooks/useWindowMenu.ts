// The window's menu (the app's header): fetch, pull, push, refresh, and
// another folder.

import { useEffect, useRef } from 'react';
import type { Host } from '@hyperpane/sdk/client';
import type { Repo } from '../app/repo.ts';

export function useWindowMenu(host: Host, repo: Repo, onChooseFolder: () => void) {
  const actions = useRef(repo);
  actions.current = repo;
  useEffect(() => {
    host.win.setMenu([
      { id: 'fetch', label: 'Fetch' },
      { id: 'pull', label: 'Pull' },
      { id: 'push', label: 'Push' },
      { id: 'sep', label: '', separator: true },
      { id: 'refresh', label: 'Refresh' },
      { id: 'folder', label: 'Open Another Folder…' },
    ]);
    const off = host.on('menu', ({ id }: { id: string }) => {
      const r = actions.current;
      if (id === 'fetch') r.startSync('fetch', {}, 'Fetching');
      else if (id === 'pull') r.startSync('pull', {}, 'Pulling').then((o) => r.outcome(o, 'Pulling'));
      else if (id === 'push') r.startSync(r.status.upstream ? 'push' : 'publish', {}, 'Pushing');
      else if (id === 'refresh') r.bump();
      else if (id === 'folder') onChooseFolder();
    });
    return () => {
      off();
      host.win.setMenu([]);
    };
  }, [host]); // eslint-disable-line react-hooks/exhaustive-deps
}
