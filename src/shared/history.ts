// History: commits with their refs (`log`, `compare`), one commit whole
// (`show`) and the files it changed, a file's history (`fileLog`), blame,
// and the people who commit (`authors`).

import type { Letter } from './status.ts';

export interface Ref {
  name: string;
  kind: 'head' | 'branch' | 'remote' | 'tag' | 'stash';
  current?: true;
}

export interface Commit {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  date: number;
  committer: string;
  committerEmail: string;
  committerDate: number;
  subject: string;
  refs: Ref[];
  unpushed?: true;
}

export interface LogPage<C = Commit> {
  commits: C[];
  more: boolean;
}

export interface ChangedFile {
  path: string;
  from?: string;
  status: Letter;
  additions: number;
  deletions: number;
  binary: boolean;
  untracked?: true;
}

export interface CommitDetail extends Commit {
  body: string;
  signature?: { status: 'good' | 'bad' | 'unknown' | 'expired' | 'revoked' | 'missingKey'; signer: string };
  files: ChangedFile[];
  truncated: boolean;
}

export interface FileCommit extends Commit {
  path: string;
  from?: string;
  status: Letter;
}

export interface Compare {
  ahead: Commit[];
  behind: Commit[];
  aheadCount: number;
  behindCount: number;
  mergeBase: string | null;
}

export interface BlameCommit {
  author: string;
  email: string;
  date: number;
  summary: string;
  previous?: { sha: string; path: string };
  boundary?: true;
}

export interface Blame {
  lines: { sha: string; line: number; text: string }[];
  commits: Record<string, BlameCommit>;
  truncated: boolean;
}

export interface Author {
  name: string;
  email: string;
  commits: number;
}
