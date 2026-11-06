// What the repository names: branches local and remote (`branches`),
// stashes, tags and remotes.

export interface LocalBranch {
  name: string;
  sha: string;
  subject: string;
  date: number;
  author: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  gone?: true;
  merged: boolean;
  current: boolean;
}

export interface RemoteBranch {
  name: string;
  remote: string;
  branch: string;
  sha: string;
  subject: string;
  date: number;
  author: string;
}

export interface Branches {
  current: string | null;
  local: LocalBranch[];
  remote: RemoteBranch[];
  recent: string[];
}

export interface Stash {
  index: number;
  sha: string;
  message: string;
  branch: string | null;
  date: number;
}

export interface Tag {
  name: string;
  sha: string;
  annotated: boolean;
  message?: string;
  tagger?: string;
  date: number;
}

export interface Remote {
  name: string;
  url: string;
  pushUrl?: string;
}
