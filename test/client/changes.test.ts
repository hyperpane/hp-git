// The Git window on real repositories, with the real server part in this
// process: Changes lists what changed, a file's diff shows, lines and hunks
// stage one by one (by the keyboard too), files stage and discard, and the
// commit box commits (⌘↵) and takes it back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { button, click, folder, key, open, pointer, read, realPart, repo, sh, type, until, wait, write } from './support/frame.ts';

const { GitWindow } = await import('../../src/client/app/GitWindow.tsx');

async function window(t: { after(fn: () => void): void }, dir: string, o: { settings?: Record<string, unknown> } = {}) {
  const { part, trash } = await realPart(t, dir);
  const f = await open(GitWindow as never, { folder: dir, part, settings: o.settings });
  t.after(() => f.close());
  await until(() => f.root.querySelector('[data-git]'), 10000, 'the repository');
  return { ...f, trash };
}

const fileRow = (root: HTMLElement, side: string, path: string) => root.querySelector<HTMLElement>(`[data-side="${side}"][data-file="${path}"] > div`);

test('Changes lists changed, staged and untracked files; the title says where', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\ntwo\nthree\n', 'src/b.ts': 'export const b = 1;\n' });
  write(dir, { 'a.txt': 'one\nTWO\nthree\n', 'new.md': '# new\n' });
  sh(dir, 'add', 'a.txt');
  write(dir, { 'src/b.ts': 'export const b = 2;\n' });
  const w = await window(t, dir);
  await until(() => fileRow(w.root, 'staged', 'a.txt') && fileRow(w.root, 'unstaged', 'src/b.ts') && fileRow(w.root, 'untracked', 'new.md'), 10000, 'the files');
  const name = dir.slice(dir.lastIndexOf('/') + 1);
  await until(() => w.app.last('window.setTitle')?.title === `${name} · main`);
  // The tab counts them; the toolbar names the branch.
  assert.match(w.root.querySelector('[data-tab="changes"]')!.textContent!, /3/);
  assert.match(w.root.textContent!, /Current branch\s*main/);
  // The status came from the watch, with line counts.
  await until(() => w.app.ops('watch').some((r) => r.stats === true), 15000);
});

test('a file’s diff shows; a line picked in it stages alone, a hunk unstages whole', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\nlet two = 2;\nthree\nfour\n' });
  write(dir, { 'a.txt': 'one\nlet TWO = 2;\nthree\nFOUR\n' });
  const w = await window(t, dir);
  click(await until(() => fileRow(w.root, 'unstaged', 'a.txt')));
  // The diff: two hunks' worth of lines in one (context 3), words marked.
  const pane = await until(() => w.root.querySelector<HTMLElement>('[data-diff="a.txt"]'), 10000, 'the diff');
  await until(() => pane.textContent!.includes('TWO') && pane.textContent!.includes('FOUR'));
  assert.ok(pane.querySelector('.git-word-added'));
  // Pick the + line with TWO (its gutter), then Space stages it.
  const rows = [...pane.querySelectorAll<HTMLElement>('[data-row]')];
  const two = rows.find((r) => r.textContent!.includes('let TWO'))!;
  const minus = rows.find((r) => r.textContent!.includes('let two'))!;
  pointer(minus.querySelector('[title^="Pick this line"]')!, 'pointerdown');
  pointer(two.querySelector('[title^="Pick this line"]')!, 'pointerdown', { shiftKey: true });
  await until(() => w.root.textContent!.includes('2 lines picked'), 8000, () => `2 picked: ${pane.isConnected} ${[...pane.querySelectorAll('[data-row]')].map((r) => r.textContent).join(' | ')} :: ${minus.isConnected} ${two.isConnected}`);
  key(pane, ' ');
  await until(() => sh(dir, 'diff', '--cached').includes('+let TWO'), 10000, `the staged line (${JSON.stringify(w.app.calls('app.toast'))})`);
  assert.ok(!sh(dir, 'diff', '--cached').includes('FOUR'));
  assert.ok(sh(dir, 'diff').includes('+FOUR'));
  // Now a.txt is in both sections; its staged side unstages by the hunk.
  click(await until(() => fileRow(w.root, 'staged', 'a.txt'), 10000, 'the staged side'));
  const staged = await until(() => {
    const p = w.root.querySelector<HTMLElement>('[data-diff="a.txt"]');
    return p && p.textContent!.includes('Unstage hunk') && p;
  });
  click(button(staged, 'Unstage hunk')!);
  await until(() => sh(dir, 'diff', '--cached') === '', 10000, 'nothing staged');
});

