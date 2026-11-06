// Finding repositories (`find`: the one a folder is in, its submodules,
// others nested below it) and the git that runs (`version`).

export interface Found {
  root: string | null;
  gitDir: string | null;
  bare: boolean;
  repos: { root: string; kind: 'main' | 'nested' | 'submodule'; name: string }[];
}

export interface GitVersion {
  path: string | null;
  version: string | null;
}
