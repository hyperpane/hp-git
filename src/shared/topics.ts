// The bus topics this plugin publishes and answers, and their data.

export interface Topics {
  'git.changed': { repo: string; branch: string | null; head: string | null };
  'git.committed': { repo: string; sha: string; summary: string };
  'git.checkedOut': { repo: string; branch: string | null };
  /** A request: the answer is a Status. */
  'git.status': { repo?: string; path?: string };
  /** For the client part: open a file's history, blame or diff. */
  'git.open': { path: string; view: 'history' | 'blame' | 'diff'; line?: number };
}
