// Finding repositories (`find`: the one a folder is in, its submodules,
// others nested below it) and the git that runs (`version`).

export interface Found {
  /** The folder looked in: the path's own, or a file's. */
  folder?: string;
  root: string | null;
  gitDir: string | null;
  bare: boolean;
  repos: { root: string; kind: 'main' | 'nested' | 'submodule'; name: string }[];
  /** The server's home folder (the window writes ~ for it). */
  home?: string;
}

export interface GitVersion {
  path: string | null;
  version: string | null;
}
