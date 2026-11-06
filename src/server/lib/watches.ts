// Watching repositories: one watcher per repository however many windows
// show it. File events (the git folder: index, HEAD, refs; the working
// tree) are debounced into one status, sent only when it differs from the
// last; a slow check catches what events miss. Status never writes the
// index (GIT_OPTIONAL_LOCKS=0), so it never sets the watch off itself.
// While a repository is watched it's fetched every `autoFetch` minutes.

import { type FSWatcher, watch as fsWatch } from 'node:fs';
import path from 'node:path';
import type { Status } from '../../shared/index.ts';
import type { Repo } from './repo.ts';
import { WIN } from './platform.ts';

/** After an event, how long to wait for the rest of the burst. */
export const SETTLE_MS = 150;
/** A burst that goes on is looked at after this at most. */
const MAX_WAIT_MS = 1000;
/** How often it looks without being told (more often where the working
 * tree can't be watched whole). */
const POLL_MS = process.platform === 'linux' ? 3000 : 10_000;

interface Listener {
  emit(s: Status): boolean;
  stats: boolean;
  last: string;
}

interface Entry {
  repo: Repo;
  listeners: Set<Listener>;
  watchers: FSWatcher[];
  settle: ReturnType<typeof setTimeout> | null;
  firstEvent: number;
  poll: ReturnType<typeof setInterval> | null;
  fetchTimer: ReturnType<typeof setInterval> | null;
  fetchEvery: number;
  fetchError?: string;
  running: Promise<void> | null;
  again: boolean;
  took: number;
  lastRun: number;
  last: Status | null;
  closed: boolean;
}

/** Git's files whose change is a change of status (relative to the git folder). */
function interesting(rel: string): boolean {
  const p = rel.split(path.sep).join('/');
  if (p.endsWith('.lock') || p.startsWith('objects/') || p.startsWith('logs/') || p.startsWith('hyperpane-discarded') || p.startsWith('modules/')) return false;
  return (
    p === 'index' ||
    p === 'HEAD' ||
    p === 'packed-refs' ||
    p === 'FETCH_HEAD' ||
    p === 'ORIG_HEAD' ||
    p === 'MERGE_HEAD' ||
    p === 'CHERRY_PICK_HEAD' ||
    p === 'REVERT_HEAD' ||
    p === 'config' ||
    p === 'refs' ||
    p.startsWith('refs/') ||
    p.startsWith('rebase-') ||
    p.startsWith('sequencer') ||
    p === 'info/exclude' ||
    p === ''
  );
}

export interface WatchHooks {
  status(repo: Repo, stats: boolean): Promise<Status>;
  /** A status differed from the last one (for the bus). */
  changed(repo: Repo, before: Status | null, now: Status): void;
  /** Minutes between automatic fetches (0: off). */
  fetchEvery(): Promise<number>;
  fetch(repo: Repo): Promise<void>;
  /** How long a minute is (tests make it shorter). */
  minute?: number;
  /** A repository is watched now (the first watch of it). */
  opened?(repo: Repo): void;
  log(...a: unknown[]): void;
}

export class Watches {
  #entries = new Map<string, Entry>();
  #hooks: WatchHooks;

  constructor(hooks: WatchHooks) {
    this.#hooks = hooks;
  }

  get size() {
    return this.#entries.size;
  }

  has(root: string) {
    return this.#entries.has(root);
  }

  /** Sends `emit` the status now and whenever it changes, until `signal` aborts. */
  async watch(repo: Repo, stats: boolean, emit: (s: Status) => boolean, signal: AbortSignal): Promise<void> {
    let entry = this.#entries.get(repo.root);
    const listener: Listener = { emit, stats, last: '' };
    // The first status for this one: rejects (ending the subscription) if
    // the repository can't be read.
    const first = await this.#hooks.status(repo, stats);
    if (entry?.fetchError) first.fetchError = entry.fetchError;
    listener.last = JSON.stringify(first);
    if (!emit(first) || signal.aborted) return;
    entry = this.#entries.get(repo.root);
    if (!entry) {
      entry = this.#open(repo);
      entry.last = first;
    }
    entry.listeners.add(listener);
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    entry.listeners.delete(listener);
    if (!entry.listeners.size) this.#close(entry);
  }

  /** Something changed it (this plugin did): look now. */
  poke(root: string): boolean {
    const entry = this.#entries.get(root);
    if (!entry) return false;
    this.#check(entry);
    return true;
  }

