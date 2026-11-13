// The Git window on real repositories, with the real server part in this
// process: every change checked for the next commit as it comes (as GitHub
// Desktop has it), files and lines unchecked left out, git's index left
// alone until Commit commits exactly what's checked; and staging by hand, Changes lists what changed, a file's diff shows,
// lines and hunks stage one by one (by the keyboard too), files stage and
// discard, and the commit box commits (⌘↵) and takes it back. A diff's code
// is text to select and copy.

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

/** The window with only what's staged by hand committed. */
const byHand = { settings: { includeChanges: false } };

const fileRow = (root: HTMLElement, side: string, path: string) => root.querySelector<HTMLElement>(`[data-side="${side}"][data-file="${path}"] > div`);

test('Changes lists changed, staged and untracked files; the title says where', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\ntwo\nthree\n', 'src/b.ts': 'export const b = 1;\n' });
  write(dir, { 'a.txt': 'one\nTWO\nthree\n', 'new.md': '# new\n' });
  sh(dir, 'add', 'a.txt');
  write(dir, { 'src/b.ts': 'export const b = 2;\n' });
  const w = await window(t, dir, byHand);
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
  const w = await window(t, dir, byHand);
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
  const w = await window(t, dir, byHand);
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

test('staging by hand, nothing staged: the button commits every change; amend shows what it amends', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' }, 'the first one');
  write(dir, { 'a.txt': 'a2\n' });
  const w = await window(t, dir, byHand);
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
  const w = await window(t, dir, byHand);
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
  const w = await window(t, dir, byHand);
  await until(() => w.root.textContent!.includes('No local changes'));
  write(dir, { 'c.txt': 'new\n' });
  await until(() => fileRow(w.root, 'untracked', 'c.txt'), 15000, 'the new file');
  void folder;
});

/** What's staged, by name, sorted. */
const cached = (dir: string) => sh(dir, 'diff', '--cached', '--name-only').split('\n').filter(Boolean).sort().join(' ');
const checkbox = (root: HTMLElement, side: string, path: string) => fileRow(root, side, path)?.querySelector<HTMLElement>('[role="checkbox"]');

const state = (root: HTMLElement, path: string) => checkbox(root, 'changes', path)?.getAttribute('aria-checked');
const summaryOf = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[aria-label="Summary"]');
const committedFiles = (dir: string) => sh(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort().join(' ');

test('every change is checked for the next commit, the index left alone; Commit commits exactly what’s checked', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n', 'b.txt': 'b\n' });
  write(dir, { 'a.txt': 'a2\n', 'b.txt': 'b2\n', 'c.md': '# c\n', 'staged.txt': 'by hand\n' });
  sh(dir, 'add', 'staged.txt');
  const w = await window(t, dir);
  // Each file once, checked: new ones, and one staged in a terminal.
  await until(() => ['a.txt', 'b.txt', 'c.md', 'staged.txt'].every((p) => state(w.root, p) === 'true'), 10000, 'all checked');
  assert.equal(w.root.querySelector('[data-side="staged"], [data-side="unstaged"], [data-side="untracked"]'), null);
  await wait(400);
  assert.equal(cached(dir), 'staged.txt');
  // b.txt unchecked stays out as it changes again; a new file comes in checked.
  click(checkbox(w.root, 'changes', 'b.txt')!);
  await until(() => state(w.root, 'b.txt') === 'false', 10000, 'b.txt out');
  write(dir, { 'b.txt': 'b3\n', 'd.txt': 'new\n' });
  await until(() => state(w.root, 'd.txt') === 'true', 15000, 'd.txt in');
  assert.equal(state(w.root, 'b.txt'), 'false');
  assert.equal(cached(dir), 'staged.txt');
  // Commit: what's checked, and nothing else; git's index has nothing committed left in it.
  await until(() => w.root.textContent!.includes('Commit 4 files to main'), 10000, 'four to commit');
  type(summaryOf(w.root)!, 'Most of it');
  key(summaryOf(w.root)!, 'Enter', { code: 'Enter', metaKey: true });
  await until(() => w.root.textContent!.includes('Committed') && sh(dir, 'log', '-1', '--format=%s').trim() === 'Most of it', 10000, 'the commit');
  assert.equal(committedFiles(dir), 'a.txt c.md d.txt staged.txt');
  assert.equal(cached(dir), '');
  assert.equal(sh(dir, 'status', '--porcelain'), ' M b.txt\n');
  await until(() => state(w.root, 'b.txt') === 'false', 10000, 'b.txt still out');
  // a.txt changed again: in. b.txt checked again: in. Still nothing staged.
  write(dir, { 'a.txt': 'a3\n' });
  await until(() => state(w.root, 'a.txt') === 'true', 15000, 'a.txt in again');
  click(checkbox(w.root, 'changes', 'b.txt')!);
  await until(() => state(w.root, 'b.txt') === 'true', 10000, 'b.txt in');
  await wait(300);
  assert.equal(cached(dir), '');
});