test('checkboxes stage and unstage files; discarding asks, then the file goes back (and to the Trash)', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n', 'b.txt': 'b\n' });
  write(dir, { 'a.txt': 'a2\n', 'b.txt': 'b2\n' });
  const w = await window(t, dir);
  const row = await until(() => fileRow(w.root, 'unstaged', 'a.txt'));
  click(row.querySelector('[role="checkbox"]')!);
  await until(() => sh(dir, 'diff', '--cached', '--name-only').trim() === 'a.txt');
  click((await until(() => fileRow(w.root, 'staged', 'a.txt'))).querySelector('[role="checkbox"]')!);
  await until(() => sh(dir, 'diff', '--cached', '--name-only').trim() === '');
  // Discard b.txt from its menu: the app's confirm (accepted), then gone.
  w.app.answers['ui.menu'] = (a: { items: { id: string; label: string }[] }) => a.items.find((i) => i.label.startsWith('Discard'))?.id ?? null;
  const b = await until(() => fileRow(w.root, 'unstaged', 'b.txt'));
  b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await until(() => read(dir, 'b.txt') === 'b\n', 10000, 'b.txt discarded');
  const confirm = w.app.last('ui.confirm');
  assert.equal(confirm.title, 'Discard the changes to b.txt?');
  assert.equal(confirm.destructive, true);
  assert.match(confirm.message, /Trash/);
  // The menu had the rest too.
  const labels = w.app.last('ui.menu').items.map((i: { label: string }) => i.label);
  for (const l of ['Stage', 'File History', 'Blame', 'Copy Path', 'Open in Editor', 'Reveal in Explorer', 'Open Terminal Here']) assert.ok(labels.includes(l), l);
});

test('the commit box commits the staged files with ⌘↵, then the commit can be undone', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' });
  write(dir, { 'a.txt': 'a2\n' });
  sh(dir, 'add', 'a.txt');
  const w = await window(t, dir);
  const summary = await until(() => w.root.querySelector<HTMLInputElement>('input[aria-label="Summary"]'));
  await until(() => w.root.textContent!.includes('Commit 1 file to main'));
  type(summary, 'Change a');
  type(w.root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]')!, 'Because.');
  // ⌘↵ by the physical key, whatever the layout.
  key(summary, 'Enter', { code: 'Enter', metaKey: true });
  await until(() => sh(dir, 'log', '-1', '--format=%s|%b').trim() === 'Change a|Because.', 10000, 'the commit');
  await until(() => w.root.textContent!.includes('Committed'));
  assert.equal(summary.value, '');
  click(button(w.root, 'Undo')!);
  await until(() => sh(dir, 'log', '-1', '--format=%s').trim() === 'first', 10000, 'undone');
  await until(() => summary.value === 'Change a');
  assert.equal(sh(dir, 'diff', '--cached', '--name-only').trim(), 'a.txt');
});

test('nothing staged: the button commits every change; amend shows what it amends', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' }, 'the first one');
  write(dir, { 'a.txt': 'a2\n' });
  const w = await window(t, dir);
  await until(() => w.root.textContent!.includes('Nothing is staged.'));
  type(await until(() => w.root.querySelector<HTMLInputElement>('input[aria-label="Summary"]')), 'All of it');
  click(await until(() => button(w.root, /Commit all 1 change/)));
  await until(() => sh(dir, 'log', '-1', '--format=%s').trim() === 'All of it', 10000, 'commit all');
  await until(() => w.root.textContent!.includes('Committed'));
  click(await until(() => button(w.root, /Amend/)));
  await until(() => w.root.textContent!.includes('Amending'), 10000, 'amending');
  assert.equal(w.root.querySelector<HTMLInputElement>('input[aria-label="Summary"]')!.value, 'All of it');
});

test('the keyboard: ↓ moves through the files, Space stages them, ⌘F (in any layout) filters', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n', 'b.txt': 'b\n' });
  write(dir, { 'a.txt': 'a2\n', 'b.txt': 'b2\n' });
  const w = await window(t, dir);
  const list = await until(() => w.root.querySelector<HTMLElement>('[aria-label="Changed files"]'));
  await until(() => fileRow(w.root, 'unstaged', 'b.txt'));
  list.focus();
  key(list, 'ArrowDown');
  key(list, 'ArrowDown');
  await until(() => w.root.querySelector('[data-diff-pane="b.txt"]'), 10000, () => `b.txt picked: ${w.root.textContent}`);
  key(list, ' ');
  await until(() => sh(dir, 'diff', '--cached', '--name-only').trim() === 'b.txt', 10000, 'b staged');
  // ⌘F with ЙЦУКЕН: the key marked F types а.
  key(window_(), 'а', { code: 'KeyF', metaKey: true });
  await wait(50);
  const filter = w.root.querySelector<HTMLInputElement>('input[placeholder^="Filter"]')!;
  assert.equal(document.activeElement, filter);
  type(filter, 'a.t');
  await until(() => !fileRow(w.root, 'staged', 'b.txt') && fileRow(w.root, 'unstaged', 'a.txt'));
});

const window_ = () => globalThis.window as unknown as Window;

test('a repository that changes outside the window follows by itself', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' });
  const w = await window(t, dir);
  await until(() => w.root.textContent!.includes('No local changes'));
  write(dir, { 'c.txt': 'new\n' });
  await until(() => fileRow(w.root, 'untracked', 'c.txt'), 15000, 'the new file');
  void folder;
});
