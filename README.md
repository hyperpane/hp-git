# Git

Git for a project, laid out like GitHub Desktop, in a window on the canvas:

- **Changes:** staged, unstaged, untracked and conflicted files; stage or
  discard a whole file, a hunk or single lines (discarded work goes to the
  Trash, or the Recycle Bin, first); ignore a file or a pattern. As in
  GitHub Desktop, every changed file is listed once and checked for the
  next commit as it comes; uncheck a file, or a hunk or lines in its diff
  (its gutter), to leave them out. That's the window's own, kept on this
  machine: git's index isn't touched until Commit, which commits exactly
  what's checked (and leaves what you staged elsewhere as it was). The
  **Check every change** setting off: stage files, hunks and lines by hand,
  and commit what's staged.
- **Commit** with a summary and description, amend, sign-off and
  co-authors, as the identity the repository's config says (and can change).
- **Diffs:** unified or side by side, word highlights, whitespace ignored or
  not, more context on demand, images before and after, renames, and a
  summary for binary and huge files with “show anyway”; the code selected
  with the mouse copies as text (lines are picked in the gutter).
- **History** with a commit graph, searched by message, author, SHA, path
  or content (`-S`/`-G`); every commit's message (folded away for more of
  the diff), files and diffs, its author and co-authors stacked; checkout,
  branch or tag from it, cherry-pick, revert, reset.
- **Branches** local and remote with ahead/behind; merge, rebase, compare;
  **stashes**; **tags**; a file's **history** and **blame**.
- **Conflicts:** ours, theirs, or block by block, then continue or abort the
  merge, rebase, cherry-pick or revert.
- **Sync:** fetch, pull, push, publish, force with lease, with progress and
  cancel; passwords and passphrases are asked in a dialog.
- **Clone** and **initialize** repositories.
- **In Explorer:** each file's status as a colored letter (U, A, M, D, R, !),
  a dot on folders with changes inside, ignored files faded; and **Stage
  with Git** in its right-click menu (API.md, “Explorer decorations”).

It runs the system's `git` (2.23 or newer): the one on `PATH`, or Git for
Windows' and Homebrew's usual places, or the one the **Git executable**
setting names. Nothing is built: the app runs the TypeScript as it is.

## What's where

| File | What it is |
|---|---|
| `plugin.json` | The manifest: the Git window, its settings, its bus topics, what it adds to Explorer. |
| `API.md` | Every op of the server part: what it takes, what it gives, its errors. |
| `src/server/main.ts`, `plugin.ts` | The server part: a Node process that runs git. `main.ts` serves it; `plugin.ts` wires each op to its handler, queues the changes to a repository and tells the bus. |
| `src/server/ops/` | The ops, a file per group: `status.ts`, `diff.ts`, `stage.ts`, `apply.ts`, `commit.ts`, `history.ts`, `show.ts`, `blame.ts`, `branches.ts`, `merge.ts`, `resolve.ts`, `stash.ts`, `tags.ts`, `remotes.ts`, `config.ts`, `sync.ts`, `repos.ts`, and `explorer.ts` (Explorer's decorations and Stage with Git; the mapping is `lib/decorations.ts`). |
| `src/server/lib/` | What the ops share: finding and running git (`find-git.ts`, `git.ts`, `process.ts`; a cancel kills the process tree), parsing what it prints (`parse-status.ts`, `parse-diff.ts`, `commits.ts`), `askpass.ts` (git's and ssh's prompts through the app), `watches.ts` (following a repository's changes), the Trash, and the rest. |
| `src/shared/` | What both parts use: the reply and event types by area (`status.ts`, `diff.ts`, `history.ts`, `refs.ts`, `sync.ts`, `repos.ts`, `topics.ts`, all from `index.ts`) and the patch builder for line and hunk staging (`patch.ts`). |
| `src/client/main.tsx` | The client part's entry: a Git window, or one of its dialogs. |
| `src/client/app/` | The window itself: finding the repository (`GitWindow.tsx`), its state (`repo.ts`, `useRepoState.ts`), the calls to the server part (`api.ts`), the layout (`Main.tsx`), and what can be done with branches, commits, stashes, tags, files and syncs (`actions/`). |
| `src/client/views/` | The views: the toolbar, each tab's list and detail (`changes/`, `history/`, `branches/`, `stashes/`, `tags/`), a commit (`commit/`), a conflict (`conflict/`), blame, a file's history, the views over the tabs, and the dialogs (`dialogs/`). |
| `src/client/components/` | Small pieces the views share (checkboxes, avatars, tabs, split panes, the virtual list) and the diff (`diff/`), which Changes, commits, compares and file histories all show. |
| `src/client/hooks/`, `lib/` | The hooks (lists that load again on a change, the history's pages, picked lines, the window's keys) and pure helpers (dates, paths, the branch graph, the diff's model, conflicts). |
| `test/server/` | The server part's tests, on temporary repositories (and a bare remote over `file://` and HTTP); `bench.ts` times a generated 50 000-commit repository. |
| `test/client/` | The window's tests, with a fake app and the real server part. |

## Speed

Status is one `git status --porcelain=v2 -z`; history is read as git writes
it and git is stopped once a page is full; diffs are computed when asked and
cancelled when the selection moves, with caps on their size; a repository's
watch is shared by every window that shows it and debounced. On a generated
repository of 50 000 commits and 10 000 files (`test/server/bench.ts`, an
M4 Max): status 126 ms, the first page of history 35 ms (171 ms before git's
commit-graph exists; the first watch writes it), a 7.7 MB diff 71 ms.

## Checks

```sh
./build.sh --test        # type-check, validate plugin.json, run the tests
node --import ./node_modules/@hyperpane/sdk/register.mjs test/server/bench.ts /tmp/big   # the timings
```
