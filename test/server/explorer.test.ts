// What Git gives Explorer: each file's status as a letter and a color (the
// pure mapping), and the calls the app makes for Explorer, with whole paths:
// decorations of a real repository (folders with changes, ignored files, a
// submodule's rows from its own status, nothing outside a repository) and
// Stage with Git.

import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { FileStatus, Status } from '../../src/shared/index.ts';
import { decorate, fileDecoration } from '../../src/server/lib/decorations.ts';
import { WIN, as, commitAll, folder, plugin, repo, sh, write } from './support.ts';

const g = await plugin();

const file = (p: string, o: Partial<FileStatus> = {}): FileStatus => ({ path: p, staged: null, worktree: null, untracked: false, conflict: null, mtime: 0, ...o });

test('each change as a letter and a color', () => {
  const pick = (f: FileStatus) => {
    const d = fileDecoration(f);
    return [d.badge, d.color];
  };
  assert.deepEqual(pick(file('a', { untracked: true })), ['U', 'untracked']);
  assert.deepEqual(pick(file('a', { staged: 'A' })), ['A', 'added']);
  assert.deepEqual(pick(file('a', { staged: 'A', worktree: 'M' })), ['A', 'added']);
  assert.deepEqual(pick(file('a', { worktree: 'M' })), ['M', 'modified']);
  assert.deepEqual(pick(file('a', { staged: 'T' })), ['M', 'modified']);
  assert.deepEqual(pick(file('a', { worktree: 'D' })), ['D', 'deleted']);
  assert.deepEqual(pick(file('a', { staged: 'M', worktree: 'D' })), ['D', 'deleted']);
  assert.deepEqual(pick(file('a', { staged: 'R', from: 'b' })), ['R', 'renamed']);
  assert.deepEqual(pick(file('a', { staged: 'C', from: 'b' })), ['R', 'renamed']);
  assert.deepEqual(pick(file('a', { staged: 'U', worktree: 'U', conflict: 'bothModified' })), ['!', 'conflict']);
  // The title says how it stands.
  assert.equal(fileDecoration(file('a', { staged: 'M', worktree: 'M' })).title, 'Modified, staged, with more changes not staged');
  assert.equal(fileDecoration(file('a', { worktree: 'M' })).title, 'Modified, not staged');
  assert.equal(fileDecoration(file('a', { staged: 'R', from: 'old.txt' })).title, 'Renamed from old.txt, staged');
  assert.equal(fileDecoration(file('sub', { worktree: 'M', submodule: true })).title, 'Submodule: changed, not staged');
  assert.equal(fileDecoration(file('a', { staged: 'U', worktree: 'U', conflict: 'bothModified' })).title, 'Conflict: changed on both sides');
});

test('the paths asked about: files, folders with changes inside, ignored ones; the rest left out', () => {
  const files = [file('src/a.ts', { worktree: 'M' }), file('src/deep/b.ts', { untracked: true }), file('new/x.txt', { untracked: true }), file('bad/c.txt', { staged: 'U', worktree: 'U', conflict: 'bothAdded' }), file('nested/', { untracked: true })];
  const wanted = ['src', 'src/a.ts', 'src/deep', 'new', 'bad', 'clean.txt', 'dist', 'nested'].map((rel) => ({ path: `/r/${rel}`, rel }));
  const out = decorate(files, wanted, new Set(['dist', 'src/a.ts']));
  assert.deepEqual(Object.keys(out).sort(), ['/r/bad', '/r/dist', '/r/nested', '/r/new', '/r/src', '/r/src/a.ts', '/r/src/deep']);
  assert.deepEqual(out['/r/src'], { badge: '•', color: 'modified', title: '2 changed files inside', faded: false });
  assert.deepEqual(out['/r/src/deep'], { badge: '•', color: 'untracked', title: '1 changed file inside', faded: false });
  assert.equal(out['/r/bad'].color, 'conflict');
  assert.equal(out['/r/bad'].title, '1 changed file inside, 1 conflict');
  assert.deepEqual(out['/r/dist'], { color: 'ignored', faded: true, title: 'Ignored by Git' });
  // A changed file isn't faded for being ignored too (a tracked file never is).
  assert.equal(out['/r/src/a.ts'].badge, 'M');
  // A nested repository's folder (`nested/`): untracked.
  assert.equal(out['/r/nested'].badge, 'U');
});

