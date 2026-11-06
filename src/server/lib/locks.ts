// One queue per repository for the ops that change it: git's index lock is
// per repository, so a change waits for the ones before it. Reads don't
// queue.

import type { Repo } from './repo.ts';

/** A `locked(repo, fn)` with its own queues. */
export function repoLocks() {
  const locks = new Map<string, Promise<unknown>>();

  /** Runs `fn` after the other changes to this repository. */
  return function locked<T>(repo: Repo, fn: () => Promise<T>): Promise<T> {
    const before = locks.get(repo.root) ?? Promise.resolve();
    const run = before.then(fn, fn);
    const tail = run.catch(() => {});
    locks.set(repo.root, tail);
    tail.then(() => {
      if (locks.get(repo.root) === tail) locks.delete(repo.root);
    });
    return run;
  };
}
