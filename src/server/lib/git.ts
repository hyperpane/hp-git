// Running `git`: finding it (the setting, PATH, Git for Windows' and
// Homebrew's usual places), one environment for every call (nothing waits
// for a terminal, output that parses the same everywhere), limits on what's
// read, cancelling (the whole process tree goes), and errors put plainly.
//
// The process itself is lib/process.ts; finding git, lib/find-git.ts.

import type { ChildProcess } from 'node:child_process';
import { type Host, PluginError } from '@hyperpane/sdk/server';
import { explain } from './explain.ts';
import { findGit } from './find-git.ts';
import { type Output, type RunOptions, Cancelled, collect, spawnError } from './process.ts';
import { WIN } from './platform.ts';

/** What every call shares: no pager, no colour, paths as they are, no
 * advice; and nothing that waits for an answer nobody can give. */
const COMMON = ['--no-pager', '-c', 'color.ui=false', '-c', 'core.quotePath=false', '-c', 'advice.detachedHead=false'];

export function baseEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_EDITOR: 'true',
    GIT_SEQUENCE_EDITOR: 'true',
    GIT_MERGE_AUTOEDIT: 'no',
    GIT_PAGER: 'cat',
    // Never write the index just to read the status (it would set off the
    // watch, and race other commands).
    GIT_OPTIONAL_LOCKS: '0',
    // Messages in English, so they can be explained.
    LC_ALL: 'C',
    LANGUAGE: 'C',
  };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_CEILING_DIRECTORIES']) delete env[name];
  return env;
}

export class Git {
  #host: Host;
  #configured: () => Promise<string>;
  #found: Promise<{ path: string; version: string } | null> | null = null;
  #setting = '';
  /** Processes running now. */
  running = 0;

  constructor(host: Host, configured: () => Promise<string>) {
    this.#host = host;
    this.#configured = configured;
  }

  /** Looks for git again (the setting changed). */
  forget() {
    this.#found = null;
  }

  async which(): Promise<{ path: string; version: string } | null> {
    const setting = (await this.#configured()).trim();
    if (setting !== this.#setting) {
      this.#setting = setting;
      this.#found = null;
    }
    this.#found ??= findGit(setting);
    const found = await this.#found;
    if (!found) this.#found = null;
    return found;
  }

  async path(): Promise<string> {
    const found = await this.which();
    if (!found) {
      throw new PluginError(this.#setting ? `Git isn't at ${this.#setting} (the Git executable setting).` : "Git isn't installed on this server.");
    }
    return found.path;
  }

  /** Git in `cwd`, whatever its exit code. */
  async exec(cwd: string, args: readonly string[], o: RunOptions = {}): Promise<Output> {
    if (o.signal?.aborted) throw new Cancelled();
    const file = await this.path();
    const full = [...COMMON, ...(WIN ? ['-c', 'core.askPass='] : []), ...(o.config ?? []), ...args];
    const env = { ...baseEnv(), ...(o.env ?? {}) };
    let child: ChildProcess;
    try {
      child = this.#host.spawn(file, full, {
        cwd,
        env: env as NodeJS.ProcessEnv,
        stdio: [o.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        // Its own process group, so a cancel takes everything it started.
        detached: !WIN,
        windowsHide: true,
        ...(o.project ? { project: o.project } : {}),
      });
    } catch (e) {
      throw spawnError(e);
    }
    this.running++;
    try {
      return await collect(child, o);
    } finally {
      this.running--;
    }
  }

  /** Git, failing (with its complaint put plainly) on an exit code not in `ok`. */
  async run(cwd: string, args: readonly string[], o: RunOptions = {}): Promise<Output> {
    const out = await this.exec(cwd, args, o);
    if (out.code === 0 || o.ok?.includes(out.code) || out.cut) return out;
    throw new PluginError(explain(out.stderr, out.stdout.toString('utf8')));
  }

  /** Git's stdout as text, when it succeeds. */
  async text(cwd: string, args: readonly string[], o: RunOptions = {}): Promise<string> {
    return (await this.run(cwd, args, o)).stdout.toString('utf8');
  }

  /** Whether git exits 0 (a check: `rev-parse --verify`, `show-ref`). */
  async ok(cwd: string, args: readonly string[], o: RunOptions = {}): Promise<boolean> {
    return (await this.exec(cwd, args, o)).code === 0;
  }
}