test('explorerDecorations: a real repository, by whole paths; outside one, nothing', async () => {
  const dir = await repo({ 'a.txt': 'a\n', 'src/b.txt': 'b\n', '.gitignore': 'dist/\n' });
  await write(dir, { 'a.txt': 'A\n', 'src/new.txt': 'n\n', 'dist/out.js': 'x', 'staged.txt': 's\n' });
  sh(dir, 'add', 'staged.txt');
  const p = (rel: string) => `${as(dir)}/${rel}`;
  const paths = ['a.txt', 'src', 'src/b.txt', 'src/new.txt', 'dist', 'staged.txt', '.gitignore'].map(p);
  const out = await g.call({ op: 'explorerDecorations', point: 'explorer.decorations', server: null, folder: as(dir), paths });
  assert.deepEqual(Object.keys(out).sort(), [p('a.txt'), p('dist'), p('src'), p('src/new.txt'), p('staged.txt')].sort());
  assert.deepEqual([out[p('a.txt')].badge, out[p('a.txt')].color], ['M', 'modified']);
  assert.deepEqual([out[p('src/new.txt')].badge, out[p('src/new.txt')].color], ['U', 'untracked']);
  assert.deepEqual([out[p('staged.txt')].badge, out[p('staged.txt')].color], ['A', 'added']);
  assert.equal(out[p('src')].badge, '•');
  assert.deepEqual(out[p('dist')], { color: 'ignored', faded: true, title: 'Ignored by Git' });

  // Outside a repository, and paths that aren't: an empty answer, not an error.
  const plain = await folder();
  await writeFile(path.join(plain, 'x.txt'), 'x');
  assert.deepEqual(await g.call({ op: 'explorerDecorations', folder: as(plain), paths: [`${as(plain)}/x.txt`, 'relative', 3, `${as(plain)}/gone/y`] }), {});
  assert.deepEqual(await g.call({ op: 'explorerDecorations', folder: as(plain) }), {});
});

test('explorerDecorations: a repository reached through a link (as macOS’s /tmp is)', { skip: WIN && 'links need rights on Windows' }, async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  await write(dir, { 'a.txt': 'A\n' });
  const link = path.join(await folder(), 'link');
  await symlink(dir, link);
  const out = await g.call({ op: 'explorerDecorations', folder: link, paths: [`${link}/a.txt`] });
  assert.equal(out[`${link}/a.txt`]?.badge, 'M');
});

test('explorerDecorations: a submodule’s rows from its own status', async () => {
  const inner = await repo({ 'in.txt': 'i\n' });
  const dir = await repo({ 'top.txt': 't\n' });
  sh(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'mod');
  commitAll(dir, 'the submodule');
  await writeFile(path.join(dir, 'mod', 'in.txt'), 'changed\n');
  const p = (rel: string) => `${as(dir)}/${rel}`;
  const out = await g.call({ op: 'explorerDecorations', folder: as(dir), paths: [p('mod'), p('mod/in.txt'), p('top.txt')] });
  // The submodule, from the top's status; the file in it, from its own.
  assert.equal(out[p('mod')].badge, 'M');
  assert.match(out[p('mod')].title, /^Submodule/);
  assert.deepEqual([out[p('mod/in.txt')].badge, out[p('mod/in.txt')].color], ['M', 'modified']);
  assert.equal(out[p('top.txt')], undefined);
});

test('explorerStage stages what Explorer chose, and says so', async () => {
  const dir = await repo({ 'a.txt': 'a\n' });
  await write(dir, { 'a.txt': 'A\n', 'b.txt': 'b\n', 'sub/c.txt': 'c\n' });
  const p = (rel: string) => `${as(dir)}/${rel}`;
  assert.deepEqual(await g.call({ op: 'explorerStage', point: 'explorer.menus', server: null, folder: as(dir), paths: [p('a.txt'), p('b.txt')] }), { message: 'Staged 2 files.' });
  let s = await g.call<Status>({ op: 'status', repo: dir });
  assert.deepEqual(
    s.files.map((f) => [f.path, f.staged, f.untracked]),
    [
      ['a.txt', 'M', false],
      ['b.txt', 'A', false],
      ['sub/c.txt', null, true],
    ],
  );
  // One file: by name; a folder stages what's in it.
  assert.deepEqual(await g.call({ op: 'explorerStage', folder: as(dir), paths: [p('sub')] }), { message: 'Staged sub.' });
  s = await g.call<Status>({ op: 'status', repo: dir });
  assert.equal(s.files.find((f) => f.path === 'sub/c.txt')?.staged, 'A');
  // The decorations see it at once (the kept status is dropped).
  const out = await g.call({ op: 'explorerDecorations', folder: as(dir), paths: [p('sub/c.txt')] });
  assert.equal(out[p('sub/c.txt')].badge, 'A');

  // Outside a repository: told, as an error.
  const plain = await folder();
  await mkdir(path.join(plain, 'x'));
  assert.deepEqual(await g.call({ op: 'explorerStage', folder: as(plain), paths: [`${as(plain)}/x`] }), { message: 'That isn’t in a Git repository.', error: true });
});
