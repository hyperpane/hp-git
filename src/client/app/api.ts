// The server part, as the window calls it (API.md): one function per op,
// typed by src/shared/. Reads that a new selection makes stale
// (diffs, commits, blame) go as subscriptions, so dropping one cancels it
// on the server and git stops.

import type { Host } from '@hyperpane/sdk/client';
import type {
  Author,
  Blame,
  BlobContent,
  Branches,
  ChangedFile,
  CommitDetail,
  Commit,
  Compare,
  Diff,
  FileCommit,
  Found,
  LogPage,
  Outcome,
  Remote,
  Stash,
  Status,
  SyncAction,
  SyncEvent,
  Tag,
} from '../../shared/index.ts';

export interface DiffRequest {
  path: string;
  oldPath?: string;
  staged?: boolean;
  head?: boolean;
  untracked?: boolean;
  commit?: string;
  from?: string;
  to?: string;
  context?: number;
  ignoreWhitespace?: boolean;
  full?: boolean;
}

export interface LogRequest {
  ref?: string;
  all?: boolean;
  path?: string;
  search?: string;
  author?: string;
  pickaxe?: { text: string; regex?: boolean };
  sha?: string;
  firstParent?: boolean;
  skip: number;
  limit: number;
}

/** A call that can be dropped: `cancel()` ends it on the server too. */
export interface Pending<T> {
  promise: Promise<T>;
  cancel(): void;
}

export class Cancelled extends Error {
  constructor() {
    super('Cancelled.');
  }
}

export type GitApi = ReturnType<typeof gitApi>;

/** Hosts whose server part has no `once` (an older one). */
const onceMissing = new WeakSet<Host>();

