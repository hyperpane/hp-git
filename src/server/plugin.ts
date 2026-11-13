// The Git plugin's server part: its ops (API.md), apart from main.ts so the
// tests can make it with a test host (@hyperpane/sdk/testing).
//
// Ops that change a repository wait for each other (git's index lock is
// per repository); reads run at once. After a change, the repository's
// watches look again at once and `git.changed` goes out on the bus.
//
// This file wires each op to its handler (ops/, one file per group); what
// they share (running git, parsing what it prints, the watches) is in lib/.

import path from 'node:path';
import { type Host, type JsonSpec, PluginError, fromClient, json } from '@hyperpane/sdk/server';
import type { Outcome, Status, SyncEvent, Topics } from '../shared/index.ts';
import { Askpass } from './lib/askpass.ts';
import { Git } from './lib/git.ts';
import { repoLocks } from './lib/locks.ts';
import { writeCommitGraph } from './lib/maintenance.ts';
import { prompts } from './lib/prompts.ts';
import { publisher } from './lib/publish.ts';
import { type Repo, Repos } from './lib/repo.ts';
import { type Trash, systemTrash } from './lib/trash.ts';
import { Watches } from './lib/watches.ts';
import { apply } from './ops/apply.ts';
import { blame } from './ops/blame.ts';
import { branchAction, branches, checkout } from './ops/branches.ts';
import { authors, commit, undoCommit } from './ops/commit.ts';
import { config } from './ops/config.ts';
import { blob, diff } from './ops/diff.ts';
import { explorerOps } from './ops/explorer.ts';
import { compare, fileLog, log } from './ops/history.ts';
import { cherryPick, merge, operationAction, rebase, reset, revert } from './ops/merge.ts';
import { remoteAction, remotes } from './ops/remotes.ts';
import { find, init } from './ops/repos.ts';
import { resolve } from './ops/resolve.ts';
import { changesBetween, show } from './ops/show.ts';
import { discard, ignore, stage, unstage } from './ops/stage.ts';
import { stashAction, stashPush, stashes } from './ops/stash.ts';
import { status } from './ops/status.ts';
import { clone, quietFetch, sync } from './ops/sync.ts';
import { tagAction, tags } from './ops/tags.ts';

export interface Options {
  /** Where discarded files go (tests: a folder). */
  trash?: Trash;
  /** How long a prompt waits for its answer. */
  promptTimeout?: number;
  /** How long a minute of the autoFetch setting is (tests). */
  minute?: number;
}

type Settings = {
  gitPath?: string;
  autoFetch?: string;
  defaultBranch?: string;
  commitGraph?: boolean;
};

