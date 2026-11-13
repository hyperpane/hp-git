// One repository in a Git window, as every view has it (useRepo): its
// status, kept current by the server's watch; what every view needs to act
// on it (the calls, a way to run a change and say how it went, the app's
// dialogs); the sync under way, with its progress; and where the window is
// (the tab, the views opened over it, back and forward); and what's checked
// for the next commit. The state behind it is app/useRepoState.ts.

import { createContext, useContext } from 'react';
import type { Host } from '@hyperpane/sdk/client';
import type { Outcome, Status, SyncAction } from '../../shared/index.ts';
import type { Choices } from '../lib/include.ts';
import type { GitApi } from './api.ts';

export type Tab = 'changes' | 'history' | 'branches' | 'stashes' | 'tags';
export const TABS: Tab[] = ['changes', 'history', 'branches', 'stashes', 'tags'];

/** A view opened over the tabs, with a way back. */
export type View =
  | { kind: 'fileHistory'; path: string }
  | { kind: 'blame'; path: string; rev?: string; line?: number }
  | { kind: 'commit'; sha: string }
  | { kind: 'compare'; base: string; head: string };

export interface Sync {
  action: SyncAction | 'clone';
  label: string;
  phase: string;
  percent: number | null;
  text: string;
  cancel(): void;
}

export interface Repo {
  host: Host;
  api: GitApi;
  root: string;
  server?: string;
  status: Status;
  /** Every change is checked for the next commit, as GitHub Desktop has
   * it, and the index is left alone until Commit (the includeChanges
   * setting); else what's staged is what's committed. */
  including: boolean;
  /** What's left out of the next commit (lib/include.ts). */
  choices: Choices;
  choose(update: (c: Choices) => Choices): void;
  /** Bumped by every change: lists that aren't in the status (branches,
   * stashes, tags, history) load again. */
  version: number;
  bump(): void;
  /** Runs a change; an error becomes a toast. Resolves with its result, or
   * undefined when it failed. */
  run<T>(change: () => Promise<T>, o?: { done?: string; failed?: string }): Promise<T | undefined>;
  /** What a merge, rebase, pull… came to: conflicts send you to them. */
  outcome(o: Outcome | undefined | null, what: string): void;
  confirm(title: string, message: string, o?: { confirm?: string; destructive?: boolean }): Promise<boolean>;
  prompt(title: string, label: string, value?: string, placeholder?: string): Promise<string | null>;
  sync: Sync | null;
  startSync(action: SyncAction, args?: Record<string, unknown>, label?: string): Promise<Outcome | null>;
  tab: Tab;
  setTab(t: Tab): void;
  view: View | null;
  open(v: View): void;
  back(): void;
  forward(): void;
  canBack: boolean;
  canForward: boolean;
  /** Secondary: other windows. */
  openInEditor(path: string, line?: number): void;
  reveal(path: string): void;
  terminal(path?: string): void;
  toast(message: string, o?: { description?: string; error?: boolean }): void;
}

const RepoContext = createContext<Repo | null>(null);
export const RepoProvider = RepoContext.Provider;

export function useRepo(): Repo {
  const r = useContext(RepoContext);
  if (!r) throw new Error('useRepo() outside a repository.');
  return r;
}
