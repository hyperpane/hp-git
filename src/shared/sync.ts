// What a change that may stop at conflicts comes to (merge, rebase, pull,
// a stash applied), and a sync's or clone's events: progress, prompts for
// credentials, and the end.

export interface Outcome {
  conflicts: boolean;
  message?: string;
}

export type SyncAction = 'fetch' | 'pull' | 'push' | 'publish' | 'pushTag' | 'deleteRemoteTag' | 'deleteRemoteBranch';

export type PromptKind = 'username' | 'password' | 'passphrase' | 'hostKey' | 'other';

export type SyncEvent =
  | { type: 'progress'; phase: string; percent?: number; text: string }
  | { type: 'prompt'; id: string; prompt: string; secret: boolean; kind: PromptKind }
  | { type: 'done'; result: Outcome & { root?: string } };
