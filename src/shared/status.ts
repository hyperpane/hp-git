// A repository's status, as `status` and `watch` give it: the branch and how
// it stands against its upstream, what's under way (a merge, a rebase), who
// commits, and every changed file with how git letters its change.

/** A file's change, as git letters it. */
export type Letter = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U';

export type ConflictKind = 'bothModified' | 'bothAdded' | 'bothDeleted' | 'addedByUs' | 'addedByThem' | 'deletedByUs' | 'deletedByThem';

export type OperationKind = 'merge' | 'rebase' | 'cherryPick' | 'revert' | 'am' | 'bisect';

export interface Operation {
  kind: OperationKind;
  /** The branch being rebased. */
  branch?: string;
  /** The commit it's rebased onto. */
  onto?: string;
  /** A rebase's “commit 2 of 5”. */
  step?: number;
  total?: number;
  /** The commit being merged, picked, reverted or applied. */
  head?: string;
  /** The message git prepared (MERGE_MSG), comments stripped. */
  message?: string;
}

export interface FileStatus {
  /** From the repository's root, forward slashes. */
  path: string;
  /** A rename's or copy's old path. */
  from?: string;
  /** The index against HEAD; null when unchanged. */
  staged: Letter | null;
  /** The working tree against the index; null when unchanged. */
  worktree: Letter | null;
  untracked: boolean;
  conflict: ConflictKind | null;
  submodule?: boolean;
  /** With `stats`: lines against HEAD. */
  additions?: number;
  deletions?: number;
  /** The working copy's modification time (0 if it's gone). */
  mtime: number;
}

export interface Identity {
  name: string | null;
  email: string | null;
}

export interface Status {
  root: string;
  gitDir: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  unborn: boolean;
  upstream: string | null;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  remote: string | null;
  remotes: string[];
  operation: Operation | null;
  files: FileStatus[];
  truncated: boolean;
  stashes: number;
  identity: Identity;
  fetched: number | null;
  fetchError?: string;
}
