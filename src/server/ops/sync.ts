// Syncing with remotes (fetch, pull, push, publish, tags and branches on
// the remote) and cloning: git with progress, prompts answered by the user
// (askpass.ts), cancellable.
// How git runs on the network is lib/network.ts.

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { PluginError } from '@hyperpane/sdk/server';
import type { Outcome } from '../../shared/index.ts';
import type { Askpass } from '../lib/askpass.ts';
import { explain } from '../lib/explain.ts';
import type { Git } from '../lib/git.ts';
import { type Channel, network, networkEnv } from '../lib/network.ts';
import { WIN } from '../lib/platform.ts';
import { defaultRemote, readRemotes, splitRemote } from '../lib/remotes.ts';
import type { Repo } from '../lib/repo.ts';

export interface SyncRequest {
  action: unknown;
  remote?: unknown;
  all?: boolean;
  force?: unknown;
  name?: unknown;
}

async function currentBranch(repo: Repo): Promise<string> {
  const b = await repo.currentBranch();
  if (!b) throw new PluginError("HEAD isn't on a branch. Switch to one first.");
  return b;
}

async function syncRemote(repo: Repo, given?: unknown): Promise<string> {
  if (typeof given === 'string' && given.trim()) {
    const remotes = await readRemotes(repo);
    if (!remotes.names.includes(given.trim())) throw new PluginError(`There's no remote called ${given.trim()}.`);
    return given.trim();
  }
  const r = defaultRemote(await readRemotes(repo), await repo.currentBranch());
  if (!r) throw new PluginError('This repository has no remote. Add one first.');
  return r;
}

function name(n: unknown, what: string): string {
  if (typeof n !== 'string' || !n.trim() || n.trim().startsWith('-') || /[\s\0]/.test(n.trim())) throw new PluginError(`That isn't a ${what}.`);
  return n.trim();
}

export async function sync(repo: Repo, r: SyncRequest, ch: Channel, askpass: Askpass | null): Promise<Outcome> {
  const git = repo.git;
  const run = (args: string[], conflicts = false) => network(git, repo.root, args, ch, askpass, { repo, conflicts });
  switch (r.action) {
    case 'fetch': {
      if (r.all) return run(['fetch', '--progress', '--prune', '--no-recurse-submodules', '--all']);
      return run(['fetch', '--progress', '--prune', '--no-recurse-submodules', await syncRemote(repo, r.remote)]);
    }
    case 'pull': {
      const branch = await currentBranch(repo);
      if (!(await repo.config(`branch.${branch}.merge`))) throw new PluginError(`${branch} has no upstream to pull from. Push it first.`);
      const configured = (await repo.config('pull.rebase')) !== null || (await repo.config('pull.ff')) !== null || (await repo.config(`branch.${branch}.rebase`)) !== null;
      const args = ['pull', '--progress', '--no-recurse-submodules'];
      // Neither set: merge (git's old default) rather than refuse when the branches have diverged.
      if (!configured) args.push('--no-rebase');
      return run(args, true);
    }
    case 'push':
    case 'publish': {
      const branch = await currentBranch(repo);
      const remote = (await repo.config(`branch.${branch}.remote`)) ?? '';
      const merge = await repo.config(`branch.${branch}.merge`);
      const args = ['push', '--progress'];
      if (r.force === 'lease' || r.force === true) args.push('--force-with-lease');
      if (r.action === 'push' && remote && remote !== '.' && merge) args.push(remote, `refs/heads/${branch}:${merge}`);
      else args.push('--set-upstream', await syncRemote(repo, r.remote), `refs/heads/${branch}:refs/heads/${branch}`);
      return run(args);
    }
    case 'pushTag': {
      const tag = name(r.name, 'tag');
      return run(['push', '--progress', await syncRemote(repo, r.remote), `refs/tags/${tag}:refs/tags/${tag}`]);
    }
    case 'deleteRemoteTag': {
      const tag = name(r.name, 'tag');
      return run(['push', '--progress', await syncRemote(repo, r.remote), '--delete', `refs/tags/${tag}`]);
    }
    case 'deleteRemoteBranch': {
      const full = name(r.name, 'remote branch');
      const split = await splitRemote(repo, full);
      if (!split) throw new PluginError("That isn't a remote branch.");
      return run(['push', '--progress', split.remote, '--delete', split.branch]);
    }
    default:
      throw new PluginError('Fetch, pull, push or publish.');
  }
}

/** A fetch nobody watches: no prompts, a time limit. */
export async function quietFetch(repo: Repo): Promise<void> {
  const remote = defaultRemote(await readRemotes(repo), await repo.currentBranch());
  if (!remote) return;
  const env = await networkEnv(repo, true);
  const out = await repo.exec(['fetch', '--prune', '--no-recurse-submodules', '--quiet', remote], { env, timeout: 120_000 });
  if (out.code !== 0) throw new PluginError(explain(out.stderr));
}

export async function clone(git: Git, r: { url: unknown; into: string; branch?: unknown; depth?: unknown }, ch: Channel, askpass: Askpass | null): Promise<{ root: string }> {
  const url = typeof r.url === 'string' ? r.url.trim() : '';
  if (!url || url.startsWith('-') || /\s/.test(url)) throw new PluginError("That isn't a repository's URL.");
  const into = r.into;
  let made = false;
  const there = await stat(into).then((s) => s, () => null);
  if (there) {
    if (!there.isDirectory()) throw new PluginError(`${path.basename(into)} is there already, and isn't a folder.`);
    if ((await readdir(into)).length) throw new PluginError('The folder to clone into is there already, and not empty.');
  } else {
    await mkdir(path.dirname(into), { recursive: true });
    made = true;
  }
  const args = ['clone', '--progress'];
  if (typeof r.branch === 'string' && r.branch.trim()) args.push('--branch', name(r.branch, 'branch'));
  if (r.depth !== undefined && r.depth !== null) {
    const d = Number(r.depth);
    if (!Number.isInteger(d) || d < 1) throw new PluginError('The depth is a whole number of commits.');
    args.push('--depth', String(d));
  }
  args.push('--', url, into);
  try {
    // Line endings as the user's git says, but never a console window for the credential manager.
    await network(git, path.dirname(into), args, ch, askpass, WIN ? { config: ['-c', 'credential.interactive=never'] } : {});
  } catch (e) {
    if (made) await rm(into, { recursive: true, force: true });
    else if (there) {
      for (const entry of await readdir(into).catch(() => [])) await rm(path.join(into, entry), { recursive: true, force: true });
    }
    throw e;
  }
  return { root: into };
}
