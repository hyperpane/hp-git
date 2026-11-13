# The Git plugin's server part: its API

The client part (and any plugin that `uses` git) talks to the server part
with JSON calls and subscriptions, one `op` each:

```ts
const status = await host.call<Status>('git', { op: 'status', repo });
const cancel = host.subscribe<Status>('git', { op: 'watch', repo }, (s) => …, { onEnd(error) {} });
```

The types named here are in `src/shared/`, by area, all exported from
`index.ts`: import them with
`import type { Status, Diff, … } from '../shared/index.ts'`. Line and hunk
staging builds its patches with `src/shared/patch.ts` (below).

## Rules every op follows

- **`repo`** is the repository's root, in the app's path form: forward
  slashes, `C:/…` on Windows, `~` allowed. `find` turns any folder into one.
  An op given a folder that isn't a repository's root still works (git finds
  the root), but its paths are relative to the root.
- **Paths** of files (`path`, `paths`, `oldPath`) are relative to the root,
  with forward slashes, as `status` gives them.
- **Errors** reject the call (or end the subscription) with a message for
  the user, in plain English, as v0.1.3 had them: “Git isn't installed on
  this server.”, “Your changes to a.txt would be overwritten. Commit or
  stash them first.”, “The remote has commits this branch doesn't have. Pull
  first, then push.”, “Some files still have conflicts. Resolve them
  first.”, “There's nothing to commit.” … Show them as they are.
- **Cancel:** cancelling a call (its `signal`) or a subscription stops the
  git process and everything it started (its process group is asked to stop,
  so git removes its lock files, and killed a second later; `taskkill /T` on
  Windows). A cancelled call rejects with “Cancelled.” at once.
