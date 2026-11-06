// The state behind app/repo.ts's Repo: the status, live from the server's
// watch (started again when it ends); the lists loaded again on a change
// (here, in another window, in a terminal); changes run, with a toast when
// one fails; the sync under way, with its progress and questions; the tab
// and the views opened over it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Host, useEvent, useSetting } from '@hyperpane/sdk/client';
import type { Outcome, Status, SyncAction } from '../../shared/index.ts';
import { local } from '../lib/local.ts';
import { dirnameOf, inRepo } from '../lib/paths.ts';
import { gitApi } from './api.ts';
import { askCredentials } from './credentials.ts';
import type { Repo, Sync, Tab, View } from './repo.ts';

export function useRepoState(host: Host, root: string, server: string | undefined, windowId: number) {
  const api = useMemo(() => gitApi(host, root, server), [host, root, server]);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [sync, setSync] = useState<Sync | null>(null);
  const [tab, setTabState] = useState<Tab>(() => local.get<Tab>(`tab.${windowId}`, 'changes'));
  const [stack, setStack] = useState<{ views: View[]; at: number }>({ views: [], at: -1 });
  const [autoFetch] = useSetting<string>('autoFetch');
  void autoFetch;

  // The status, live; the watch starts again if it ends (the server went away).
  useEffect(() => {
    let cancel = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const start = () => {
      cancel = api.watch(
        (s) => {
          setStatus(s);
          setError(null);
        },
        (e) => {
          if (stopped) return;
          if (e) setError(e);
          retry = setTimeout(start, 3000);
        },
      );
    };
    start();
    return () => {
      stopped = true;
      cancel();
      clearTimeout(retry);
    };
  }, [api]);

  // Another window (or a terminal) changed it: the lists load again.
  const rootRef = useRef(root);
  rootRef.current = root;
  useEvent<{ repo: string }>('git.changed', (e) => {
    if (e.data?.repo === rootRef.current) bump();
  });

  // A new HEAD, branch or upstream position: the lists load again.
  const refsKey = status ? `${status.head}|${status.branch}|${status.ahead}|${status.behind}|${status.fetched}|${status.stashes}|${status.operation?.kind}` : '';
  const seenRefs = useRef(refsKey);
  useEffect(() => {
    if (seenRefs.current === refsKey) return;
    seenRefs.current = refsKey;
    bump();
  }, [refsKey, bump]);

  const toast = useCallback((message: string, o?: { description?: string; error?: boolean }) => host.app.toast(message, o), [host]);

  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      local.set(`tab.${windowId}`, t);
      setStack((s) => (s.at >= 0 ? { views: s.views, at: -1 } : s));
    },
    [windowId],
  );

  const outcome = useCallback(
    (o: Outcome | undefined | null, what: string) => {
      if (!o) return;
      if (o.conflicts) {
        toast(`${what} stopped at conflicts.`, { description: 'Resolve them in Changes, then continue.' });
        setTab('changes');
      } else if (o.message) toast(o.message);
    },
    [toast, setTab],
  );

  const run = useCallback(
    async <T,>(change: () => Promise<T>, o: { done?: string; failed?: string } = {}): Promise<T | undefined> => {
      try {
        const result = await change();
        if (o.done) toast(o.done);
        return result;
      } catch (e) {
        const message = (e as Error).message;
        if (o.failed) toast(o.failed, { description: message, error: true });
        else toast(message, { error: true });
        return undefined;
      } finally {
        bump();
      }
    },
    [toast, bump],
  );

  const syncRef = useRef<Sync | null>(null);
  syncRef.current = sync;
  const startSync = useCallback(
    (action: SyncAction, args: Record<string, unknown> = {}, label?: string) =>
      new Promise<Outcome | null>((resolve) => {
        if (syncRef.current) {
          resolve(null);
          return;
        }
        let result: Outcome | null = null;
        let over = false;
        const finish = (error?: string) => {
          if (over) return;
          over = true;
          syncRef.current = null;
          setSync(null);
          bump();
          if (error && error !== 'Cancelled.') toast(error, { error: true });
          resolve(result);
        };
        const shown: Sync = {
          action,
          label: label ?? action,
          phase: '',
          percent: null,
          text: '',
          // Dropping the subscription stops git; nothing more comes.
          cancel: () => {
            cancel();
            finish();
          },
        };
        syncRef.current = shown;
        setSync(shown);
        const cancel = api.sync(
          action,
          args,
          (e) => {
            if (e.type === 'progress') setSync((s) => (s ? { ...s, phase: e.phase, percent: e.percent ?? null, text: e.text } : s));
            else if (e.type === 'prompt') askCredentials(host, e, api.answer);
            else if (e.type === 'done') result = e.result;
          },
          finish,
        );
      }),
    [api, host, toast, bump],
  );

  const open = useCallback((v: View) => setStack((s) => ({ views: [...s.views.slice(0, s.at + 1), v], at: s.at + 1 })), []);
  const back = useCallback(() => setStack((s) => (s.at >= 0 ? { ...s, at: s.at - 1 } : s)), []);
  const forward = useCallback(() => setStack((s) => (s.at < s.views.length - 1 ? { ...s, at: s.at + 1 } : s)), []);

  const repo: Repo | null = useMemo(
    () =>
      status && {
        host,
        api,
        root,
        server,
        status,
        version,
        bump,
        run,
        outcome,
        confirm: (title, message, o = {}) => host.ui.confirm({ title, message, confirm: o.confirm, destructive: o.destructive }),
        prompt: (title, label, value, placeholder) => host.ui.prompt({ title, label, value, placeholder }),
        sync,
        startSync,
        tab,
        setTab,
        view: stack.at >= 0 ? stack.views[stack.at] : null,
        open,
        back,
        forward,
        canBack: stack.at >= 0,
        canForward: stack.at < stack.views.length - 1,
        openInEditor: (path, line) => host.app.openFile(inRepo(root, path), { line, server }),
        reveal: (path) => {
          const folder = path ? inRepo(root, dirnameOf(path)).replace(/\/$/, '') : root;
          host.app.newNode('explorer', '', { data: { folder }, server }).catch((e: Error) => toast(e.message, { error: true }));
        },
        terminal: (path) => {
          const folder = path ? inRepo(root, path) : root;
          host.app.newNode('terminal', '', { state: { folder }, server }).catch((e: Error) => toast(e.message, { error: true }));
        },
        toast,
      },
    [host, api, root, server, status, version, bump, run, outcome, sync, startSync, tab, setTab, stack, open, back, forward, toast],
  );

  return { repo, error, api };
}
