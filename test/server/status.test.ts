// Status (porcelain v2 -z), finding repositories, init, and the watch.

import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { invoke, stream } from '@hyperpane/sdk/testing';
import { parseStatus } from '../../src/server/lib/parse-status.ts';
import { explain } from '../../src/server/lib/explain.ts';
import { findGit, gitFallbacks } from '../../src/server/lib/find-git.ts';
import type { Found, Status } from '../../src/shared/index.ts';
import { as, commitAll, folder, plugin, repo, sh, until, write } from './support.ts';

const g = await plugin();

test('porcelain v2 parses: headers, changes, renames, conflicts, untracked', () => {
  const out =
    '# branch.oid 1234\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0# stash 3\0' +
    '1 .M N... 100644 100644 100644 aaa aaa src/a b.rs\0' +
    '1 A. N... 000000 100644 100644 000 bbb new.txt\0' +
    '1 MM N... 100644 100644 100644 aaa bbb both.txt\0' +
    '2 R. N... 100644 100644 100644 aaa aaa R100 to name.txt\0from name.txt\0' +
    'u UU N... 100644 100644 100644 100644 a b c conflict.txt\0' +
    'u DU N... 100644 000000 100644 100644 a b c deleted by us.txt\0' +
    '1 .M S.M. 160000 160000 160000 aaa aaa sub\0' +
    '? untracked dir/file.txt\0';
  const s = parseStatus(out);
  assert.equal(s.head, '1234');
  assert.equal(s.branch, 'main');
  assert.equal(s.upstream, 'origin/main');
  assert.deepEqual([s.ahead, s.behind, s.stashes, s.upstreamGone], [2, 1, 3, false]);
  assert.deepEqual(
    s.files.map((f) => [f.path, f.staged, f.worktree, f.untracked, f.conflict]),
    [
      ['src/a b.rs', null, 'M', false, null],
      ['new.txt', 'A', null, false, null],
      ['both.txt', 'M', 'M', false, null],
      ['to name.txt', 'R', null, false, null],
      ['conflict.txt', 'U', 'U', false, 'bothModified'],
      ['deleted by us.txt', 'U', 'U', false, 'deletedByUs'],
      ['sub', null, 'M', false, null],
      ['untracked dir/file.txt', null, null, true, null],
    ],
  );
  assert.equal(s.files[3].from, 'from name.txt');
  assert.equal(s.files[6].submodule, true);
  const d = parseStatus('# branch.oid abc\0# branch.head (detached)\0');
  assert.ok(d.detached && d.branch === null);
  const u = parseStatus('# branch.oid (initial)\0# branch.head main\0# branch.upstream origin/main\0');
  assert.ok(u.unborn && u.upstreamGone && u.head === null);
  const many = parseStatus(Array.from({ length: 5 }, (_, i) => `? f${i}\0`).join(''), 3);
  assert.equal(many.files.length, 3);
  assert.equal(many.truncated, true);
});

test('status of a real repository: staged, unstaged, untracked, renamed, stats', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'b.txt': 'b\n', 'old name.txt': 'same\nsame\nsame\n' });
  await write(dir, { 'a.txt': 'a\nmore\n', 'c.txt': 'new\nfile\n', 'b.txt': 'B\n' });
  sh(dir, 'add', 'b.txt');
  sh(dir, 'mv', 'old name.txt', 'new name.txt');
  const s = await g.call<Status>({ op: 'status', repo: dir, stats: true });
  assert.equal(s.root, as(dir));
  assert.equal(s.branch, 'main');
  assert.match(s.head!, /^[0-9a-f]{40}$/);
  assert.equal(s.operation, null);
  assert.deepEqual(s.identity, { name: 'Ada Lovelace', email: 'ada@example.com' });
  const by = Object.fromEntries(s.files.map((f) => [f.path, f]));
  assert.equal(by['a.txt'].worktree, 'M');
  assert.equal(by['a.txt'].staged, null);
  assert.deepEqual([by['a.txt'].additions, by['a.txt'].deletions], [1, 0]);
  assert.equal(by['b.txt'].staged, 'M');
  assert.equal(by['c.txt'].untracked, true);
  assert.equal(by['c.txt'].additions, 2);
  assert.equal(by['new name.txt'].staged, 'R');
  assert.equal(by['new name.txt'].from, 'old name.txt');
  assert.ok(by['a.txt'].mtime > 0);
  // From a folder inside it, the same repository.
  await mkdir(path.join(dir, 'deep', 'er'), { recursive: true });
  assert.equal((await g.call<Status>({ op: 'status', repo: path.join(dir, 'deep', 'er') })).root, as(dir));
});