test('nothing checked: the commit box says so, commits nothing, and checks everything again', async (t) => {
  const dir = repo(t, { 'a.txt': 'a\n' });
  write(dir, { 'a.txt': 'a2\n', 'n.txt': 'n\n' });
  const w = await window(t, dir);
  click(await until(() => w.root.querySelector<HTMLElement>('[role="checkbox"][aria-label="Uncheck everything"]'), 10000, 'the list’s checkbox'));
  await until(() => w.root.textContent!.includes('No file is checked.') && state(w.root, 'a.txt') === 'false' && state(w.root, 'n.txt') === 'false', 10000, 'nothing checked');
  type(summaryOf(w.root)!, 'Nothing');
  await wait(200);
  assert.ok(button(w.root, /Commit to main/)!.disabled);
  click(button(w.root, 'Check all 2 changes')!);
  await until(() => state(w.root, 'a.txt') === 'true' && state(w.root, 'n.txt') === 'true', 10000, 'all checked again');
  assert.equal(cached(dir), '');
});

test('some of a file’s lines checked: a hunk or a line left out stays out of the commit, the rest goes in', async (t) => {
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const upper = (at: number[]) => `${lines.map((l, i) => (at.includes(i + 1) ? l.toUpperCase() : l)).join('\n')}\n`;
  const dir = repo(t, { 'a.txt': `${lines.join('\n')}\n` });
  write(dir, { 'a.txt': upper([2, 18]) });
  const w = await window(t, dir);
  click(await until(() => fileRow(w.root, 'changes', 'a.txt'), 10000, 'the row'));
  const pane = await until(() => {
    const p = w.root.querySelector<HTMLElement>('[data-diff="a.txt"]');
    return p && p.textContent!.includes('LINE 2') && p.querySelector('button[aria-label="Leave this hunk out"]') && p;
  }, 10000, 'the diff');
  // The first hunk out: the file is in part.
  click(pane.querySelector('button[aria-label="Leave this hunk out"]')!);
  await until(() => state(w.root, 'a.txt') === 'mixed', 10000, 'a.txt in part');
  const rowOf = (text: string) => [...pane.querySelectorAll<HTMLElement>('[data-row]')].find((r) => r.textContent!.includes(text));
  await until(() => rowOf('LINE 2')?.querySelector('[data-out="true"]'), 10000, 'its lines faint');
  // A line of it back in by its gutter, then out again.
  const gutter = () => rowOf('+LINE 2')?.querySelector<HTMLElement>('[data-out]') ?? rowOf('LINE 2')!.querySelectorAll<HTMLElement>('[data-out]')[0];
  pointer(gutter(), 'pointerdown');
  pointer(gutter(), 'pointerup');
  await until(() => gutter().dataset.out === 'false', 10000, 'a line back in');
  pointer(gutter(), 'pointerdown');
  pointer(gutter(), 'pointerup');
  await until(() => gutter().dataset.out === 'true', 10000, 'out again');
  // A new change to the file comes in; the lines left out stay out as they move.
  write(dir, { 'a.txt': upper([2, 10, 18]) });
  await until(() => pane.isConnected && w.root.querySelector('[data-diff="a.txt"]')!.textContent!.includes('LINE 10'), 15000, 'the new change');
  assert.equal(state(w.root, 'a.txt'), 'mixed');
  assert.equal(cached(dir), '');
  type(summaryOf(w.root)!, 'Part of a');
  key(summaryOf(w.root)!, 'Enter', { code: 'Enter', metaKey: true });
  await until(() => w.root.textContent!.includes('Committed') && sh(dir, 'log', '-1', '--format=%s').trim() === 'Part of a', 10000, 'the commit');
  assert.equal(sh(dir, 'show', 'HEAD:a.txt'), upper([10, 18]));
  assert.equal(read(dir, 'a.txt'), upper([2, 10, 18]));
  assert.equal(cached(dir), '');
  // What's left of it is out, as GitHub Desktop leaves it.
  await until(() => state(w.root, 'a.txt') === 'false', 10000, 'the rest out');
});

test('a diff’s code can be selected and copied, a line per row, without the line numbers', async (t) => {
  const dir = repo(t, { 'a.txt': 'one\nlet two = 2;\nthree\n' });
  write(dir, { 'a.txt': 'one\nlet TWO = 2;\nthree\n' });
  const w = await window(t, dir, byHand);
  click(await until(() => fileRow(w.root, 'unstaged', 'a.txt')));
  const pane = await until(() => {
    const p = w.root.querySelector<HTMLElement>('[data-diff="a.txt"]');
    return p && p.textContent!.includes('TWO') && p;
  }, 10000, 'the diff');
  const cells = [...pane.querySelectorAll<HTMLElement>('[data-code]')];
  const two = cells.findIndex((c) => c.textContent === 'let TWO = 2;');
  assert.ok(two > 0);
  // The code is selectable in a window that otherwise isn't; the numbers aren't.
  assert.match(cells[two].parentElement!.className, /select-text/);
  assert.match(pane.querySelector('[title^="Pick this line"]')!.className, /select-none/);
  // From “TWO” to the end of “three”.
  const at = (cell: HTMLElement, offset: number) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (offset <= n.textContent!.length) return [n, offset] as const;
      offset -= n.textContent!.length;
    }
    throw new Error('no such offset');
  };
  const range = document.createRange();
  range.setStart(...at(cells[two], 4));
  range.setEnd(...at(cells[two + 1], 5));
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  let copied = '';
  const e = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { setData: (_: string, v: string) => (copied = v) } });
  cells[two].dispatchEvent(e);
  assert.equal(copied, 'TWO = 2;\nthree');
  assert.equal(e.defaultPrevented, true);
});