export function gitApi(host: Host, root: string, server?: string) {
  const o = server ? { server } : undefined;
  const call = <T>(op: string, args: object = {}) => host.call<T>('git', { op, repo: root, ...args }, o);
  /** A call that can be dropped: through the server's `once` subscription,
   * so dropping it stops git. A server without `once` gets a plain call
   * (whose late answer is ignored). */
  const pending = <T>(op: string, args: object): Pending<T> => {
    let done = false;
    let cancel = () => {};
    const request = { op, repo: root, ...args };
    const promise = new Promise<T>((resolve, reject) => {
      const plain = () =>
        host.call<T>('git', request, o).then(
          (v) => !done && ((done = true), resolve(v)),
          (e: Error) => !done && ((done = true), reject(e)),
        );
      if (onceMissing.has(host)) return void plain();
      cancel = host.subscribe<T>(
        'git',
        { op: 'once', repo: root, call: request },
        (value) => {
          if (done) return;
          done = true;
          resolve(value);
        },
        {
          ...o,
          resume: false,
          onEnd: (error) => {
            if (done) return;
            if (error && /no op .?once/i.test(error)) {
              onceMissing.add(host);
              return void plain();
            }
            done = true;
            reject(new Error(error ?? 'Git ended without an answer.'));
          },
        },
      );
    });
    return {
      promise,
      cancel: () => {
        if (done) return;
        done = true;
        cancel();
      },
    };
  };

  return {
    root,
    status: (stats = true) => call<Status>('status', { stats }),
    /** The status now and on every change. Returns the cancel. */
    watch: (onStatus: (s: Status) => void, onEnd: (error?: string) => void) =>
      host.subscribe<Status>('git', { op: 'watch', repo: root, stats: true }, onStatus, { ...o, onEnd }),

    diff: (r: DiffRequest) => pending<Diff>('diff', r),
    blob: (path: string, o2: { rev?: string; start?: number; count?: number; base64?: boolean } = {}) => call<BlobContent>('blob', { path, ...o2 }),
    apply: (patch: string, o2: { cached?: boolean; reverse?: boolean }) => call<null>('apply', { patch, ...o2 }),

    stage: (paths: string[] | 'all') => call<null>('stage', paths === 'all' ? { all: true } : { paths }),
    unstage: (paths: string[] | 'all') => call<null>('unstage', paths === 'all' ? { all: true } : { paths }),
    discard: (paths: string[]) => call<null>('discard', { paths }),
    ignore: (pattern: string) => call<null>('ignore', { pattern }),
    commit: (m: {
      summary: string;
      description?: string;
      amend?: boolean;
      signoff?: boolean;
      coAuthors?: { name: string; email: string }[];
      all?: boolean;
      allowEmpty?: boolean;
      /** Exactly these, whatever's staged (lib/include.ts's selection). */
      only?: { paths: string[]; patches: string[] };
    }) =>
      call<{ sha: string; summary: string }>('commit', m),
    undoCommit: () => call<{ summary: string; description: string }>('undoCommit'),
    authors: (limit?: number) => call<Author[]>('authors', { limit }),
    config: (c: { get?: string[]; set?: Record<string, string | null>; global?: boolean }) => call<{ values: Record<string, string | null> }>('config', c),

    log: (r: LogRequest) => pending<LogPage>('log', r),
    show: (sha: string) => pending<CommitDetail>('show', { sha }),
    compare: (base: string, head: string, limit?: number) => pending<Compare>('compare', { base, head, limit }),
    /** The files changed from `from` to `to` (the working tree without it). */
    changes: (from: string, to?: string) => pending<{ files: ChangedFile[]; truncated: boolean }>('changes', { from, to }),
    fileLog: (path: string, skip: number, limit: number) => pending<LogPage<FileCommit>>('fileLog', { path, skip, limit }),
    blame: (path: string, rev?: string) => pending<Blame>('blame', { path, rev }),

    branches: () => call<Branches>('branches'),
    checkout: (ref: string, o2: { create?: boolean; from?: string; detach?: boolean } = {}) => call<null>('checkout', { ref, ...o2 }),
    branch: (action: 'create' | 'rename' | 'delete' | 'setUpstream', args: Record<string, unknown>) => call<null>('branch', { action, ...args }),
    merge: (ref: string, o2: { ffOnly?: boolean; noFf?: boolean; squash?: boolean } = {}) => call<Outcome>('merge', { ref, ...o2 }),
    rebase: (onto: string) => call<Outcome>('rebase', { onto }),
    cherryPick: (sha: string) => call<Outcome>('cherryPick', { sha }),
    revert: (sha: string) => call<Outcome>('revert', { sha }),
    reset: (sha: string, mode: 'soft' | 'mixed' | 'hard') => call<null>('reset', { sha, mode }),
    operation: (action: 'continue' | 'abort' | 'skip') => call<Outcome>('operation', { action }),
    resolve: (path: string, side: 'ours' | 'theirs' | 'mark') => call<null>('resolve', { path, side }),
    /** Writes the merged text of a conflicted file (and marks it resolved). */
    resolveText: (path: string, text: string, mark: boolean) => call<null>('resolve', { path, side: 'text', text, mark: mark || undefined }),

    stashes: () => call<Stash[]>('stashes'),
    stashPush: (o2: { message?: string; untracked?: boolean; paths?: string[]; keepIndex?: boolean }) => call<null>('stash', { action: 'push', ...o2 }),
    stashApply: (index: number, pop: boolean) => call<Outcome>('stash', { action: pop ? 'pop' : 'apply', index }),
    stashDrop: (index: number) => call<null>('stash', { action: 'drop', index }),
    stashShow: (index: number) => pending<CommitDetail>('stash', { action: 'show', index }),

    tags: () => call<Tag[]>('tags'),
    tagCreate: (name: string, sha?: string, message?: string) => call<null>('tag', { action: 'create', name, sha, message: message || undefined }),
    tagDelete: (name: string) => call<null>('tag', { action: 'delete', name }),

    remotes: () => call<Remote[]>('remotes'),
    remote: (action: 'add' | 'remove' | 'rename' | 'setUrl', name: string, args: { url?: string; to?: string } = {}) => call<null>('remote', { action, name, ...args }),

    /** A sync's events (progress, prompts, done). Returns the cancel. */
    sync: (action: SyncAction, args: Record<string, unknown>, onEvent: (e: SyncEvent) => void, onEnd: (error?: string) => void) =>
      host.subscribe<SyncEvent>('git', { op: 'sync', repo: root, action, ...args }, onEvent, { ...o, resume: false, onEnd }),
    answer: (id: string, value: string | null) => call<null>('answer', { id, value }),
  };
}

/** Calls that need no repository yet. */
export function gitTools(host: Host, server?: string) {
  const o = server ? { server } : undefined;
  return {
    find: (path: string) => host.call<Found>('git', { op: 'find', path }, o),
    init: (path: string, branch?: string) => host.call<{ root: string }>('git', { op: 'init', path, branch: branch || undefined }, o),
    version: () => host.call<{ path: string | null; version: string | null }>('git', { op: 'version' }, o),
    clone: (url: string, into: string, onEvent: (e: SyncEvent) => void, onEnd: (error?: string) => void) =>
      host.subscribe<SyncEvent>('git', { op: 'clone', url, into }, onEvent, { ...o, resume: false, onEnd }),
    answer: (id: string, value: string | null) => host.call<null>('git', { op: 'answer', id, value }, o),
  };
}

export type { Commit };
