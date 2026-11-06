// Syncing with a bare remote over file:// (publish, push, fetch, pull with
// and without conflicts, force with lease, tags and branches on the
// remote), cloning with progress and cancel, and credentials: an HTTP
// remote (git http-backend behind Basic auth) whose prompts come to the
// subscription and are answered with `answer`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { stream } from '@hyperpane/sdk/testing';
import { progress } from '../../src/server/lib/network.ts';
import { classify } from '../../src/server/lib/askpass.ts';
import type { Branches, Status, SyncEvent } from '../../src/shared/index.ts';
import { ENV, WIN, as, commitAll, folder, plugin, repo, sh, until, write } from './support.ts';

const g = await plugin();

async function bare(): Promise<{ dir: string; url: string }> {
  const dir = path.join(await folder('git-remote-'), 'remote.git');
  sh(path.dirname(dir), 'init', '-q', '--bare', '-b', 'main', dir);
  return { dir, url: pathToFileURL(dir).href };
}

/** Runs a sync (or clone) to its end: its events, and the error it ended with. */
async function run(request: Record<string, unknown>, on?: (e: SyncEvent, s: ReturnType<typeof stream<SyncEvent>>) => void | Promise<void>, p = g) {
  const events: SyncEvent[] = [];
  const s = stream<SyncEvent>(p.plugin, request, {
    onEvent: (e) => {
      events.push(e);
      void on?.(e, s);
    },
  });
  const end = await s.end;
  const done = events.find((e) => e.type === 'done');
  return { events, error: end, result: done?.type === 'done' ? done.result : null };
}

const status = (dir: string) => g.call<Status>({ op: 'status', repo: dir });

test('progress lines and prompts are read right', () => {
  assert.deepEqual(progress('Receiving objects:  45% (450/1000), 1.2 MiB | 2 MiB/s'), { phase: 'Receiving objects', percent: 45 });
  assert.deepEqual(progress('remote: Counting objects: 100% (3/3), done.'), { phase: 'Counting objects', percent: 100 });
  assert.deepEqual(progress('remote: Enumerating objects: 5, done.'), { phase: 'Enumerating objects' });
  assert.equal(progress('To /tmp/x.git'), null);
  assert.deepEqual(classify("Username for 'https://github.com': "), { prompt: "Username for 'https://github.com':", secret: false, kind: 'username' });
  assert.equal(classify("Password for 'https://ada@github.com': ").kind, 'password');
  assert.equal(classify("Enter passphrase for key '/home/ada/.ssh/id_ed25519': ").kind, 'passphrase');
  assert.equal(classify('Are you sure you want to continue connecting (yes/no/[fingerprint])? ').kind, 'hostKey');
});

test('publish, push, fetch, pull: ahead and behind along the way', async () => {
  const remote = await bare();
  const dir = await repo({ 'a.txt': 'a\n' });
  sh(dir, 'remote', 'add', 'origin', remote.url);
  let s = await status(dir);
  assert.deepEqual([s.remote, s.upstream], ['origin', null]);
  // The first push sets the upstream.
  const published = await run({ op: 'sync', repo: dir, action: 'publish' });
  assert.equal(published.error, null);
  assert.deepEqual(published.result, { conflicts: false });
  s = await status(dir);
  assert.deepEqual([s.upstream, s.ahead, s.behind], ['origin/main', 0, 0]);
  await write(dir, { 'b.txt': 'b\n' });
  commitAll(dir, 'Second');
  assert.equal((await status(dir)).ahead, 1);
  assert.equal((await run({ op: 'sync', repo: dir, action: 'push' })).error, null);
  assert.equal((await status(dir)).ahead, 0);
  assert.equal(sh(remote.dir, 'log', '-1', '--format=%s', 'main').trim(), 'Second');
  // Someone else pushes: fetch sees it, pull brings it.
  const other = await folder();
  sh(other, 'clone', '-q', remote.url, 'o');
  const o = path.join(other, 'o');
  await write(o, { 'c.txt': 'c\n' });
  commitAll(o, 'From elsewhere');
  sh(o, 'push', '-q');
  const fetched = await run({ op: 'sync', repo: dir, action: 'fetch' });
  assert.equal(fetched.error, null);
  s = await status(dir);
  assert.equal(s.behind, 1);
  assert.ok(s.fetched !== null);
  const pulled = await run({ op: 'sync', repo: dir, action: 'pull' });
  assert.equal(pulled.error, null);
  assert.equal(await readFile(path.join(dir, 'c.txt'), 'utf8'), 'c\n');
  assert.equal((await status(dir)).behind, 0);
  assert.deepEqual((await run({ op: 'sync', repo: dir, action: 'pull' })).result, { conflicts: false, message: 'Already up to date.' });
  assert.deepEqual((await run({ op: 'sync', repo: dir, action: 'push' })).result, { conflicts: false, message: 'Already up to date.' });
});

