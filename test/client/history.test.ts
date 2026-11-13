// History, Branches, Stashes and Tags, and the views opened over them (a
// commit, a file's history, blame), on real repositories with the real
// server part: the graph and its pages, a commit's details and diffs,
// actions through the app's menus and dialogs, all inside the window.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { button, click, key, open, realPart, repo, sh, until, wait, write } from './support/frame.ts';

const { GitWindow } = await import('../../src/client/app/GitWindow.tsx');

async function window(t: { after(fn: () => void): void }, dir: string) {
  const { part } = await realPart(t, dir);
  const f = await open(GitWindow as never, { folder: dir, part });
  t.after(() => f.close());
  await until(() => f.root.querySelector('[data-git]'), 10000, 'the repository');
  return f;
}

const tab = (root: HTMLElement, id: string) => click(root.querySelector(`[data-tab="${id}"]`)!);
const commitRow = (root: HTMLElement, subject: string) => [...root.querySelectorAll<HTMLElement>('[data-sha] > div')].find((r) => r.textContent!.includes(subject));
/** Answers the next menu with the item labelled so. */
const choose = (app: { answers: Record<string, (a: any) => unknown> }, label: string | RegExp) =>
  (app.answers['ui.menu'] = (a: { items: { id: string; label: string }[] }) => a.items.find((i) => (typeof label === 'string' ? i.label === label : label.test(i.label)))?.id ?? null);

/** A repository with a merged branch: main has m1, m2; feature f1 merged as m3. */
function branchy(t: { after(fn: () => void): void }) {
  const dir = repo(t, { 'a.txt': 'one\n' }, 'm1');
  sh(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, { 'f.txt': 'feature\n' });
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'f1');
  sh(dir, 'checkout', '-q', 'main');
  write(dir, { 'a.txt': 'one\ntwo\n' });
  sh(dir, 'commit', '-q', '-am', 'm2');
  sh(dir, 'merge', '-q', '--no-ff', '-m', 'm3 merge feature', 'feature');
  sh(dir, 'tag', 'v1');
  return dir;
}

test('History: commits with the graph and their refs; a commit’s details, files and diff', async (t) => {
  const dir = branchy(t);
  const w = await window(t, dir);
  tab(w.root, 'history');
  await until(() => commitRow(w.root, 'm3 merge feature') && commitRow(w.root, 'f1') && commitRow(w.root, 'm1'), 10000, 'the commits');
  // The graph: a merge drawn hollow, two lanes; refs as badges.
  const m3 = commitRow(w.root, 'm3 merge feature')!;
  assert.ok(m3.querySelector('svg circle'));
  assert.match(m3.textContent!, /main/);
  assert.match(m3.textContent!, /v1/);
  assert.ok(commitRow(w.root, 'f1')!.querySelectorAll('svg path').length >= 2);
  // The first commit is picked: its details on the right.
  const details = await until(() => w.root.querySelector<HTMLElement>('[data-commit]'), 10000, 'the details');
  assert.match(details.textContent!, /m3 merge feature/);
  assert.match(details.textContent!, /Ada Lovelace/);
  assert.match(details.textContent!, /Merges/);
  // m2: its file and diff.
  click(commitRow(w.root, 'm2')!);
  await until(() => w.root.querySelector('[data-commit-files]')?.textContent?.includes('a.txt') && w.root.querySelector('[data-diff="a.txt"]')?.textContent?.includes('two'), 10000, 'm2’s diff');
  // Its parent opens over the tabs; Back comes back.
  const parent = [...w.root.querySelectorAll<HTMLButtonElement>('[data-commit] button')].find((b) => b.title.startsWith('Open '))!;
  click(parent);
  await until(() => w.root.querySelector('[data-view="commit"]')?.textContent?.includes('m1'), 10000, 'the parent');
  key(globalThis.window as unknown as Window, '[', { code: 'BracketLeft', metaKey: true });
  await until(() => !w.root.querySelector('[data-view]') && w.root.querySelector('[data-tab="history"][aria-selected="true"]'));
});

