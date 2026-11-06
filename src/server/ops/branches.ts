// `branches`, `checkout` and `branch`: the local and remote branches (with
// their upstreams, ahead and behind, merged or not, and the recent ones);
// switching to a branch, a remote branch (tracked), a tag or a commit; and
// making, renaming, deleting a branch or setting its upstream.

import { PluginError } from '@hyperpane/sdk/server';
import type { Branches, LocalBranch, RemoteBranch } from '../../shared/index.ts';
import { ref } from '../lib/args.ts';
import { US } from '../lib/commits.ts';
import { splitRemote } from '../lib/remotes.ts';
import type { Repo } from '../lib/repo.ts';

export async function branches(repo: Repo, signal?: AbortSignal): Promise<Branches> {
  const format = ['%(refname)', '%(objectname)', '%(upstream:short)', '%(upstream:track,nobracket)', '%(subject)', '%(committerdate:unix)', '%(authorname)', '%(HEAD)'].join('%1f');
  const hasHead = await repo.hasHead();
  const [out, merged, reflog, current] = await Promise.all([
    repo.text(['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes'], { signal }),
    hasHead ? repo.text(['for-each-ref', '--merged=HEAD', '--format=%(refname)', 'refs/heads']) : Promise.resolve(''),
    hasHead ? repo.exec(['reflog', 'show', '--format=%gs', '-n', '500', 'HEAD', '--']) : null,
    repo.currentBranch(),
  ]);
  const mergedSet = new Set(merged.split('\n').filter(Boolean));
  const local: LocalBranch[] = [];
  const remote: RemoteBranch[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const f = line.split(US);
    const [ref, sha, upstream, track, subject, date, author, head] = f;
    if (ref.startsWith('refs/heads/')) {
      const b: LocalBranch = { name: ref.slice(11), sha, subject, date: Number(date) * 1000, author, merged: mergedSet.has(ref), current: head === '*' };
      if (upstream) {
        b.upstream = upstream;
        if (track === 'gone') b.gone = true;
        else {
          b.ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0);
          b.behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0);
        }
      }
      local.push(b);
    } else if (ref.startsWith('refs/remotes/')) {
      const name = ref.slice(13);
      if (name.endsWith('/HEAD')) continue;
      const slash = name.indexOf('/');
      if (slash < 0) continue;
      remote.push({ name, remote: name.slice(0, slash), branch: name.slice(slash + 1), sha, subject, date: Number(date) * 1000, author });
    }
  }
  // Remote names may have slashes: the longest known remote that prefixes it.
  const remotes = (await repo.text(['remote'])).split('\n').filter(Boolean).sort((a, b) => b.length - a.length);
  for (const r of remote) {
    const known = remotes.find((n) => r.name.startsWith(`${n}/`));
    if (known) {
      r.remote = known;
      r.branch = r.name.slice(known.length + 1);
    }
  }
  const names = new Set(local.map((b) => b.name));
  const recent: string[] = [];
  if (reflog?.code === 0) {
    for (const entry of reflog.stdout.toString('utf8').split('\n')) {
      const m = /^checkout: moving from (.+) to (.+)$/.exec(entry);
      if (!m) continue;
      for (const name of [m[2], m[1]]) if (names.has(name) && !recent.includes(name)) recent.push(name);
      if (recent.length >= 10) break;
    }
  }
  return { current, local, remote, recent };
}

async function checkBranchName(repo: Repo, name: unknown): Promise<string> {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n || n.startsWith('-') || !(await repo.ok(['check-ref-format', '--branch', n]))) throw new PluginError(`“${n}” isn't a valid branch name.`);
  return n;
}

const localExists = (repo: Repo, name: string) => repo.ok(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
const remoteExists = (repo: Repo, name: string) => repo.ok(['show-ref', '--verify', '--quiet', `refs/remotes/${name}`]);

export async function checkout(repo: Repo, r: { ref: unknown; create?: boolean; from?: unknown; detach?: boolean }) {
  if (r.create) {
    const name = await checkBranchName(repo, r.ref);
    if (await localExists(repo, name)) throw new PluginError(`There's a branch called ${name} already.`);
    const args = ['switch', '--no-guess', '-c', name];
    if (r.from !== undefined && r.from !== null && r.from !== '') args.push(ref(r.from));
    await repo.run(args);
    return;
  }
  const target = ref(r.ref);
  if (r.detach) {
    await repo.run(['switch', '--detach', target]);
    return;
  }
  if (await localExists(repo, target)) {
    await repo.run(['switch', '--no-guess', target]);
    return;
  }
  if (await remoteExists(repo, target)) {
    const split = await splitRemote(repo, target);
    const local = split ? split.branch : target.slice(target.indexOf('/') + 1);
    if (await localExists(repo, local)) await repo.run(['switch', '--no-guess', local]);
    else await repo.run(['switch', '--no-guess', '-c', local, '--track', `refs/remotes/${target}`]);
    return;
  }
  // A tag or a commit: checked out detached.
  if (!(await repo.ok(['rev-parse', '--verify', '--quiet', `${target}^{commit}`]))) throw new PluginError(`There's no branch or commit ${target} here.`);
  await repo.run(['switch', '--detach', target]);
}

export async function branchAction(repo: Repo, r: { action: unknown; name?: unknown; from?: unknown; checkout?: boolean; to?: unknown; force?: boolean; upstream?: unknown }) {
  switch (r.action) {
    case 'create': {
      const name = await checkBranchName(repo, r.name);
      if (await localExists(repo, name)) throw new PluginError(`There's a branch called ${name} already.`);
      if (r.checkout) return checkout(repo, { ref: name, create: true, from: r.from });
      const args = ['branch', name];
      if (r.from !== undefined && r.from !== null && r.from !== '') args.push(ref(r.from));
      await repo.run(args);
      return;
    }
    case 'rename': {
      const from = ref(r.name, 'branch');
      const to = await checkBranchName(repo, r.to);
      if (await localExists(repo, to)) throw new PluginError(`There's a branch called ${to} already.`);
      await repo.run(['branch', '-m', from, to]);
      return;
    }
    case 'delete': {
      const name = ref(r.name, 'branch');
      if ((await repo.currentBranch()) === name) throw new PluginError("This is the branch you're on: switch to another one first.");
      await repo.run(['branch', r.force ? '-D' : '-d', name]);
      return;
    }
    case 'setUpstream': {
      const name = r.name ? ref(r.name, 'branch') : await repo.currentBranch();
      if (!name) throw new PluginError("HEAD isn't on a branch. Switch to one first.");
      if (r.upstream === null || r.upstream === undefined || r.upstream === '') await repo.run(['branch', '--unset-upstream', name]);
      else await repo.run(['branch', `--set-upstream-to=${ref(r.upstream, 'remote branch')}`, name]);
      return;
    }
    default:
      throw new PluginError('Create, rename, delete or set the upstream of a branch.');
  }
}
