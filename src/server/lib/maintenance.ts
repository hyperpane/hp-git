// Git's commit-graph: a cache of the history's shape that git writes itself
// when it collects garbage (gc.writeCommitGraph) or fetches
// (fetch.writeCommitGraph). Without one, ordering history for the graph
// (--topo-order), `--merged` and path-limited logs walk every commit: on
// 50 000 commits, 160 ms a page instead of 16. When a repository with a
// long history has none, it's written once, in the background, as
// `git maintenance run --task=commit-graph` would (the `commitGraph`
// setting turns this off).

import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Repo } from './repo.ts';

/** Fewer commits than this and the walk is fast anyway. */
const WORTH_IT = 2000;
const written = new Set<string>();

/** Writes the commit-graph if it's missing and worth it; whether it did. */
export async function writeCommitGraph(repo: Repo): Promise<boolean> {
  if (written.has(repo.commonDir)) return false;
  written.add(repo.commonDir);
  const info = path.join(repo.commonDir, 'objects', 'info');
  const has = async (name: string) => stat(path.join(info, name)).then(() => true, () => false);
  if ((await has('commit-graph')) || (await has('commit-graphs'))) return false;
  if ((await repo.config('core.commitGraph')) === 'false') return false;
  if (!(await repo.hasHead())) return false;
  // Is the history long? Counting stops early: --max-count.
  const count = await repo.exec(['rev-list', '--count', `--max-count=${WORTH_IT}`, 'HEAD', '--']);
  if (count.code !== 0 || Number(count.stdout.toString().trim()) < WORTH_IT) return false;
  const out = await repo.exec(['commit-graph', 'write', '--reachable', '--changed-paths', '--no-progress']);
  return out.code === 0;
}
