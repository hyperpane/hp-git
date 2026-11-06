// A git process: what it's given (stdin, limits, a signal, a timeout, more
// environment) and what it gives back, read as it comes within the limits;
// stopped, with everything it started, when it's cancelled, it times out or
// a reader has enough.

import type { ChildProcess } from 'node:child_process';
import { PluginError, killTree } from '@hyperpane/sdk/server';
import { WIN } from './platform.ts';

/** What a call to git gave back. */
export interface Output {
  stdout: Buffer;
  stderr: string;
  code: number;
  /** Stdout went past the limit (or the reader stopped it) and the rest wasn't read. */
  cut: boolean;
}

export interface RunOptions {
  /** Given on stdin. */
  input?: string | Uint8Array;
  /** Exit codes besides 0 that aren't failures. */
  ok?: number[];
  /** The most of stdout to keep; past it git is stopped. */
  limit?: number;
  /** Stops git (and what it started) when aborted. */
  signal?: AbortSignal;
  /** Stops git after this long (ms). */
  timeout?: number;
  /** More environment. */
  env?: Record<string, string | undefined>;
  /** Stdout as it comes; returning false stops git (the output is `cut`). */
  onStdout?: (chunk: Buffer) => boolean | void;
  /** Stderr as it comes (progress). */
  onStderr?: (text: string) => void;
  /** Git's own options before the command (`-c x=y`). */
  config?: string[];
  /** The project it runs for (the server tracks the process there). */
  project?: string;
}

/** Thrown when a call is cancelled. */
export class Cancelled extends PluginError {
  constructor() {
    super('Cancelled.');
  }
}

export function spawnError(e: unknown): Error {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return new PluginError("Git isn't installed on this server.");
  return new PluginError(`Couldn't run git: ${(e as Error)?.message ?? e}.`);
}

/** Ends a child and everything below it: asked first (git removes its
 * lock files when it's told to stop), made to soon after. */
export function stop(child: ChildProcess) {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  if (WIN) {
    killTree(pid).catch(() => {});
    return;
  }
  const signal = (name: NodeJS.Signals) => {
    try {
      // The group: git and its helpers (ssh, remote-https, pack-objects).
      process.kill(-pid, name);
    } catch {
      // Not a group of its own: the tree, by parent.
      if (name === 'SIGKILL') killTree(pid).catch(() => {});
      else child.kill(name);
    }
  };
  signal('SIGTERM');
  const later = setTimeout(() => {
    // The group may outlive git (a helper that ignored SIGTERM).
    signal('SIGKILL');
  }, 1000);
  later.unref();
}

export function collect(child: ChildProcess, o: RunOptions): Promise<Output> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let cut = false;
    let stderr = '';
    let done = false;
    let cancelled = false;
    let timedOut = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      o.signal?.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
      fn();
    };
    const onAbort = () => {
      cancelled = true;
      stop(child);
      // Answered at once: whatever still holds git's output ends with it.
      finish(() => reject(new Cancelled()));
    };
    o.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = o.timeout
      ? setTimeout(() => {
          timedOut = true;
          stop(child);
        }, o.timeout)
      : null;

    child.on('error', (e) => finish(() => reject(spawnError(e))));
    child.stdout!.on('data', (chunk: Buffer) => {
      if (cut) return;
      if (o.onStdout) {
        if (o.onStdout(chunk) === false) {
          cut = true;
          stop(child);
        }
        return;
      }
      if (o.limit !== undefined && size + chunk.length > o.limit) {
        chunks.push(chunk.subarray(0, o.limit - size));
        size = o.limit;
        cut = true;
        stop(child);
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (text: string) => {
      if (stderr.length < 1024 * 1024) stderr += text;
      o.onStderr?.(text);
    });
    if (o.input !== undefined && child.stdin) {
      child.stdin.on('error', () => {
        // Git stopped reading (it failed): its stderr says why.
      });
      child.stdin.end(typeof o.input === 'string' ? Buffer.from(o.input, 'utf8') : o.input);
    }
    child.on('close', (code, signal) => {
      finish(() => {
        if (cancelled) return reject(new Cancelled());
        if (timedOut) return reject(new PluginError(`Git took longer than ${Math.round((o.timeout ?? 0) / 1000)} seconds and was stopped.`));
        resolve({ stdout: Buffer.concat(chunks), stderr, code: cut ? 0 : (code ?? (signal ? 128 : -1)), cut });
      });
    });
  });
}