test('a rejected push, a pull with conflicts, force with lease', async () => {
  const remote = await bare();
  const dir = await repo({ 'a.txt': 'one\n' });
  sh(dir, 'remote', 'add', 'origin', remote.url);
  sh(dir, 'push', '-q', '-u', 'origin', 'main');
  const other = await folder();
  sh(other, 'clone', '-q', remote.url, 'o');
  const o = path.join(other, 'o');
  await write(o, { 'a.txt': 'theirs\n' });
  commitAll(o, 'Theirs');
  sh(o, 'push', '-q');
  await write(dir, { 'a.txt': 'ours\n' });
  commitAll(dir, 'Ours');
  const rejected = await run({ op: 'sync', repo: dir, action: 'push' });
  assert.equal(rejected.error, "The remote has commits this branch doesn't have. Pull first, then push.");
  const pulled = await run({ op: 'sync', repo: dir, action: 'pull' });
  assert.equal(pulled.error, null);
  assert.deepEqual(pulled.result, { conflicts: true, message: 'There are conflicts to resolve.' });
  assert.equal((await status(dir)).operation?.kind, 'merge');
  await g.call({ op: 'operation', repo: dir, action: 'abort' });
  // Force with lease: refused while the remote moved since the last fetch…
  await write(o, { 'a.txt': 'theirs again\n' });
  commitAll(o, 'Theirs again');
  sh(o, 'push', '-q');
  const stale = await run({ op: 'sync', repo: dir, action: 'push', force: 'lease' });
  assert.equal(stale.error, 'The remote branch moved since the last fetch, so the force push was refused. Fetch, look, then try again.');
  // …and done once fetched.
  await run({ op: 'sync', repo: dir, action: 'fetch' });
  assert.equal((await run({ op: 'sync', repo: dir, action: 'push', force: 'lease' })).error, null);
  assert.equal(sh(remote.dir, 'log', '-1', '--format=%s', 'main').trim(), 'Ours');
});

test('tags and branches on the remote: push a tag, delete it, delete a remote branch', async () => {
  const remote = await bare();
  const dir = await repo({ 'a.txt': 'a\n' });
  sh(dir, 'remote', 'add', 'origin', remote.url);
  sh(dir, 'push', '-q', '-u', 'origin', 'main');
  sh(dir, 'tag', '-a', 'v1', '-m', 'One');
  assert.equal((await run({ op: 'sync', repo: dir, action: 'pushTag', name: 'v1' })).error, null);
  assert.equal(sh(remote.dir, 'tag').trim(), 'v1');
  assert.equal((await run({ op: 'sync', repo: dir, action: 'deleteRemoteTag', name: 'v1' })).error, null);
  assert.equal(sh(remote.dir, 'tag').trim(), '');
  sh(dir, 'push', '-q', 'origin', 'main:feature');
  sh(dir, 'fetch', '-q');
  assert.equal((await run({ op: 'sync', repo: dir, action: 'deleteRemoteBranch', name: 'origin/feature' })).error, null);
  assert.equal(sh(remote.dir, 'branch', '--list', 'feature').trim(), '');
  assert.ok(!(await g.call<Branches>({ op: 'branches', repo: dir })).remote.some((b) => b.name === 'origin/feature'));
  assert.equal((await run({ op: 'sync', repo: dir, action: 'deleteRemoteBranch', name: 'nowhere/x' })).error, "That isn't a remote branch.");
  const lonely = await repo({ 'a.txt': 'a\n' });
  assert.equal((await run({ op: 'sync', repo: lonely, action: 'fetch' })).error, 'This repository has no remote. Add one first.');
  assert.equal((await run({ op: 'sync', repo: lonely, action: 'pull' })).error, 'main has no upstream to pull from. Push it first.');
});