- **One change at a time per repository:** ops that change a repository
  queue behind each other (git's index lock); reads run at once.
- **After any change** made through this plugin, every `watch` of that
  repository sends a new status at once (no need to call `status` again),
  and `git.changed` is published on the bus.
- Times are milliseconds since 1970. SHAs are full 40 (or 64) hex.
- Outcomes of ops that can stop half-way (merge, rebase, pull, cherry-pick,
  revert, stash apply/pop, operation continue): `Outcome`
  `{conflicts: boolean, message?: string}`. Conflicts are not an error: the
  status then has `operation` set and conflicted files.

## Finding, making and cloning repositories

### `version {}` → `{path, version} | {path: null, version: null}`
The git this server runs (the `gitPath` setting, else `PATH`, else Git for
Windows' usual places, else Homebrew's / `/usr/bin`), and `git --version`.

### `find {path}` → `Found`
```ts
{ root: string | null,          // the repository `path` is in, or null
  gitDir: string | null,        // its .git folder (a worktree's or a submodule's own)
  bare: boolean,
  repos: { root: string, kind: 'main' | 'nested' | 'submodule', name: string }[] }
```
`repos` lists the repository `path` is in (`main`) first, then the
submodules (`git submodule` paths that are checked out) and other
repositories found below it (`nested`, at most 6 folders deep, skipping
`node_modules` and other big folders), sorted by path. With `root: null`,
`repos` may still list repositories inside `path`.

### `init {path, branch?}` → `{root}`
Makes `path` a repository. `branch` defaults to the `defaultBranch` setting
(“main”), unless git's `init.defaultBranch` is set and no branch is given.

### subscription `clone {url, into, branch?, depth?}` → `SyncEvent`s
`into` is the new folder (it must not exist, or be empty). Events as for
`sync` (progress, prompts), then `{type: 'done', result: {root}}`, then the
subscription ends. A failure ends it with the error; a cancel kills git and
removes the half-made folder.

## Status and watching

### `status {repo, stats?}` → `Status`
```ts
interface Status {
  root: string; gitDir: string;
  branch: string | null;           // null when detached (or no repository yet)
  head: string | null;             // HEAD's commit; null before the first commit
  detached: boolean; unborn: boolean;   // unborn: no commit yet
  upstream: string | null;         // 'origin/main'
  upstreamGone: boolean;           // set, but deleted on the remote
  ahead: number; behind: number;
  remote: string | null;           // where fetch/pull/push go: the upstream's remote, else remote.pushDefault, else origin, else the only one
  remotes: string[];
  operation: Operation | null;
  files: FileStatus[];             // conflicted first, then by path
  truncated: boolean;              // more than 10 000 changed files: the rest left out
  stashes: number;
  identity: { name: string | null; email: string | null };   // user.name / user.email as git sees them here
  fetched: number | null;          // when FETCH_HEAD last changed
  fetchError?: string;             // the last automatic fetch failed (see autoFetch)
}
interface FileStatus {
  path: string;
  from?: string;                   // a rename's or copy's old path
  staged: Letter | null;           // the index against HEAD: 'M'|'A'|'D'|'R'|'C'|'T'; null unchanged
  worktree: Letter | null;         // the working tree against the index: 'M'|'D'|'T'; null unchanged
  untracked: boolean;              // then staged and worktree are null
  conflict: Conflict | null;       // then staged and worktree are 'U' or the letters git gives
  submodule?: boolean;
  additions?: number; deletions?: number;   // with `stats: true`: lines against HEAD (not for binary files; untracked files count their lines)
  mtime: number;                   // the working copy's modification time (0 if it's gone): a status changes when a changed file changes again
}
type Conflict = 'bothModified' | 'bothAdded' | 'bothDeleted' | 'addedByUs' | 'addedByThem' | 'deletedByUs' | 'deletedByThem';
interface Operation {
  kind: 'merge' | 'rebase' | 'cherryPick' | 'revert' | 'am' | 'bisect';
  branch?: string;                 // the branch being rebased
  onto?: string;                   // the commit it's rebased onto
  step?: number; total?: number;   // a rebase's “commit 2 of 5”
  head?: string;                   // the commit being merged / picked / reverted / applied
  message?: string;                // the message git prepared (MERGE_MSG), comments stripped
}
```
It runs `git status --porcelain=v2 -z` once (no optional locks, so it never
touches the index and never triggers a watch).

### subscription `watch {repo, stats?}` → `Status` events
The status at once, then again whenever it changes: the repository's
`.git/index`, `HEAD`, `refs`, `packed-refs`, `FETCH_HEAD`, the operation's
files, and the working tree are watched; changes are debounced (150 ms,
and never more often than 3× what a status takes) and only a status that
differs from the last one is sent. A check every 10 s catches what file
watching misses. Many watches of one repository share one watcher.

The first watch of a repository with a long history (2 000 commits or
more) and no commit-graph writes one in the background (`git commit-graph
write --reachable --changed-paths`, what `git gc` does), unless the
`commitGraph` setting is off: on 50 000 commits it takes a history page
from 160 ms to 16 ms.

While any watch of a repository is open the server fetches it every
`autoFetch` minutes (the setting; off by default), quietly: no prompts (a
remote that needs a password fails and `fetchError` says so).

## Diffs

### `diff {repo, path, …}` → `Diff`
```ts
{ op: 'diff', repo, path,
  oldPath?: string,       // a rename's old path (status's `from`)
  staged?: boolean,       // the index against HEAD (default: the working tree against the index)
  head?: boolean,         // the working tree against HEAD (before the first commit, against nothing): what a commit of it takes
  untracked?: boolean,    // a new file: all of it, added
  commit?: string,        // that commit against its first parent (a root commit: against nothing); 'stash@{0}' works, 'stash@{0}^3' is a stash's untracked files
  from?: string, to?: string,   // between two revisions; `from` alone: `from` against the working tree
  context?: number,       // lines of context (default 3, the contextLines setting is the UI's to pass)
  ignoreWhitespace?: boolean,
  full?: boolean,         // “show anyway”: lift the size caps (to the hard ones)
}
interface Diff {
  path: string; oldPath?: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T';
  similarity?: number;              // a rename's or copy's, in %
  oldMode?: string; newMode?: string;   // '100644', '100755', '120000' (a link), '160000' (a submodule)
  binary: boolean;
  image?: { mime: string; before: Blob | null; after: Blob | null };   // png, jpg, gif, webp, bmp, ico, svg, avif
  tooLarge?: boolean;               // over the caps: no hunks; `size` says how big; ask again with full: true
  truncated: boolean;               // cut at the hard cap: the hunks stop early
  size: number;                     // bytes of the patch (or of the larger file, when binary)
  additions: number; deletions: number;
  hunks: Hunk[];
  submodule?: { before: string | null; after: string | null };   // a submodule's commits
}
interface Hunk {
  header: string;         // '@@ -12,7 +12,8 @@ fn main'
  oldStart: number; oldLines: number; newStart: number; newLines: number;
  section?: string;       // what follows the second @@ ('fn main')
  lines: Line[];
}
interface Line {
  kind: ' ' | '+' | '-';
  old?: number; new?: number;   // line numbers (old for ' ' and '-', new for ' ' and '+')
  text: string;           // the line without its mark, exactly: a CRLF file's lines end with '\r' (strip it to show)
  noNewline?: true;       // “\ No newline at end of file” follows this line
}
interface Blob { size: number; data?: string /* base64 */; tooLarge?: boolean }
```
Caps: a patch over 2 MB or 20 000 lines comes back `tooLarge` (no hunks)
unless `full`; with `full`, up to 64 MB / 400 000 lines, then `truncated`.
Lines are never cut (patches must stay exact). Images over 8 MB each come
back `tooLarge` in their `Blob`. Cancel the call when the selection moves.

### `blob {repo, path, rev?, start?, count?, base64?}` → `{size, binary, lines?, total?, data?}`
A file's content: `rev` omitted is the working tree, `':0'` the index,
`':1'`/`':2'`/`':3'` a conflict's base/ours/theirs, anything else a commit
(`HEAD`, a SHA). `lines` from `start` (1-based, default 1), `count` of them
(default all, at most 100 000), `total` how many it has; `base64` gives `data`
instead (at most 16 MB). For expanding context between hunks and the
three-way conflict view.

### `apply {repo, patch, cached?, reverse?}` → `null`
Applies a patch built by `src/shared/patch.ts`: `cached` to the index
(staging), else to the working tree (discarding, with `reverse`). Before a
working-tree change, the file as it is now is copied to the Trash. Fails with
“The file changed since its diff was shown. Look again, then try once more.”
when it no longer applies.

```ts
import { stagePatch, unstagePatch, discardPatch } from '../shared/patch.ts';
// `diff` is what the `diff` op gave (unstaged, untracked or staged, with context ≥ 0);
// `selected` the lines to act on: a Set of 'hunk:line' keys, or (hunk, line) => boolean.
const patch = stagePatch(diff, selected);       // → { op: 'apply', repo, patch, cached: true }
const patch = unstagePatch(stagedDiff, selected); // → { op: 'apply', repo, patch, cached: true, reverse: true }
const patch = discardPatch(diff, selected);       // → { op: 'apply', repo, patch, reverse: true }
// Each returns null when the selection has no '+' or '-' line. A whole hunk: select all its lines
// (hunkLines(diff, h) gives its keys); `selectable(line)` says whether a line can be picked.
```

## Staging, discarding, committing

- `stage {repo, paths?, all?}` → `null`: adds them (new, changed and deleted
  alike); for a conflicted file, marks it resolved. `all`: everything.
- `unstage {repo, paths?, all?}` → `null`: back to HEAD in the index (works
  before the first commit too).
- `discard {repo, paths}` → `null`: back to HEAD, staged and unstaged
  changes alike; new files go; a renamed file's old one comes back; a folder
  given takes everything changed in it. Every working copy goes to the Trash
  (macOS, freedesktop) or the Recycle Bin first, so it can be put back.
- `ignore {repo, pattern}` → `null`: adds a line to the root's `.gitignore`
  (once). Already-tracked files stay tracked.
- `commit {repo, summary, description?, amend?, signoff?, coAuthors?, all?, allowEmpty?, noVerify?, only?}` →
  `{sha, summary}`. `coAuthors`: `[{name, email}]`, added as
  `Co-authored-by:` trailers. `amend` with an empty summary keeps the
  message. `only: {paths, patches?}` commits exactly that, whatever's
  staged: HEAD (amended: HEAD's tree too) plus `paths` whole as the working
  tree has them (a path gone from it is deleted) plus `patches`, each some
  lines of one file built with `stagePatch` from its `diff {head: true}`
  (or `untracked`). It's built in an index of its own, as
  `git commit -- paths` does: git's index isn't touched on the way, a
  commit that fails leaves it as it was, and after the commit the committed
  paths' entries in it are the new HEAD's (the others stay as they were).
  Publishes `git.committed`.
- `undoCommit {repo}` → `{summary, description}`: takes the last commit
  back, its changes staged, and gives its message back.
- `authors {repo, limit?}` → `[{name, email, commits}]`: the people in the
  last 2 000 commits (with their co-authors), most commits first: the
  co-author picker.
- `config {repo, get?: string[], set?: Record<string, string | null>, global?}` → `{values: Record<string, string | null>}`:
  reads or writes (null unsets) `user.name`, `user.email`, `user.signingkey`,
  `commit.gpgsign`, `pull.rebase`, `pull.ff`, `push.autoSetupRemote`,
  `core.autocrlf`, `init.defaultBranch`, `fetch.prune`, in the repository
  (or with `global` the user's). Others are refused. `values` is what git
  sees after the change, from any scope.

## History

### `log {repo, …}` → `{commits: Commit[], more: boolean}`
```ts
{ op: 'log', repo,
  ref?: string,           // where to start (default HEAD)
  all?: boolean,          // every branch, remote branch and tag (and HEAD)
  path?: string,          // only commits touching this path (`-- path`); a folder works
  search?: string,        // in the message (case-insensitive, fixed string)
  author?: string,        // in the author's name or email
  pickaxe?: { text: string, regex?: boolean },   // -S text, or -G regex
  sha?: string,           // a SHA prefix: that commit only (if it's there)
  since?: number, until?: number,
  firstParent?: boolean,
  skip: number, limit: number,    // limit at most 1000
}
interface Commit {
  sha: string; parents: string[];
  author: string; email: string; date: number;
  committer: string; committerEmail: string; committerDate: number;
  subject: string;
  refs: Ref[];            // decorations, HEAD's branch marked current
  coAuthors?: Person[];   // its `Co-authored-by:` trailers ({name, email}), each once, the author left out
  unpushed?: true;        // on HEAD but not its upstream (or on no remote branch)
}
interface Ref { name: string; kind: 'head' | 'branch' | 'remote' | 'tag' | 'stash'; current?: true }
```
In `--topo-order` (children before parents: what the graph needs). Git's
output is read as it comes and git is stopped once the page is full. Ask the
next page with `skip` = commits so far.

### `show {repo, sha}` → `CommitDetail`
`Commit` plus `body` (the message after the subject), `signature?`
(`{status: 'good'|'bad'|'unknown'|…, signer}` when signed), and
`files: [{path, from?, status: Letter, additions, deletions, binary}]`
against its first parent (a root commit: against nothing; a stash: against
its base, its untracked files included with `untracked: true`; 5 000 at
most, `truncated` past them).

### `compare {repo, base, head, limit?}` → `{ahead: Commit[], behind: Commit[], aheadCount, behindCount, mergeBase}`
Commits on `head` not on `base` (`ahead`) and the other way round, up to
`limit` (500) each: the Branches tab's compare.

### `changes {repo, from, to?}` → `{files: ChangedFile[], truncated}`
The files changed from `from` to `to` (revisions), or with no `to` to the
working tree (tracked files only, as `git diff -M from` sees them): each
`{path, from?, status, additions, deletions, binary}`, renames found, 5 000
at most. A file's diff: `diff {from, to, path, oldPath}`. For “Compare with
the working tree” and a branch compare's files (`from`: the merge base).

### `fileLog {repo, path, skip, limit}` → `{commits: (Commit & {path, from?, status})[], more}`
Commits touching a file, following renames: each says the file's path in
that commit.

### `blame {repo, path, rev?}` → `Blame`
```ts
{ lines: { sha: string, line: number /* in that commit */, text: string }[],
  commits: Record<sha, { author, email, date, summary, previous?: { sha, path }, boundary?: true }>,
  truncated: boolean }    // files over 50 000 lines / 8 MB are cut
```
`rev` omitted is the working tree (uncommitted lines have the all-zero SHA).

### subscription `once {repo, call: {op, …}}` → one event, then the end

Any call above, run as a subscription: its reply arrives as the one event,
and the subscription ends (an error ends it with the message). Cancelling
it stops the call and the git it runs, which a plain call can't be: use it
for reads a moving selection makes stale (`diff`, `log`, `show`,
`compare`, `changes`, `fileLog`, `blame`, `stash show`). `call.repo`
defaults to `repo`.

## Branches, merging, conflicts

### `branches {repo}` → `Branches`
```ts
{ current: string | null,
  local: { name, sha, subject, date, author, upstream?: string, ahead?: number, behind?: number, gone?: true, merged: boolean, current: boolean }[],
  remote: { name /* 'origin/x' */, remote, branch, sha, subject, date, author }[],
  recent: string[] }      // local branches checked out lately (the reflog), newest first
```
`merged`: reachable from HEAD (deleting it loses nothing).

- `checkout {repo, ref, create?, from?, detach?}` → `null`. A local branch;
  a remote one (`origin/x`) switches to its local branch, made tracking it
  if there's none; `create` makes `ref` from `from` (default HEAD) first;
  `detach` (or a SHA or tag) checks out the commit. Publishes `git.checkedOut`.
- `branch {repo, action, …}` → `null`:
  - `create {name, from?, checkout?}`,
  - `rename {name, to}`,
  - `delete {name, force?}`: an unmerged branch needs `force` (“This branch
    isn't fully merged: deleting it loses its commits.”),
  - `setUpstream {name?, upstream}`: `upstream` null unsets it; `name`
    defaults to the current branch.
  (A remote branch is deleted with `sync {action: 'deleteRemoteBranch'}`.)
- `merge {repo, ref, ffOnly?, noFf?, squash?}` → `Outcome`.
- `rebase {repo, onto}` → `Outcome`.
- `cherryPick {repo, sha}` (or `shas: []`) → `Outcome`.
- `revert {repo, sha}` → `Outcome` (a merge: against its first parent).
- `reset {repo, sha, mode: 'soft' | 'mixed' | 'hard'}` → `null`.
- `operation {repo, action: 'continue' | 'abort' | 'skip'}` → `Outcome`:
  whatever `status.operation` says is under way (a merge is continued by
  committing it with its prepared message).
- `resolve {repo, path, side: 'ours' | 'theirs' | 'mark'}` → `null`: takes
  one side whole (or the deletion, if that side deleted it) and marks it
  resolved; `mark` stages the file as it is now (conflict markers left in
  are refused: “a.txt still has conflict markers.”).
- `resolve {repo, path, side: 'text', text, mark?}` → `null`: writes `text`
  (the three-way view's merged result, block by block) as the working copy,
  the copy there now going to the Trash first; with `mark` it's then staged
  as resolved (refused while it still has conflict markers). Paths outside
  the repository are refused (“../x isn't a path in the repository.”).

## Stashes and tags

- `stashes {repo}` → `[{index, sha, message, branch: string | null, date}]`.
- `stash {repo, action, …}`:
  - `push {message?, untracked? (default true), paths?, keepIndex?}` → `null`
    (“There are no changes to stash.”),
  - `apply {index}` / `pop {index}` → `Outcome` (a pop with conflicts keeps
    the stash),
  - `drop {index}` → `null`,
  - `show {index}` → `CommitDetail` of the stash (files include its
    untracked ones); a file's diff: `diff {commit: 'stash@{n}', path}`, or
    `diff {commit: 'stash@{n}^3', path}` for an untracked one.
- `tags {repo}` → `[{name, sha /* the commit */, annotated, message?, tagger?, date}]`,
  newest first.
- `tag {repo, action: 'create', name, sha?, message?}` → `null` (with a
  `message`, annotated); `tag {repo, action: 'delete', name}` → `null`.
  Pushing and deleting on the remote: `sync`.

## Remotes and syncing

- `remotes {repo}` → `[{name, url, pushUrl?}]`.
- `remote {repo, action: 'add' | 'remove' | 'rename' | 'setUrl', name, url?, to?}` → `null`.

### subscription `sync {repo, action, …}` → `SyncEvent`s
```ts
{ op: 'sync', repo, action:
    'fetch'               // {remote?} (default: status.remote; all: true for every remote), with --prune
  | 'pull'                // the upstream, as pull.rebase / pull.ff say (merging when neither is set)
  | 'push'                // to the upstream; {force: 'lease'} for --force-with-lease
  | 'publish'             // the first push: sets the upstream ({remote?})
  | 'pushTag'             // {name, remote?}
  | 'deleteRemoteTag'     // {name, remote?}
  | 'deleteRemoteBranch'  // {name: 'origin/x'}
}
type SyncEvent =
  | { type: 'progress', phase: string, percent?: number, text: string }   // 'Receiving objects', 42, the line git printed
  | { type: 'prompt', id: string, prompt: string, secret: boolean, kind: 'username' | 'password' | 'passphrase' | 'hostKey' | 'other' }
  | { type: 'done', result: Outcome & { root?: string } };
```
The events end with `done`, then the subscription ends; a failure ends it
with the error. Cancelling it kills git.

### Credentials: prompts
Git runs with this plugin's askpass helper (`GIT_ASKPASS`, `SSH_ASKPASS`,
forced; terminal prompts off; Git for Windows' own askpass and credential
dialogs are off, as in v0.1.3). When git or ssh needs something (a
username, a password or token, a key's passphrase, a new host key), the
helper asks the server part, and the running `sync` or `clone` subscription
gets a `prompt` event. The UI shows a dialog and answers:

- `answer {id, value}` → `null`: `value` is the text (a string), or `null`
  to cancel (git then fails: “Signing in was cancelled.”). Unanswered
  prompts are cancelled after 5 minutes, or when the subscription goes.

Git's credential helper (the keychain) keeps what worked, as it always does.
Automatic fetches never prompt.

## Explorer decorations (Explorer's extension points)

Git contributes to two of Explorer's points (plugin.json
`contributes["explorer.decorations"]` and `contributes["explorer.menus"]`).
The app makes these calls for Explorer, so `ctx.from` is null, and they take
**whole paths** (the app's form: forward slashes, `C:/…` on Windows), not a
`repo`: each path's repository is found from the folder it's in, so the rows
in a submodule or a nested repository get that one's status. Paths outside
any repository are left out; neither call fails for them.

### `explorerDecorations {server, folder, paths}` → `{[path]: Decoration}`
```ts
interface Decoration {
  badge?: string;      // 'U' untracked, 'A' added, 'M' modified (or type changed),
                       // 'D' deleted, 'R' renamed or copied, '!' conflict, '•' a folder with changes
  color?: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'ignored' | 'conflict';
  title?: string;      // “Modified, staged, with more changes not staged”, “Renamed from a.txt, staged”,
                       // “Conflict: changed on both sides”, “3 changed files inside”, “Ignored by Git”
  faded?: boolean;     // ignored files and folders: {color: 'ignored', faded: true}
}
```
At most 2000 `paths` are looked at. A path with nothing to say (unchanged,
not ignored) isn't in the answer. A file's letter: a conflict is `!`; else
untracked `U`; else a deletion on either side `D`, a new file `A`, a rename
or copy `R`, any other change `M`. A folder with changed files inside (and
no change of its own) is `{badge: '•', color, faded: false}`: `conflict` if
one of them is, `untracked` if they all are, else `modified`. Ignored paths
come from `git check-ignore` (tracked files never are). Each repository's
status is one `git status --porcelain=v2 -z`, kept for a second (many
Explorers ask, every 10 s); folders outside any repository are remembered
for 5 s.

### `explorerStage {server, folder, paths}` → `{message, error?}`
Explorer's **Stage with Git** (any files or folders): `git add -A` of each,
in its own repository, queued like `stage`; then the watches look again.
`{message: 'Staged 2 files.'}` (one: `Staged a.txt.`; paths outside a
repository are counted: `… 1 wasn't in a Git repository.`); none in a
repository: `{message: 'That isn't in a Git repository.', error: true}`.
Git's own errors (an ignored file) reject the call, as `stage`'s do.

## Bus (plugin.json `events`)

- Published (to the projects whose folder holds the repository, or that it
  holds):
  - `git.changed {repo, branch, head}`: after any change (this plugin's, or
    one a watch saw),
  - `git.committed {repo, sha, summary}`,
  - `git.checkedOut {repo, branch}` (`branch` null when detached).
- Answered: `bus.request('git.status', {repo?, path?})` → `Status`, for any
  plugin: `repo`, or the repository `path` is in, or the project's folder's.
  (`events.wake` is on: a request starts the server part if it's stopped.)
  The topics' data types are `Topics` in `src/shared/topics.ts`.
- `git.open {path, view: 'history' | 'blame' | 'diff', line?}`: subscribed by
  the client part (a Git window opens the file's history or blame); other
  plugins publish it.

## Settings (`contributes.settings`)

`gitPath` (string, empty: find it), `defaultBranch` (string, `main`),
`commitGraph` (boolean, on), `autoFetch` (`off` | `5` | `15` | `30`
minutes), `diffView` (`unified` | `split`), `ignoreWhitespace` (boolean),
`contextLines` (number, 3), `includeChanges` (boolean, on: every change
checked for the next commit as GitHub Desktop has it, kept by the window,
committed with `commit {only}`; off: what's staged is committed), `signoff` (boolean). The server reads `gitPath`,
`defaultBranch`, `commitGraph` and `autoFetch`; the rest are the UI's (read
them with `useSetting`, pass them in calls: `ignoreWhitespace` and
`context` to `diff`, `signoff` to `commit`). Build line patches only from
diffs asked without `ignoreWhitespace`.
