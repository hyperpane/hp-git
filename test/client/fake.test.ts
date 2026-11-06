// The Git window against a fake server part: what it asks and when (a diff
// dropped when the pick moves on), syncing with progress, a password asked
// for through the app's dialog, force push asked first, cancel; a folder
// that isn't a repository (initialize, clone); keys by physical key; the
// list folded away; other plugins opening a file's blame; main.tsx.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Diff, Status, SyncEvent } from '../../src/shared/index.ts';
import { STREAM, type ServerCall, boot, button, click, key, open, until, wait } from './support/frame.ts';

const { GitWindow } = await import('../../src/client/app/GitWindow.tsx');

const ROOT = '/work/app';

function status(o: Partial<Status> = {}): Status {
  return {
    root: ROOT,
    gitDir: `${ROOT}/.git`,
    branch: 'main',
    head: 'a'.repeat(40),
    detached: false,
    unborn: false,
    upstream: 'origin/main',
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    remote: 'origin',
    remotes: ['origin'],
    operation: null,
    files: [],
    truncated: false,
    stashes: 0,
    identity: { name: 'Ada Lovelace', email: 'ada@example.com' },
    fetched: Date.now() - 60_000,
    ...o,
  };
}

const file = (path: string, worktree: 'M' | 'D' = 'M') => ({ path, staged: null, worktree, untracked: false, conflict: null, mtime: 1, additions: 1, deletions: 1 });