test('History: a commit’s co-authors stacked with its author, everyone named; its message folds away for the diff, and stays folded', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\n' }, 'm1');
  write(dir, { 'a.txt': 'one\ntwo\n' });
  sh(dir, 'commit', '-q', '-am', 'Pair on a\n\nWhy.\n\nCo-authored-by: Grace Hopper <grace@example.com>\nCo-authored-by: Alan Turing <alan@example.com>');
  const w = await window(t, dir);
  tab(w.root, 'history');
  const pair = await until(() => commitRow(w.root, 'Pair on a'), 10000, 'the commits');
  const stack = pair.querySelector<HTMLElement>('[data-authors]')!;
  assert.equal(stack.dataset.authors, '3');
  assert.equal(stack.textContent, 'ALGHAT');
  assert.equal(stack.title, 'Ada Lovelace <ada@example.com>\nGrace Hopper <grace@example.com>\nAlan Turing <alan@example.com>');
  assert.match(pair.title, /Ada Lovelace and 2 others/);
  // A commit of one author: one circle.
  assert.equal(commitRow(w.root, 'm1')!.querySelector('[data-authors]'), null);
  // The details name them all.
  const details = await until(() => w.root.querySelector<HTMLElement>('[data-commit] [data-commit-header="open"]'), 10000, 'the details');
  await until(() => details.textContent!.includes('Ada Lovelace, Grace Hopper and Alan Turing'), 10000, 'every author');
  assert.match(details.textContent!, /Why\./);
  // Folded: one line, the message and the rest gone; the diff has the room. Remembered.
  click(button(details, 'Hide the message')!);
  const folded = await until(() => w.root.querySelector<HTMLElement>('[data-commit-header="folded"]'), 10000, 'folded');
  assert.match(folded.textContent!, /Pair on a/);
  assert.doesNotMatch(folded.textContent!, /Why\./);
  assert.ok(folded.querySelector('[data-authors="3"]'));
  click(commitRow(w.root, 'm1')!);
  await until(() => w.root.querySelector('[data-commit-header="folded"]')?.textContent?.includes('m1'), 10000, 'still folded for m1');
  click(button(w.root.querySelector('[data-commit-header="folded"]')!, 'Show the message')!);
  await until(() => w.root.querySelector('[data-commit-header="open"]'), 10000, 'open again');
});

test('History pages in as it scrolls, and searches by message, author, SHA and path', async (t) => {
  const dir = repo(t, { 'a.txt': '0\n' }, 'c0');
  for (let i = 1; i <= 340; i++) {
    write(dir, { 'a.txt': `${i}\n`, ...(i % 100 === 0 ? { [`dir/p${i}.txt`]: 'x\n' } : {}) });
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-q', '-m', `c${i}${i === 77 ? ' needle' : ''}`);
  }
  const w = await window(t, dir);
  tab(w.root, 'history');
  // (Slow while the whole suite runs at once: the first watch writes git's commit-graph.)
  await until(() => w.root.textContent!.includes('300+ commits'), 20000, 'the first page');
  // The end of the list in view: the next page.
  const list = w.root.querySelector<HTMLElement>('[aria-label="Commits"]')!;
  list.scrollTop = 300 * 26;
  list.dispatchEvent(new Event('scroll'));
  await until(() => w.root.textContent!.includes('341 commits'), 10000, 'the second page');
  assert.deepEqual(
    w.app.ops('log').map((r) => r.skip),
    [0, 300],
  );
  // Search: typing settles, then git is asked.
  const search = w.root.querySelector<HTMLInputElement>('input[placeholder^="Words in the message"]')!;
  const { type } = await import('./support/frame.ts');
  type(search, 'needle');
  await until(() => w.app.ops('log').some((r) => r.search === 'needle'));
  await until(() => commitRow(w.root, 'c77 needle') && w.root.textContent!.includes('1 commits'), 10000, 'the match');
  // By path: the mode menu.
  choose(w.app, 'Path');
  click(button(w.root, /^Message/)!);
  await wait(50);
  type(search, 'dir');
  await until(() => w.app.ops('log').some((r) => r.path === 'dir'));
  await until(() => commitRow(w.root, 'c300') && !commitRow(w.root, 'c299'), 10000, 'by path');
});

