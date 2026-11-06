// The history as it pages in (git stops once a page is full), the graph
// laid out as it comes; from the top again when the query or the
// repository changes.

import { useEffect, useRef, useState } from 'react';
import type { Commit } from '../../shared/index.ts';
import type { LogRequest } from '../app/api.ts';
import type { Repo } from '../app/repo.ts';
import { Graph } from '../lib/graph.ts';

export const PAGE = 300;

export interface HistoryState {
  commits: Commit[];
  graph: Graph;
  more: boolean;
  loading: boolean;
  error: string | null;
  loadMore(): void;
}

/** The log as it pages in, for a query; again when the repository changes. */
export function useLog(repo: Repo, query: Omit<LogRequest, 'skip' | 'limit'>, graphed: boolean): HistoryState {
  const { api } = repo;
  const key = JSON.stringify(query);
  const [state, setState] = useState<{ commits: Commit[]; graph: Graph; more: boolean; loading: boolean; error: string | null; key: string }>(() => ({
    commits: [],
    graph: new Graph(),
    more: true,
    loading: true,
    error: null,
    key: '',
  }));
  const latest = useRef(state);
  latest.current = state;
  const pending = useRef<{ cancel(): void } | null>(null);
  const loadPage = (skip: number, fresh: boolean) => {
    pending.current?.cancel();
    const p = api.log({ ...query, skip, limit: PAGE });
    pending.current = p;
    setState((s) => ({ ...s, loading: true }));
    p.promise.then(
      (page) => {
        pending.current = null;
        const s = latest.current;
        if (!fresh && s.key !== key) return;
        // Fresh: a new graph; else the one there is carries on.
        const graph = fresh ? new Graph() : s.graph;
        if (graphed) graph.add(page.commits);
        setState({ commits: fresh ? page.commits : [...s.commits, ...page.commits], graph, more: page.more, loading: false, error: null, key });
      },
      (e: Error) => {
        if (e.message === 'Cancelled.') return;
        setState((s) => ({ ...s, loading: false, error: e.message, more: false }));
      },
    );
  };
  // From the top when the query or the repository changes; the rows there
  // stay until the new ones come, so nothing flickers.
  useEffect(() => {
    loadPage(0, true);
    return () => pending.current?.cancel();
  }, [key, repo.version, api]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    commits: state.commits,
    graph: state.graph,
    more: state.more,
    loading: state.loading,
    error: state.error,
    loadMore: () => {
      const s = latest.current;
      if (!s.loading && s.more && s.key === key) loadPage(s.commits.length, false);
    },
  };
}