function diffOf(path: string): Diff {
  return {
    path,
    status: 'M',
    binary: false,
    truncated: false,
    size: 40,
    additions: 1,
    deletions: 1,
    hunks: [{ header: '@@ -1,1 +1,1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: '-', old: 1, text: `old ${path}` }, { kind: '+', new: 1, text: `new ${path}` }] }],
  };
}

type Handler = (c: ServerCall) => unknown;

/** The watches open now: `pushStatus()` sends them a new status. */
const watches = new Set<ServerCall>();
const pushStatus = (s: Status) => watches.forEach((c) => (c.signal.aborted ? watches.delete(c) : c.send(s)));

/** A fake server: `find` and `watch` for a repository with `s`; the rest by `ops`. */
function server(s: () => Status, ops: Record<string, Handler> = {}): Handler {
  return (c) => {
    // A cancellable read: the call inside, its answer as the one event.
    if (c.request.op === 'once') c = { ...c, request: c.request.call };
    const op = c.request.op;
    if (ops[op]) return ops[op](c);
    if (op === 'find') return { root: ROOT, gitDir: `${ROOT}/.git`, bare: false, repos: [{ root: ROOT, kind: 'main', name: 'app' }, { root: `${ROOT}/lib`, kind: 'submodule', name: 'lib' }] };
    if (op === 'watch') {
      watches.add(c);
      c.send(s());
      return STREAM;
    }
    if (op === 'status') return s();
    if (op === 'diff') return diffOf(c.request.path);
    if (op === 'log') return { commits: [], more: false };
    if (op === 'branches') return { current: 'main', local: [], remote: [], recent: [] };
    return null;
  };
}

async function window(t: { after(fn: () => void): void }, fake: Handler, o: { settings?: Record<string, unknown>; data?: Record<string, string> } = {}) {
  const f = await open(GitWindow as never, { folder: ROOT, fake, settings: o.settings, data: o.data });
  t.after(() => f.close());
  return f;
}

test('a diff is asked as a subscription and dropped when the pick moves on', async (t) => {
  const pending = new Set<string>();
  const w = await window(
    t,
    server(() => status({ files: [file('a.txt'), file('b.txt'), file('c.txt')] }), {
      // a.txt and b.txt never answer: they wait to be dropped.
      diff: (c) => {
        if (c.request.path === 'c.txt') return diffOf('c.txt');
        pending.add(c.request.path);
        return STREAM;
      },
    }),
  );
  const list = await until(() => w.root.querySelector<HTMLElement>('[aria-label="Changed files"]'));
  await until(() => pending.has('a.txt'), 5000, 'a.txt asked');
  list.focus();
  key(list, 'ArrowDown');
  await wait(60);
  key(list, 'ArrowDown');
  await until(() => w.root.querySelector('[data-diff="c.txt"]')?.textContent?.includes('new c.txt'), 5000, 'c.txt shown');
  const dropped = w.app.cancelled.map((c) => c.request.call?.path).filter(Boolean);
  assert.ok(dropped.includes('a.txt'), `dropped: ${dropped}`);
  // Each was a subscription (so dropping it stops git), with the window's context lines.
  const asked = w.app.sent.filter((s) => s.a?.request?.call?.op === 'diff');
  assert.ok(asked.length >= 3 && asked.every((s) => s.m === 'server.subscribe' && s.a.request.op === 'once' && s.a.request.call.context === 3));
});

test('sync: Push ↑2 with progress; a password asked through the app; then Fetch', async (t) => {
  let st = status({ ahead: 2 });
  let answered: unknown = null;
  let sync: ServerCall | null = null;
  const w = await window(
    t,
    server(() => st, {
      sync: (c) => {
        sync = c;
        return STREAM;
      },
      answer: (c) => {
        answered = c.request;
        return null;
      },
    }),
  );
  const push = await until(() => button(w.root, /Push origin/), 5000, 'the push button');
  assert.match(push.textContent!, /↑2/);
  click(push);
  await until(() => sync, 5000, 'the sync');
  assert.equal(sync!.request.action, 'push');
  w.app.answers['ui.dialog'] = (a: { view: string }) => (a.view === 'credentials' ? 'hunter2' : null);
  sync!.send({ type: 'progress', phase: 'Writing objects', percent: 42, text: 'Writing objects: 42% (2/5)' } satisfies SyncEvent);
  await until(() => w.root.textContent!.includes('Writing objects 42%'), 5000, 'the progress');
  assert.match(w.root.textContent!, /Pushing to origin…/);
  sync!.send({ type: 'prompt', id: 'p1', prompt: "Password for 'https://ada@example.com':", secret: true, kind: 'password' } satisfies SyncEvent);
  await until(() => answered, 5000, 'the answer');
  assert.deepEqual(answered, { op: 'answer', repo: ROOT, id: 'p1', value: 'hunter2' });
  assert.equal(w.app.last('ui.dialog').view, 'credentials');
  assert.equal(w.app.last('ui.dialog').data.kind, 'password');
  sync!.send({ type: 'done', result: { conflicts: false } } satisfies SyncEvent);
  sync!.end();
  st = status({ ahead: 0 });
  pushStatus(st);
  await until(() => button(w.root, /Fetch origin/), 5000, 'fetch next');
});

test('a sync can be cancelled; force push asks first and leases', async (t) => {
  const syncs: ServerCall[] = [];
  const w = await window(
    t,
    server(() => status(), {
      sync: (c) => {
        syncs.push(c);
        return STREAM;
      },
    }),
  );
  click(await until(() => button(w.root, /Fetch origin/)));
  await until(() => syncs.length === 1);
  click(await until(() => button(w.root, 'Cancel')));
  await until(() => w.app.cancelled.some((c) => c.request.op === 'sync'), 5000, 'cancelled');
  await until(() => button(w.root, /Fetch origin/));
  // The sync menu: force push with lease, confirmed.
  w.app.answers['ui.menu'] = (a: { items: { id: string; label: string }[] }) => a.items.find((i) => i.label.startsWith('Force Push'))?.id ?? null;
  click(button(w.root, 'More sync actions')!);
  await until(() => syncs.length === 2, 5000, 'the force push');
  assert.equal(syncs[1].request.force, 'lease');
  assert.equal(w.app.last('ui.confirm').destructive, true);
  assert.match(w.app.last('ui.confirm').title, /Force push main/);
});

test('a folder that isn’t a repository: initialize it (on the default branch), or clone into it', async (t) => {
  let made = false;
  let clone: ServerCall | null = null;
  const fake: Handler = (c) => {
    const op = c.request.op;
    if (op === 'find') return made ? { root: ROOT, gitDir: `${ROOT}/.git`, bare: false, repos: [] } : { root: null, gitDir: null, bare: false, repos: [] };
    if (op === 'init') {
      made = true;
      return { root: ROOT };
    }
    if (op === 'clone') {
      clone = c;
      return STREAM;
    }
    if (op === 'watch') {
      c.send(status({ unborn: true, head: null, upstream: null }));
      return STREAM;
    }
    return null;
  };
  // Initialize, here.
  const a = await window(t, fake, { settings: { defaultBranch: 'trunk' } });
  await until(() => a.root.textContent!.includes('isn’t a Git repository'));
  click(button(a.root, 'Initialize Repository')!);
  await until(() => a.app.ops('init').length);
  assert.deepEqual(a.app.ops('init')[0], { op: 'init', path: ROOT, branch: 'trunk' });
  await until(() => a.root.querySelector('[data-git]'), 5000, 'the repository');
  a.close();
  // Clone, with its progress; the window then shows the clone.
  made = false;
  const w = await window(t, fake);
  await until(() => w.root.textContent!.includes('isn’t a Git repository'));
  w.app.answers['ui.dialog'] = (d: { view: string }) => (d.view === 'clone' ? { url: 'https://example.com/x.git', into: '/work/x' } : null);
  click(button(w.root, 'Clone…')!);
  await until(() => clone, 5000, 'the clone');
  assert.deepEqual(clone!.request, { op: 'clone', url: 'https://example.com/x.git', into: '/work/x' });
  clone!.send({ type: 'progress', phase: 'Receiving objects', percent: 10, text: 'Receiving objects: 10%' });
  await until(() => w.root.textContent!.includes('Receiving objects 10%'));
  clone!.send({ type: 'done', result: { conflicts: false, root: '/work/x' } });
  clone!.end();
  await until(() => w.app.calls('window.setData').some((d) => d.key === 'folder' && d.value === '/work/x'), 5000, 'the folder');
});

test('keys: Ctrl+2 (by its place) is History, the list folds away and back', async (t) => {
  const w = await window(t, server(() => status({ files: [file('a.txt')] })));
  await until(() => w.root.querySelector('[data-git]'));
  // Pressed again until heard: the window listens from an effect, which a
  // slow machine (CI) runs after the first press.
  await until(() => {
    key(globalThis.window as unknown as Window, '2', { code: 'Digit2', ctrlKey: true });
    return w.root.querySelector('[data-tab="history"][aria-selected="true"]');
  });
  // History asks for its log from an effect, a moment after the tab shows.
  await until(() => w.app.ops('log').length, 15000, 'the log');
  click(button(w.root, 'Hide the list')!);
  await until(() => !w.root.querySelector('[role="tablist"]'));
  // The rail keeps the tabs.
  click(button(w.root, /^Changes \(/)!);
  click(button(w.root, 'Show the list')!);
  await until(() => w.root.querySelector('[data-tab="changes"][aria-selected="true"]'));
});

test('other plugins open a file’s blame here (git.open), in this window', async (t) => {
  const w = await window(t, server(() => status(), { blame: () => ({ lines: [{ sha: 'b'.repeat(40), line: 1, text: 'hello' }], commits: { ['b'.repeat(40)]: { author: 'Ada', email: 'a@x', date: Date.now(), summary: 'said hello' } }, truncated: false }) }));
  await until(() => w.root.querySelector('[data-git]'));
  await wait(50);
  w.app.publish('git.open', { path: `${ROOT}/src/hi.ts`, view: 'blame', line: 1 });
  const view = await until(() => w.root.querySelector<HTMLElement>('[data-blame="src/hi.ts"]'), 5000, 'the blame');
  await until(() => view.textContent!.includes('said hello'));
  await until(() => w.app.calls('app.focusWindow').length, 15000);
  // A path outside the repository isn't this window's.
  w.app.publish('git.open', { path: '/elsewhere/x.ts', view: 'history' });
  await wait(50);
  assert.ok(!w.root.querySelector('[data-view="fileHistory"]'));
});

test('the repository menu switches to a submodule; the window menu fetches', async (t) => {
  const syncs: ServerCall[] = [];
  const w = await window(t, server(() => status(), { sync: (c) => (syncs.push(c), STREAM) }));
  await until(() => w.root.querySelector('[data-git]'));
  w.app.answers['ui.menu'] = (a: { items: { id: string; label: string }[] }) => a.items.find((i) => i.label.startsWith('lib'))?.id ?? null;
  click([...w.root.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Repository'))!);
  await until(() => w.app.calls('window.setData').some((d) => d.key === 'repo' && d.value === `${ROOT}/lib`), 5000, 'the submodule');
  const menu = await until(() => w.app.calls('window.setMenu').find((m) => m.items.length));
  assert.deepEqual(
    menu.items.filter((i: { separator?: boolean }) => !i.separator).map((i: { id: string }) => i.id),
    ['fetch', 'pull', 'push', 'refresh', 'folder'],
  );
  // Sent again until heard, as the key above.
  await until(() => {
    if (!syncs.length) w.app.event('menu', { id: 'fetch' });
    return syncs.some((s) => s.request.action === 'fetch');
  });
});

test('main.tsx mounts the window, and a dialog frame', async (t) => {
  const { app, root, stop } = await boot({ folder: ROOT, fake: server(() => status({ files: [file('a.txt')] })) });
  t.after(stop);
  await until(() => root.querySelector('[data-git]'), 5000, 'the window');
  await until(() => app.last('window.setTitle')?.title === 'app · main');
});

test('10 000 changed files and 5 000 commits: only the rows on screen are drawn', async (t) => {
  const many = Array.from({ length: 10_000 }, (_, i) => file(`src/d${Math.floor(i / 100)}/f${i}.txt`));
  const commits = Array.from({ length: 5000 }, (_, i) => ({
    sha: i.toString(16).padStart(40, '0'),
    parents: i < 4999 ? [(i + 1).toString(16).padStart(40, '0')] : [],
    author: 'Ada',
    email: 'a@x',
    date: Date.now() - i * 60_000,
    committer: 'Ada',
    committerEmail: 'a@x',
    committerDate: Date.now() - i * 60_000,
    subject: `Change ${i}`,
    refs: [],
  }));
  const started = performance.now();
  const w = await window(t, server(() => status({ files: many }), { log: (c) => ({ commits: commits.slice(c.request.skip, c.request.skip + c.request.limit), more: c.request.skip + c.request.limit < commits.length }) }));
  const list = await until(() => w.root.querySelector<HTMLElement>('[aria-label="Changed files"]'), 10_000, 'the list');
  const ms = performance.now() - started;
  const rows = list.querySelectorAll('[data-row]').length;
  assert.ok(rows > 10 && rows < 80, `${rows} rows drawn`);
  assert.ok(ms < 5000, `${ms} ms`);
  // The tree, too.
  click(button(w.root, 'Group by folder')!);
  await until(() => list.isConnected && w.root.querySelector('[aria-label="Changed files"]')!.querySelectorAll('[data-row]').length < 80);
  // History: a page of 300, then the next when the end shows.
  click(w.root.querySelector('[data-tab="history"]')!);
  const commitsList = await until(() => w.root.querySelector<HTMLElement>('[aria-label="Commits"]'), 20_000, 'commits');
  await until(() => commitsList.querySelectorAll('[data-sha]').length > 10);
  assert.ok(commitsList.querySelectorAll('[data-sha]').length < 80);
  commitsList.scrollTop = 290 * 26;
  commitsList.dispatchEvent(new Event('scroll'));
  await until(() => w.app.ops('log').some((r) => r.skip === 300), 5000, 'the next page');
});

test('git.changed from another window loads the lists again', async (t) => {
  const w = await window(t, server(() => status()));
  await until(() => w.root.querySelector('[data-git]'));
  click(w.root.querySelector('[data-tab="history"]')!);
  await until(() => w.app.ops('log').length === 1);
  await wait(50);
  w.app.publish('git.changed', { repo: '/elsewhere', branch: 'main', head: 'x' });
  await wait(100);
  assert.equal(w.app.ops('log').length, 1);
  w.app.publish('git.changed', { repo: ROOT, branch: 'main', head: 'b'.repeat(40) });
  await until(() => w.app.ops('log').length === 2, 5000, 'the log again');
  await until(() => w.app.calls('bus.subscribe').some((s) => s.pattern === 'git.changed'), 15000);
});