test('a file’s history and its blame open in the window, with a breadcrumb back', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\n' }, 'first');
  write(dir, { 'a.txt': 'one\ntwo\n' });
  sh(dir, 'commit', '-q', '-am', 'second');
  write(dir, { 'a.txt': 'one\ntwo\nthree\n' });
  const w = await window(t, dir);
  // From the diff's bar.
  const pane = await until(() => w.root.querySelector<HTMLElement>('[data-diff-pane="a.txt"]'), 10000, 'the diff');
  click(button(pane, 'File history')!);
  const view = await until(() => w.root.querySelector<HTMLElement>('[data-view="fileHistory"]'), 10000, 'file history');
  await until(() => view.textContent!.includes('second') && view.textContent!.includes('first'));
  assert.match(view.textContent!, /History of a\.txt/);
  // Its Blame: lines by commit, the uncommitted one marked.
  click(button(view, 'Blame')!);
  const blame = await until(() => w.root.querySelector<HTMLElement>('[data-blame="a.txt"]'), 10000, 'blame');
  await until(() => blame.textContent!.includes('Not committed yet') && blame.textContent!.includes('second') && blame.textContent!.includes('first'));
  // Back twice: history, then Changes.
  click(button(w.root, /^Back/)!);
  await until(() => w.root.querySelector('[data-view="fileHistory"]'));
  click(button(w.root, /^Back/)!);
  await until(() => !w.root.querySelector('[data-view]') && w.root.querySelector('[data-diff-pane="a.txt"]'));
  // Forward again.
  key(globalThis.window as unknown as Window, ']', { code: 'BracketRight', metaKey: true });
  await until(() => w.root.querySelector('[data-view="fileHistory"]'));
});

test('a commit’s menu: branch here (the app’s dialog), revert, reset hard (asked first)', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\n' }, 'first');
  write(dir, { 'a.txt': 'two\n' });
  sh(dir, 'commit', '-q', '-am', 'second');
  const w = await window(t, dir);
  tab(w.root, 'history');
  const first = await until(() => commitRow(w.root, 'first'), 10000, 'the commits');
  w.app.answers['ui.dialog'] = (a: { view: string }) => (a.view === 'branch' ? { name: 'from-first', checkout: false } : null);
  choose(w.app, 'Create Branch Here…');
  first.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await until(() => sh(dir, 'branch', '--list', 'from-first').includes('from-first'), 10000, 'the branch');
  assert.equal(w.app.last('ui.dialog').view, 'branch');
  // Revert second.
  choose(w.app, 'Revert This Commit');
  commitRow(w.root, 'second')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await until(() => sh(dir, 'log', '-1', '--format=%s').startsWith('Revert "second"'), 10000, 'the revert');
  // Reset hard to first: a menu of modes, then the confirm.
  await until(() => commitRow(w.root, 'Revert'));
  let menus = 0;
  w.app.answers['ui.menu'] = (a: { items: { id: string; label: string }[] }) => {
    menus++;
    return a.items.find((i) => (menus === 1 ? i.label === 'Reset to This Commit…' : i.label.startsWith('Hard')))?.id ?? null;
  };
  commitRow(w.root, 'first')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await until(() => sh(dir, 'log', '-1', '--format=%s').trim() === 'first', 10000, 'the reset');
  assert.equal(w.app.last('ui.confirm').title.startsWith('Reset hard'), true);
  assert.equal(w.app.last('ui.confirm').destructive, true);
});

