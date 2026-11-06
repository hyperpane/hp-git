// Bus events about a repository (`git.changed`, `git.committed`,
// `git.checkedOut`): to the projects it's in, or that are in it; one in
// none of them goes to the whole server.

import path from 'node:path';
import { type Host, fromClient, typedBus } from '@hyperpane/sdk/server';
import type { Topics } from '../../shared/index.ts';
import type { Repo } from './repo.ts';

/** A `publish(repo, topic, data, project?)` on the host's bus. */
export function publisher(host: Host) {
  const bus = typedBus<Topics>(host.bus);

  /** The projects a repository is in (or that are in it). */
  function projectsOf(repo: Repo, also?: string | null): string[] {
    const ids = new Set<string>();
    if (also) ids.add(also);
    for (const p of host.projects()) {
      const folder = path.resolve(fromClient(p.folder));
      const a = path.relative(folder, repo.root);
      const b = path.relative(repo.root, folder);
      if (!a.startsWith('..') || !b.startsWith('..')) ids.add(p.id);
    }
    return [...ids];
  }

  /** To the projects the repository is in; one in none of them goes to the whole server. */
  return function publish<K extends keyof Topics>(repo: Repo, topic: K, data: Topics[K], project?: string | null) {
    const ids = projectsOf(repo, project);
    for (const to of ids.length ? ids.map((id) => ({ project: id })) : [{ scope: 'server' as const }]) {
      try {
        bus.publish(topic, data, to);
      } catch (e) {
        host.log(`couldn't publish ${topic}:`, (e as Error).message);
      }
    }
  };
}