test('clones with progress; a cancelled clone leaves nothing behind', async () => {
  const remote = await bare();
  const src = await repo({ 'a.txt': 'a\n' });
  // Enough objects that git reports progress.
  for (let i = 0; i < 20; i++) await write(src, { [`f${i}.txt`]: `${'x'.repeat(2000)}${i}\n` });
  commitAll(src, 'Many');
  sh(src, 'remote', 'add', 'origin', remote.url);
  sh(src, 'push', '-q', '-u', 'origin', 'main');
  const into = path.join(await folder(), 'cloned');
  const done = await run({ op: 'clone', url: remote.url, into });
  assert.equal(done.error, null);
  assert.deepEqual(done.result, { conflicts: false, root: as(into) });
  assert.ok(done.events.some((e) => e.type === 'progress'));
  assert.equal((await status(into)).upstream, 'origin/main');
  const again = await run({ op: 'clone', url: remote.url, into });
  assert.equal(again.error, 'The folder to clone into is there already, and not empty.');
  const nowhere = path.join(await folder(), 'never');
  const failed = await run({ op: 'clone', url: pathToFileURL(path.join(nowhere, 'missing.git')).href, into: nowhere });
  assert.equal(failed.error, "The remote repository isn't there, or this server's account can't see it.");
  assert.equal(await stat(nowhere).then(() => true, () => false), false);
});

