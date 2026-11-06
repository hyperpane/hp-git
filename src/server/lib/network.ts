// Git on the network (fetch, pull, push, clone): its progress as events (at
// most ten a second), its prompts asked through the askpass helper, ssh
// that never waits for a terminal, and errors put plainly.

import { PluginError } from '@hyperpane/sdk/server';
import type { Outcome, SyncEvent } from '../../shared/index.ts';
import type { Askpass, Asker } from './askpass.ts';
import { conflicted } from './conflicted.ts';
import { explain } from './explain.ts';
import type { Git } from './git.ts';
import type { RunOptions } from './process.ts';
import type { Repo } from './repo.ts';

/** Where progress and prompts go. */
export interface Channel {
  emit(e: SyncEvent): void;
  /** The user's answer to a prompt (null: cancelled). */
  ask: Asker;
  signal?: AbortSignal;
}

/** `Receiving objects:  45% (450/1000)` → its phase and percent. */
export function progress(line: string): { phase: string; percent?: number } | null {
  const text = line.replace(/^remote:\s*/, '').trim();
  const m = /^([A-Za-z][A-Za-z ]+?):\s+(\d+)%/.exec(text);
  if (m) return { phase: m[1], percent: Number(m[2]) };
  const n = /^([A-Za-z][A-Za-z ]+?):\s+\d+/.exec(text);
  if (n) return { phase: n[1] };
  return null;
}

/** Git's environment for the network: ssh asks the helper (or, quietly,
 * fails at once) unless the user set their own ssh command. */
export async function networkEnv(repo: { config(key: string): Promise<string | null> } | null, quiet: boolean): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const own = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH || (repo && (await repo.config('core.sshCommand')));
  if (!own) env.GIT_SSH_COMMAND = quiet ? 'ssh -o BatchMode=yes -o ConnectTimeout=20' : 'ssh -o ConnectTimeout=20';
  return env;
}

/** Runs git for the network, sending its progress and asking its prompts. */
export async function network(
  git: Git,
  cwd: string,
  args: string[],
  ch: Channel,
  askpass: Askpass | null,
  o: { repo?: Repo; conflicts?: boolean; config?: string[] } = {},
): Promise<Outcome> {
  let cancelledPrompt = false;
  const ask: Asker = async (p) => {
    const answer = await ch.ask(p);
    if (answer === null) cancelledPrompt = true;
    return answer;
  };
  const session = askpass ? await askpass.session(ask) : null;
  let last = 0;
  let pending: SyncEvent | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (pending) ch.emit(pending);
    pending = null;
    last = Date.now();
  };
  let rest = '';
  const onStderr = (text: string) => {
    rest += text;
    const parts = rest.split(/[\r\n]/);
    rest = parts.pop() ?? '';
    for (const line of parts) {
      const p = progress(line);
      if (!p) continue;
      pending = { type: 'progress', ...p, text: line.replace(/^remote:\s*/, '').trim() };
      // At most ten a second.
      if (Date.now() - last >= 100) flush();
      else timer ??= setTimeout(flush, 100);
    }
  };
  const run: RunOptions = {
    signal: ch.signal,
    onStderr,
    env: { ...(await networkEnv(o.repo ?? null, !askpass)), ...(session?.env ?? {}) },
    config: o.config,
  };
  try {
    if (o.conflicts && o.repo) return await conflicted(o.repo, args, run);
    const out = await git.exec(cwd, args, run);
    if (out.code !== 0) {
      if (cancelledPrompt) throw new PluginError('Signing in was cancelled.');
      throw new PluginError(explain(out.stderr, out.stdout.toString('utf8')));
    }
    const text = `${out.stdout.toString('utf8')}\n${out.stderr}`;
    if (/Everything up-to-date|Already up to date/i.test(text)) return { conflicts: false, message: 'Already up to date.' };
    return { conflicts: false };
  } catch (e) {
    if (cancelledPrompt && !(e instanceof PluginError && e.message === 'Cancelled.')) throw new PluginError('Signing in was cancelled.');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    session?.end();
  }
}