test('an empty repository, a detached HEAD, and a gone upstream', async () => {
  const dir = await repo();
  await write(dir, { 'x.txt': 'x\n' });
  let s = await g.call<Status>({ op: 'status', repo: dir });
  assert.equal(s.unborn, true);
  assert.equal(s.head, null);
  assert.equal(s.branch, 'main');
  assert.equal(s.files[0].untracked, true);
  const first = commitAll(dir, 'first');
  await write(dir, { 'y.txt': 'y\n' });
  commitAll(dir, 'second');
  sh(dir, 'switch', '-q', '--detach', first);
  s = await g.call<Status>({ op: 'status', repo: dir });
  assert.equal(s.detached, true);
  assert.equal(s.branch, null);
  assert.equal(s.head, first);
});

test('says what’s wrong with a path plainly', async () => {
  const dir = await folder();
  await assert.rejects(g.call({ op: 'status', repo: dir }), { message: `${as(dir)} isn't in a Git repository.` });
  await assert.rejects(g.call({ op: 'status', repo: path.join(dir, 'nope') }), { message: `${as(path.join(dir, 'nope'))} isn't there.` });
  await assert.rejects(g.call({ op: 'status', repo: 'relative/x' }), { message: "relative/x isn't a whole path." });
  await assert.rejects(g.call({ op: 'status' }), { message: 'Which repository? No path was given.' });
  await assert.rejects(g.call({ op: 'stage', repo: (await repo({ a: 'a' })), paths: ['../outside'] }), { message: "../outside isn't a path in the repository." });
});

test('finds the repository, its submodules and nested ones; inits one', async () => {
  const outer = await repo({ 'a.txt': 'a\n' });
  const lib = await repo({ 'lib.txt': 'l\n' });
  sh(outer, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'vendor/lib');
  commitAll(outer, 'with a submodule');
  const nested = path.join(outer, 'tools', 'inner');
  await mkdir(nested, { recursive: true });
  sh(nested, 'init', '-q', '-b', 'main');
  await mkdir(path.join(outer, 'node_modules', 'pkg'), { recursive: true });
  sh(path.join(outer, 'node_modules', 'pkg'), 'init', '-q');
  const found = await g.call<Found>({ op: 'find', path: path.join(outer, 'a.txt') });
  assert.equal(found.root, as(outer));
  assert.equal(found.gitDir, as(path.join(outer, '.git')));
  assert.deepEqual(
    found.repos.map((r) => [r.kind, r.name]),
    [
      ['main', path.basename(outer)],
      ['submodule', 'vendor/lib'],
      ['nested', 'tools/inner'],
    ],
  );
  // A submodule's own status.
  const sub = await g.call<Status>({ op: 'status', repo: path.join(outer, 'vendor', 'lib') });
  assert.equal(sub.root, as(path.join(outer, 'vendor', 'lib')));
  // Not a repository: null, but what's inside is listed.
  const plain = await folder();
  await mkdir(path.join(plain, 'one'));
  sh(path.join(plain, 'one'), 'init', '-q');
  const none = await g.call<Found>({ op: 'find', path: plain });
  assert.equal(none.root, null);
  assert.deepEqual(none.repos.map((r) => r.name), ['one']);
  // Init: the default branch setting, or the one asked for.
  const fresh = await folder();
  assert.deepEqual(await g.call({ op: 'init', path: fresh, branch: 'trunk' }), { root: as(fresh) });
  assert.equal((await g.call<Status>({ op: 'status', repo: fresh })).branch, 'trunk');
  await assert.rejects(g.call({ op: 'init', path: path.join(fresh, 'missing') }), { message: `${as(path.join(fresh, 'missing'))} isn't a folder.` });
});