export function makeGit(options: Options = {}) {
  return json((host: Host): JsonSpec => {
    const trash = options.trash ?? systemTrash;
    const publish = publisher(host);
    const settings = () => host.settings<Settings>();
    const git = new Git(host, async () => String((await settings()).gitPath ?? ''));
    const repos = new Repos(git);
    const askpass = new Askpass(path.join(host.dataDir, 'askpass'));
    const { pending, asker } = prompts(options.promptTimeout);
    const locked = repoLocks();

    const watches = new Watches({
      status: (repo, stats) => status(repo, { stats }),
      changed: (repo, _before, now) => publish(repo, 'git.changed', { repo: repo.shownRoot, branch: now.branch, head: now.head }),
      fetchEvery: async () => {
        const v = String((await settings()).autoFetch ?? 'off');
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
      },
      fetch: (repo) => locked(repo, () => quietFetch(repo)),
      minute: options.minute,
      opened: (repo) => {
        void (async () => {
          if ((await settings()).commitGraph === false) return;
          if (await writeCommitGraph(repo)) host.log(`wrote the commit-graph of ${repo.shownRoot}`);
        })().catch((e) => host.log('commit-graph:', (e as Error).message));
      },
      log: (...a) => host.log(...a),
    });

    host.onSettings((_values, project) => {
      if (project !== null) return;
      git.forget();
      void watches.settingsChanged();
    });

    /** After a change: the watches look again, or (none open) the bus hears of it. */
    async function changed(repo: Repo, project?: string | null) {
      if (watches.poke(repo.root)) return;
      const out = await repo.exec(['rev-parse', '--abbrev-ref', 'HEAD', 'HEAD']);
      const [ref, head] = out.stdout.toString().trim().split('\n');
      publish(repo, 'git.changed', { repo: repo.shownRoot, branch: !ref || ref === 'HEAD' ? null : ref, head: head && /^[0-9a-f]+$/.test(head) ? head : null }, project);
    }

    /** A call that changes the repository: queued, then the change told. */
    function change<T>(fn: (repo: Repo, req: any, ctx: { signal: AbortSignal; project: string | null }) => Promise<T>) {
      return async (req: any, ctx: { signal: AbortSignal; project: string | null }) => {
        const repo = await repos.open(req?.repo, ctx.project);
        try {
          return await locked(repo, () => fn(repo, req, ctx));
        } finally {
          await changed(repo, ctx.project).catch(() => {});
        }
      };
    }

    /** A call that reads. */
    function read<T>(fn: (repo: Repo, req: any, ctx: { signal: AbortSignal; project: string | null }) => Promise<T>) {
      return async (req: any, ctx: { signal: AbortSignal; project: string | null }) => fn(await repos.open(req?.repo, ctx.project), req, ctx);
    }

    const outcome = (o: Outcome) => o;

    // For Explorer (its extension points): the app calls these, with whole paths.
    const explorer = explorerOps({ repos, locked, changed });

    const spec: JsonSpec = {
      calls: {
        version: async () => (await git.which()) ?? { path: null, version: null },
        find: async ({ path: p }) => find(git, p),
        init: async ({ path: p, branch }) => init(git, p, branch, String((await settings()).defaultBranch ?? 'main')),

        status: read((repo, req, { signal }) => status(repo, { stats: !!req.stats, signal })),

        diff: read((repo, req, { signal }) => diff(repo, req, signal)),
        blob: read((repo, req, { signal }) => blob(repo, req, signal)),
        apply: change((repo, req) => apply(repo, req.patch, !!req.cached, !!req.reverse, trash)),

        stage: change((repo, req) => stage(repo, req.paths, !!req.all)),
        unstage: change((repo, req) => unstage(repo, req.paths, !!req.all)),
        discard: change((repo, req) => discard(repo, req.paths, trash)),
        ignore: change((repo, req) => ignore(repo, req.pattern)),
        commit: async (req, ctx) => {
          const result = await change((repo, r, { signal }) => commit(repo, r, signal))(req, ctx);
          const repo = await repos.open(req.repo, ctx.project);
          publish(repo, 'git.committed', { repo: repo.shownRoot, sha: result.sha, summary: result.summary }, ctx.project);
          return result;
        },
        undoCommit: change((repo) => undoCommit(repo)),
        authors: read((repo, req, { signal }) => authors(repo, req.limit, signal)),
        config: async (req, ctx) => {
          const writes = req?.set && typeof req.set === 'object' && Object.keys(req.set).length;
          return writes ? change((repo, r) => config(repo, r))(req, ctx) : read((repo, r) => config(repo, r))(req, ctx);
        },

        log: read((repo, req, { signal }) => log(repo, req, signal)),
        show: read((repo, req, { signal }) => show(repo, req.sha, signal)),
        compare: read((repo, req, { signal }) => compare(repo, req.base, req.head, req.limit, signal)),
        changes: read((repo, req, { signal }) => changesBetween(repo, req.from, req.to, signal)),
        fileLog: read((repo, req, { signal }) => fileLog(repo, req.path, req.skip, req.limit, signal)),
        blame: read((repo, req, { signal }) => blame(repo, req.path, req.rev, signal)),

        branches: read((repo, _req, { signal }) => branches(repo, signal)),
        checkout: async (req, ctx) => {
          await change((repo, r) => checkout(repo, r))(req, ctx);
          const repo = await repos.open(req.repo, ctx.project);
          publish(repo, 'git.checkedOut', { repo: repo.shownRoot, branch: await repo.currentBranch() }, ctx.project);
          return null;
        },
        branch: change((repo, req) => branchAction(repo, req)),
        merge: change(async (repo, req) => outcome(await merge(repo, req))),
        rebase: change(async (repo, req) => outcome(await rebase(repo, req.onto))),
        cherryPick: change(async (repo, req) => outcome(await cherryPick(repo, Array.isArray(req.shas) ? req.shas : [req.sha]))),
        revert: change(async (repo, req) => outcome(await revert(repo, req.sha))),
        reset: change((repo, req) => reset(repo, req.sha, req.mode)),
        operation: change(async (repo, req) => outcome(await operationAction(repo, req.action))),
        resolve: change((repo, req) => resolve(repo, req.path, req.side, trash, req.text, !!req.mark)),

        stashes: read((repo, _req, { signal }) => stashes(repo, signal)),
        stash: async (req, ctx) => {
          if (req?.action === 'show') {
            return read(async (repo, r, { signal }) => {
              const list = await stashes(repo);
              const s = list.find((x) => x.index === Number(r.index ?? 0));
              if (!s) throw new PluginError("There's no such stash.");
              return show(repo, s.sha, signal);
            })(req, ctx);
          }
          return change(async (repo, r) => {
            if (r.action === 'push') {
              await stashPush(repo, r);
              return null;
            }
            const o = await stashAction(repo, String(r.action), r.index);
            return r.action === 'drop' ? null : o;
          })(req, ctx);
        },

        tags: read((repo, _req, { signal }) => tags(repo, signal)),
        tag: change((repo, req) => tagAction(repo, req)),
        remotes: read((repo) => remotes(repo)),
        remote: change((repo, req) => remoteAction(repo, req)),

        explorerDecorations: (req) => explorer.decorations(req),
        explorerStage: (req, ctx) => explorer.stage(req, ctx.project),

        answer: async ({ id, value }) => {
          const p = pending.get(String(id));
          if (!p) throw new PluginError('That question was answered already, or it timed out.');
          p.resolve(typeof value === 'string' ? value : null);
          return null;
        },
      },

      subscriptions: {
        // Any call, as a subscription: its one reply comes as an event, then
        // it ends. Cancelling it (the frame moving on to another diff) stops
        // the call, and the git it runs, which a plain call can't be.
        once: async (req, out, ctx) => {
          const call = req?.call;
          const op = typeof call?.op === 'string' ? call.op : '';
          const run = spec.calls?.[op];
          if (!run) throw new PluginError(`There's no “${op}” to run.`);
          out.emit(await run({ ...call, repo: call.repo ?? req.repo }, { ...ctx, signal: out.signal }));
        },

        watch: async (req, out, ctx) => {
          const repo = await repos.open(req?.repo, ctx.project);
          await watches.watch(repo, !!req.stats, (s) => out.emit(s), out.signal);
        },

        sync: async (req, out, ctx) => {
          const repo = await repos.open(req?.repo, ctx.project);
          const run = () => sync(repo, req, { emit: (e) => out.emit(e), ask: asker(out), signal: out.signal }, askpass);
          try {
            const result = req.action === 'pull' ? await locked(repo, run) : await run();
            out.emit({ type: 'done', result } satisfies SyncEvent);
          } finally {
            await changed(repo, ctx.project).catch(() => {});
          }
        },

        clone: async (req, out) => {
          if (typeof req?.into !== 'string' || !req.into.trim()) throw new PluginError('Where should it be cloned to?');
          const into = path.resolve(fromClient(req.into.trim()));
          if (!path.isAbsolute(into)) throw new PluginError(`${req.into} isn't a whole path.`);
          await clone(git, { ...req, into }, { emit: (e) => out.emit(e), ask: asker(out), signal: out.signal }, askpass);
          const root = (await find(git, into)).root ?? req.into;
          out.emit({ type: 'done', result: { conflicts: false, root } } satisfies SyncEvent);
        },
      },

      events: {
        // Any plugin's `bus.request('git.status', {repo?, path?})`: the status.
        'git.status': async (event) => {
          const data = (event.data ?? {}) as Topics['git.status'];
          const where = data.repo ?? data.path ?? (event.project ? host.projectFolder(event.project) : null);
          if (!where) throw new PluginError('Which repository? Give repo or path.');
          const found = await find(git, where);
          if (!found.root) throw new PluginError(`${where} isn't in a Git repository.`);
          return status(await repos.open(found.root)) as Promise<Status>;
        },
      },

      busy: () => git.running > 0 || pending.size > 0,

      projectOff: () => {
        // Its watches end with their subscriptions; nothing else runs per project.
      },

      shutdown: async () => {
        watches.closeAll();
        for (const p of pending.values()) p.resolve(null);
        await askpass.close();
      },
    };
    return spec;
  });
}

/** What main.ts serves. */
export const git = makeGit();