test('Branches: local and remote with what they track; compare, check out, delete (asked)', async (t) => {
  const dir = branchy(t);
  sh(dir, 'branch', 'old');
  const w = await window(t, dir);
  tab(w.root, 'branches');
  const row = (name: string) => w.root.querySelector<HTMLElement>(`[data-branch="${name}"] > div`);
  await until(() => row('main') && row('feature') && row('old'), 10000, 'the branches');
  assert.match(row('main')!.textContent!, /current/);
  click(row('feature')!);
  const detail = await until(() => w.root.querySelector<HTMLElement>('[data-branch-detail="feature"]'), 10000, () => `feature: ${w.root.textContent}`);
  await until(() => detail.textContent!.includes('on main not on feature'), 10000, 'the compare');
  assert.match(detail.textContent!, /0 commits on feature not on main/);
  assert.match(detail.textContent!, /2 commits on main not on feature/);
  // Check out with Enter.
  w.root.querySelector<HTMLElement>('[aria-label="Branches"]')!.focus();
  key(w.root.querySelector<HTMLElement>('[aria-label="Branches"]')!, 'Enter');
  await until(() => sh(dir, 'branch', '--show-current').trim() === 'feature', 10000, 'checked out');
  await until(() => /current/.test(row('feature')?.textContent ?? ''), 10000, 'feature current');
  // Delete old from its menu.
  choose(w.app, 'Delete…');
  row('old')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await until(() => !sh(dir, 'branch', '--list', 'old').trim(), 10000, () => `deleted: ${JSON.stringify(w.app.calls('app.toast'))} ${JSON.stringify(w.app.logs)}`);
  assert.equal(w.app.last('ui.confirm').title, 'Delete old?');
});

test('the branch dropdown finds a branch as you type and switches with Enter', async (t) => {
  const dir = branchy(t);
  sh(dir, 'branch', 'zebra');
  const w = await window(t, dir);
  click(await until(() => [...w.root.querySelectorAll('button')].find((b) => b.textContent!.includes('Current branch'))));
  const input = await until(() => document.querySelector<HTMLInputElement>('input[placeholder="Find a branch"]'), 10000, 'the dropdown');
  await until(() => document.body.textContent!.includes('zebra'));
  const { type } = await import('./support/frame.ts');
  type(input, 'zeb');
  await wait(30);
  key(input, 'Enter');
  await until(() => sh(dir, 'branch', '--show-current').trim() === 'zebra', 10000, 'switched');
});

const stashList = (dir: string) => {
  try {
    return sh(dir, 'stash', 'list');
  } catch {
    return 'busy';
  }
};

test('Stashes: stash with the dialog, see its files, pop it', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' });
  write(dir, { 'a.txt': 'changed\n', 'new.txt': 'new\n' });
  const w = await window(t, dir);
  tab(w.root, 'stashes');
  w.app.answers['ui.dialog'] = (a: { view: string }) => (a.view === 'stash' ? { message: 'wip things', untracked: true, keepIndex: false } : null);
  click(await until(() => button(w.root, 'Stash 2 Changes'), 10000, 'the stash button'));
  await until(() => sh(dir, 'stash', 'list').includes('wip things'), 10000, 'stashed');
  const row = await until(() => w.root.querySelector<HTMLElement>('[data-stash="0"] > div'), 10000, 'the stash');
  assert.match(row.textContent!, /wip things/);
  await until(() => w.root.querySelector('[data-commit-files]')?.textContent?.includes('a.txt') && w.root.querySelector('[data-commit-files]')?.textContent?.includes('new.txt'), 10000, 'its files');
  click(button(w.root, 'Pop')!);
  // (Read while pop drops refs/stash, git can say it's a bad revision: not yet.)
  await until(() => !stashList(dir).trim(), 10000, 'popped');
  assert.equal(sh(dir, 'status', '--porcelain').trim().split('\n').length, 2);
});

test('Tags: make one with the dialog (annotated), see its commit, delete it', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' }, 'tagged one');
  const w = await window(t, dir);
  tab(w.root, 'tags');
  w.app.answers['ui.dialog'] = (a: { view: string }) => (a.view === 'tag' ? { name: 'v2.0', message: 'Release two' } : null);
  click(await until(() => button(w.root, 'Tag the Current Commit'), 10000, 'the tag button'));
  await until(() => sh(dir, 'tag', '-n').includes('Release two'), 10000, 'tagged');
  const row = await until(() => w.root.querySelector<HTMLElement>('[data-tag="v2.0"] > div'), 10000, 'the tag');
  assert.match(row.textContent!, /Release two/);
  await until(() => w.root.querySelector('[data-commit]')?.textContent?.includes('tagged one'), 10000, 'its commit');
  click(button(w.root, 'Delete')!);
  await until(() => !sh(dir, 'tag').trim(), 10000, 'deleted');
});