  /** Looks again at every watched repository's fetch timer (the setting changed). */
  async settingsChanged() {
    for (const entry of this.#entries.values()) await this.#scheduleFetch(entry);
  }

  closeAll() {
    for (const entry of [...this.#entries.values()]) this.#close(entry);
  }

  #open(repo: Repo): Entry {
    const entry: Entry = {
      repo,
      listeners: new Set(),
      watchers: [],
      settle: null,
      firstEvent: 0,
      poll: null,
      fetchTimer: null,
      fetchEvery: 0,
      running: null,
      again: false,
      took: 0,
      lastRun: Date.now(),
      last: null,
      closed: false,
    };
    this.#entries.set(repo.root, entry);
    const event = () => this.#event(entry);
    const gitInside = isInside(repo.gitDir, repo.root);
    // The working tree, whole where the system watches folders whole.
    const recursive = process.platform === 'darwin' || WIN;
    this.#fsWatch(entry, repo.root, recursive, (name) => {
      if (!name) return event();
      const rel = String(name);
      const gitRel = path.relative(repo.gitDir, path.join(repo.root, rel));
      if (gitInside && !gitRel.startsWith('..')) {
        if (interesting(gitRel)) event();
        return;
      }
      event();
    });
    if (!gitInside || !recursive) this.#fsWatch(entry, repo.gitDir, false, (name) => (!name || interesting(String(name))) && event());
    // Refs are few: watched whole on every system (Linux too, where Node watches each folder).
    if (!recursive || !gitInside) this.#fsWatch(entry, path.join(repo.commonDir, 'refs'), true, () => event());
    if (repo.commonDir !== repo.gitDir) this.#fsWatch(entry, repo.commonDir, false, (name) => (!name || interesting(String(name))) && event());
    entry.poll = setInterval(() => this.#check(entry), POLL_MS);
    entry.poll.unref?.();
    void this.#scheduleFetch(entry);
    this.#hooks.opened?.(repo);
    return entry;
  }

  #fsWatch(entry: Entry, dir: string, recursive: boolean, on: (name: string | Buffer | null) => void) {
    try {
      const w = fsWatch(dir, { recursive, persistent: false }, (_type, name) => on(name));
      w.on('error', () => {
        // A folder gone (a rebase's), or too many watches: the poll goes on.
      });
      entry.watchers.push(w);
    } catch (e) {
      this.#hooks.log(`couldn't watch ${dir}:`, (e as Error).message);
    }
  }

  #event(entry: Entry) {
    if (entry.closed) return;
    const now = Date.now();
    if (!entry.settle) entry.firstEvent = now;
    else clearTimeout(entry.settle);
    const wait = now - entry.firstEvent >= MAX_WAIT_MS ? 0 : SETTLE_MS;
    entry.settle = setTimeout(() => {
      entry.settle = null;
      this.#check(entry);
    }, wait);
  }

  /** One status at a time; one more after it if asked meanwhile. A slow
   * status is run less often: never more than one in three times what it takes. */
  #check(entry: Entry) {
    if (entry.closed) return;
    if (entry.running) {
      entry.again = true;
      return;
    }
    const gap = Math.max(0, entry.took * 3 - (Date.now() - entry.lastRun));
    entry.running = (async () => {
      if (gap > 0) await new Promise((r) => setTimeout(r, Math.min(gap, 5000)));
      if (entry.closed) return;
      const started = Date.now();
      let now: Status;
      try {
        now = await this.#hooks.status(entry.repo, [...entry.listeners].some((l) => l.stats));
      } catch (e) {
        this.#hooks.log('status failed:', (e as Error).message);
        return;
      } finally {
        entry.took = Date.now() - started;
        entry.lastRun = Date.now();
      }
      if (entry.fetchError) now.fetchError = entry.fetchError;
      const before = entry.last;
      entry.last = now;
      const text = JSON.stringify(now);
      if (before && JSON.stringify(before) !== text) this.#hooks.changed(entry.repo, before, now);
      for (const l of [...entry.listeners]) {
        if (l.last === text) continue;
        l.last = text;
        if (!l.emit(now)) entry.listeners.delete(l);
      }
    })().finally(() => {
      entry.running = null;
      if (entry.again) {
        entry.again = false;
        this.#check(entry);
      }
    });
  }

  async #scheduleFetch(entry: Entry) {
    const minutes = await this.#hooks.fetchEvery().catch(() => 0);
    if (entry.closed || minutes === entry.fetchEvery) return;
    entry.fetchEvery = minutes;
    if (entry.fetchTimer) clearInterval(entry.fetchTimer);
    entry.fetchTimer = null;
    if (!minutes) return;
    entry.fetchTimer = setInterval(() => {
      this.#hooks.fetch(entry.repo).then(
        () => {
          entry.fetchError = undefined;
          this.#check(entry);
        },
        (e) => {
          entry.fetchError = (e as Error).message;
          this.#check(entry);
        },
      );
    }, minutes * (this.#hooks.minute ?? 60_000));
    entry.fetchTimer.unref?.();
  }

  #close(entry: Entry) {
    entry.closed = true;
    for (const w of entry.watchers) w.close();
    if (entry.settle) clearTimeout(entry.settle);
    if (entry.poll) clearInterval(entry.poll);
    if (entry.fetchTimer) clearInterval(entry.fetchTimer);
    if (this.#entries.get(entry.repo.root) === entry) this.#entries.delete(entry.repo.root);
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