/** An HTTP remote: git http-backend for `root`, behind Basic auth for ada:s3cret. */
async function httpRemote(root: string) {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization ?? '';
    seen.push(auth);
    if (auth !== `Basic ${Buffer.from('ada:s3cret').toString('base64')}`) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' });
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    const cgi = spawn('git', ['http-backend'], {
      env: {
        ...ENV,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        REQUEST_METHOD: req.method,
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: req.headers['content-type'] ?? '',
        REMOTE_USER: 'ada',
        REMOTE_ADDR: '127.0.0.1',
      },
    });
    req.pipe(cgi.stdin);
    let head = Buffer.alloc(0);
    let headed = false;
    cgi.stdout.on('data', (chunk: Buffer) => {
      if (headed) return void res.write(chunk);
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      headed = true;
      const headers: Record<string, string> = {};
      let code = 200;
      for (const line of head.subarray(0, end).toString().split('\r\n')) {
        const [k, ...v] = line.split(':');
        if (k.toLowerCase() === 'status') code = parseInt(v.join(':'), 10);
        else headers[k] = v.join(':').trim();
      }
      res.writeHead(code, headers);
      res.write(head.subarray(end + 4));
    });
    cgi.stdout.on('end', () => res.end());
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/remote.git`, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// The helper is a batch file on Windows, which Git for Windows' own ssh may
// not run: unchecked there yet.
const ASKPASS = WIN ? 'the askpass helper is unchecked on Windows' : false;

test('credentials: prompts come to the subscription; answered, the clone works; cancelled, it says so', { skip: ASKPASS }, async () => {
  const remote = await bare();
  const src = await repo({ 'a.txt': 'a\n' });
  sh(src, 'remote', 'add', 'origin', remote.url);
  sh(src, 'push', '-q', '-u', 'origin', 'main');
  const server = await httpRemote(path.dirname(remote.dir));
  try {
    const into = path.join(await folder(), 'over-http');
    const prompts: Extract<SyncEvent, { type: 'prompt' }>[] = [];
    const done = await run({ op: 'clone', url: server.url, into }, async (e) => {
      if (e.type !== 'prompt') return;
      prompts.push(e);
      await g.call({ op: 'answer', id: e.id, value: e.kind === 'username' ? 'ada' : 's3cret' });
    });
    assert.equal(done.error, null);
    assert.deepEqual(prompts.map((p) => [p.kind, p.secret]), [['username', false], ['password', true]]);
    assert.match(prompts[0].prompt, /^Username for 'http:\/\/127\.0\.0\.1:\d+':$/);
    assert.equal(await readFile(path.join(into, 'a.txt'), 'utf8'), 'a\n');
    assert.ok(server.seen.some((a) => a.startsWith('Basic ')));
    // Cancelled at the first question.
    const cancelled = await run({ op: 'clone', url: server.url, into: path.join(await folder(), 'no') }, async (e) => {
      if (e.type === 'prompt') await g.call({ op: 'answer', id: e.id, value: null });
    });
    assert.equal(cancelled.error, 'Signing in was cancelled.');
    // A wrong password: the remote turns it down.
    const wrong = await run({ op: 'clone', url: server.url, into: path.join(await folder(), 'wrong') }, async (e) => {
      if (e.type === 'prompt') await g.call({ op: 'answer', id: e.id, value: e.kind === 'username' ? 'ada' : 'nope' });
    });
    assert.match(wrong.error ?? '', /authentication failed|credentials/i);
    await assert.rejects(g.call({ op: 'answer', id: 'old', value: 'x' }), { message: 'That question was answered already, or it timed out.' });
    // A question nobody answers times out, and git is told no.
    const slow = await plugin({ promptTimeout: 200 });
    const timedOut = await run({ op: 'clone', url: server.url, into: path.join(await folder(), 'slow') }, undefined, slow);
    assert.equal(timedOut.error, 'Signing in was cancelled.');
  } finally {
    await server.close();
  }
});

test('a sync cancelled while it waits for an answer ends at once', { skip: ASKPASS }, async () => {
  const remote = await bare();
  const src = await repo({ 'a.txt': 'a\n' });
  sh(src, 'remote', 'add', 'origin', remote.url);
  sh(src, 'push', '-q', '-u', 'origin', 'main');
  const server = await httpRemote(path.dirname(remote.dir));
  try {
    const dir = await repo({ 'x.txt': 'x\n' });
    sh(dir, 'remote', 'add', 'origin', server.url);
    const started = Date.now();
    const out = await run({ op: 'sync', repo: dir, action: 'fetch' }, (e, s) => {
      if (e.type === 'prompt') s.cancel();
    });
    assert.equal(out.error, null);
    assert.ok(Date.now() - started < 5000);
    // A clone cancelled at the question leaves no folder behind.
    const into = path.join(await folder(), 'cancelled');
    const clone = await run({ op: 'clone', url: server.url, into }, (e, s) => {
      if (e.type === 'prompt') s.cancel();
    });
    assert.equal(clone.error, null);
    await until(() => stat(into).then(() => false, () => true), 3000, 'the folder to go');
    // Git (and its helpers) are stopped, and nothing keeps the server up.
    await until(() => g.plugin.busy?.() === false, 3000, 'git to stop');
  } finally {
    await server.close();
  }
});

test('fetches by itself while watched (autoFetch), quietly; a failure shows in the status', async () => {
  const remote = await bare();
  const dir = await repo({ 'a.txt': 'a\n' });
  sh(dir, 'remote', 'add', 'origin', remote.url);
  sh(dir, 'push', '-q', '-u', 'origin', 'main');
  const other = await folder();
  sh(other, 'clone', '-q', remote.url, 'o');
  const o = path.join(other, 'o');
  await write(o, { 'b.txt': 'b\n' });
  commitAll(o, 'Elsewhere');
  sh(o, 'push', '-q');
  // A "minute" of 100 ms: every 5 of them, a fetch.
  const p = await plugin({ settings: { autoFetch: '5' }, minute: 100 });
  const w = stream<Status>(p.plugin, { op: 'watch', repo: dir });
  let s = await w.next();
  assert.equal(s.behind, 0);
  await until(async () => {
    s = await w.next();
    return s.behind === 1;
  }, 10_000, 'the fetch');
  // The remote gone: the next fetch fails, and says so.
  sh(dir, 'remote', 'set-url', 'origin', pathToFileURL(path.join(other, 'missing.git')).href);
  await until(async () => {
    s = await w.next();
    return !!s.fetchError;
  }, 10_000, 'the failed fetch');
  assert.equal(s.fetchError, "The remote repository isn't there, or this server's account can't see it.");
  w.cancel();
});

test('fetch every remote; clone one branch, shallow', async () => {
  const remote = await bare();
  const src = await repo({ 'a.txt': 'a\n' });
  await write(src, { 'b.txt': 'b\n' });
  commitAll(src, 'Second');
  sh(src, 'switch', '-q', '-c', 'dev');
  sh(src, 'remote', 'add', 'origin', remote.url);
  sh(src, 'push', '-q', 'origin', 'main', 'dev');
  sh(src, 'remote', 'add', 'mirror', remote.url);
  assert.equal((await run({ op: 'sync', repo: src, action: 'fetch', all: true })).error, null);
  assert.ok((await g.call<Branches>({ op: 'branches', repo: src })).remote.some((b) => b.name === 'mirror/dev'));
  const into = path.join(await folder(), 'shallow');
  assert.equal((await run({ op: 'clone', url: remote.url, into, branch: 'dev', depth: 1 })).error, null);
  const s = await status(into);
  assert.equal(s.branch, 'dev');
  assert.equal(sh(into, 'rev-list', '--count', 'HEAD').trim(), '1');
});