test('version: the git it runs; findGit looks on PATH, then the usual places', async () => {
  const v = await g.call<{ path: string; version: string }>({ op: 'version' });
  assert.match(v.version, /^git version /);
  assert.ok(v.path.length > 0);
  assert.deepEqual(gitFallbacks({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32'), [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Users\\me\\AppData\\Local\\Programs\\Git\\cmd\\git.exe',
  ]);
  assert.deepEqual(gitFallbacks({}, 'darwin'), ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']);
  assert.equal(await findGit('', { PATH: '/nowhere' }, process.platform, []), null);
  assert.equal(await findGit('/nowhere/git'), null);
  const bad = await plugin({ settings: { gitPath: '/nowhere/git' } });
  await assert.rejects(bad.call({ op: 'status', repo: await repo({ a: 'a' }) }), { message: "Git isn't at /nowhere/git (the Git executable setting)." });
});

test('git’s complaints, put plainly', () => {
  assert.match(explain("fatal: could not read Username for 'https://github.com': terminal prompts disabled\n"), /^The remote wants a username and password/);
  assert.match(explain('git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n'), /SSH key/);
  assert.equal(explain('ssh: Could not resolve hostname nowhere.example: nodename nor servname provided\n'), "Couldn't reach nowhere.example: is the network up?");
  assert.equal(explain(' ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs\n'), "The remote has commits this branch doesn't have. Pull first, then push.");
  assert.equal(explain('error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\nPlease commit\n'), 'Your changes to a.txt would be overwritten. Commit or stash them first.');
  assert.equal(explain('fatal: something odd happened\nhint: try this\n'), 'Something odd happened.');
  assert.equal(explain(''), 'Git failed.');
});

test('the watch: the status at once, again on each change, debounced', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  const w = stream<Status>(g.plugin, { op: 'watch', repo: dir });
  const first = await w.next();
  assert.equal(first.files.length, 0);
  // Many writes at once: one status (or two), not one per write.
  for (let i = 0; i < 20; i++) await writeFile(path.join(dir, `f${i}.txt`), `${i}\n`);
  let s = await w.next();
  while (s.files.length < 20) s = await w.next();
  assert.equal(s.files.length, 20);
  // A change made through the plugin is seen at once (no waiting for files).
  const changed = g.bus.next('git.changed');
  await g.call({ op: 'stage', repo: dir, paths: ['f0.txt'] });
  s = await w.next();
  assert.equal(s.files.find((f) => f.path === 'f0.txt')?.staged, 'A');
  assert.deepEqual((await changed).data, { repo: as(dir), branch: 'main', head: first.head });
  // A commit from outside (a terminal) moves HEAD: seen too.
  sh(dir, 'commit', '-q', '-m', 'from a terminal');
  await until(async () => {
    s = await w.next();
    return s.head !== first.head;
  });
  // A file removed from outside.
  await rm(path.join(dir, 'f1.txt'));
  await until(async () => {
    s = await w.next();
    return !s.files.some((f) => f.path === 'f1.txt');
  });
  w.cancel();
  assert.equal(await w.end, null);
});

test('answers git.status requests on the bus', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  const p = await plugin({ projects: [{ id: 'p1', name: 'app', folder: dir }] });
  await write(dir, { 'b.txt': 'b\n' });
  const s = (await p.bus.request('git.status', {}, { project: 'p1' })) as Status;
  assert.equal(s.root, as(dir));
  assert.equal(s.files[0].path, 'b.txt');
  const byPath = (await p.bus.request('git.status', { path: path.join(dir, 'a.txt') }, { project: 'p1' })) as Status;
  assert.equal(byPath.branch, 'main');
  assert.ok(invoke);
});
