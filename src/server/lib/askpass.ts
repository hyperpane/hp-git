// Credentials: git and ssh ask a helper program (GIT_ASKPASS, SSH_ASKPASS)
// for a username, a password, a key's passphrase or about a new host key.
// The helper is a small Node script that asks this process over a local
// socket (a Unix socket in a private folder, a named pipe on Windows), and
// this process asks the user through the sync or clone subscription that
// runs git: a `prompt` event, answered with the `answer` op.

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { PromptKind } from '../../shared/index.ts';
import { WIN } from './platform.ts';

/** The helper: prints the answer, or fails (exit 1) when there's none. */
const SCRIPT = `// Answers git's and ssh's prompts for the Git plugin, by asking it.
import net from 'node:net';
const socket = process.env.HYPERPANE_GIT_ASKPASS_SOCKET;
const token = process.env.HYPERPANE_GIT_ASKPASS_TOKEN;
if (!socket || !token) process.exit(1);
const prompt = process.argv.slice(2).join(' ');
const c = net.connect(socket);
let data = '';
c.setEncoding('utf8');
c.on('connect', () => c.write(JSON.stringify({ token, prompt }) + '\\n'));
c.on('data', (d) => {
  data += d;
  const nl = data.indexOf('\\n');
  if (nl < 0) return;
  let answer = null;
  try { answer = JSON.parse(data.slice(0, nl)); } catch {}
  c.end();
  if (!answer || typeof answer.value !== 'string') process.exit(1);
  process.stdout.write(answer.value + '\\n', () => process.exit(0));
});
c.on('error', () => process.exit(1));
c.on('close', () => { if (!data.includes('\\n')) process.exit(1); });
`;

/** What runs it: a shell script, or a batch file on Windows. Both read
 * where Node and the script are from the environment, so they never change. */
const LAUNCHER = WIN
  ? '@"%HYPERPANE_GIT_NODE%" "%HYPERPANE_GIT_ASKPASS_SCRIPT%" %*\r\n'
  : '#!/bin/sh\nexec "$HYPERPANE_GIT_NODE" "$HYPERPANE_GIT_ASKPASS_SCRIPT" "$@"\n';

export interface Prompt {
  prompt: string;
  secret: boolean;
  kind: PromptKind;
}

/** Answers a prompt: the text, or null to cancel. */
export type Asker = (p: Prompt) => Promise<string | null>;

export function classify(prompt: string): Prompt {
  const p = prompt.trim();
  if (/^username\b/i.test(p)) return { prompt: p, secret: false, kind: 'username' };
  if (/continue connecting|\(yes\/no/i.test(p)) return { prompt: p, secret: false, kind: 'hostKey' };
  if (/passphrase/i.test(p)) return { prompt: p, secret: true, kind: 'passphrase' };
  if (/password|token/i.test(p)) return { prompt: p, secret: true, kind: 'password' };
  return { prompt: p, secret: /pin\b|secret|otp|code/i.test(p), kind: 'other' };
}

export class Askpass {
  #dir: string;
  #server: net.Server | null = null;
  #socket = '';
  #ready: Promise<void> | null = null;
  #askers = new Map<string, Asker>();
  #files: { launcher: string; script: string } | null = null;

  /** `dir`: where the helper is written (the plugin's data folder). */
  constructor(dir: string) {
    this.#dir = dir;
  }

  /** The environment for one run of git whose prompts `ask` answers, and
   * the function that ends it. */
  async session(ask: Asker): Promise<{ env: Record<string, string>; end: () => void }> {
    await this.#start();
    const token = randomBytes(16).toString('hex');
    this.#askers.set(token, ask);
    const files = this.#files!;
    const env: Record<string, string> = {
      GIT_ASKPASS: files.launcher,
      SSH_ASKPASS: files.launcher,
      SSH_ASKPASS_REQUIRE: 'force',
      HYPERPANE_GIT_NODE: process.execPath,
      HYPERPANE_GIT_ASKPASS_SCRIPT: files.script,
      HYPERPANE_GIT_ASKPASS_SOCKET: this.#socket,
      HYPERPANE_GIT_ASKPASS_TOKEN: token,
    };
    // Older ssh asks the helper only when there's a display.
    if (!process.env.DISPLAY && !WIN) env.DISPLAY = ':0';
    return { env, end: () => this.#askers.delete(token) };
  }

  #start(): Promise<void> {
    this.#ready ??= (async () => {
      await mkdir(this.#dir, { recursive: true });
      const script = path.join(this.#dir, 'askpass.mjs');
      const launcher = path.join(this.#dir, WIN ? 'askpass.cmd' : 'askpass.sh');
      await writeIfChanged(script, SCRIPT, 0o600);
      await writeIfChanged(launcher, LAUNCHER, 0o700);
      this.#files = { launcher, script };
      if (WIN) this.#socket = `\\\\.\\pipe\\hyperpane-git-${process.pid}-${randomBytes(6).toString('hex')}`;
      else {
        // A private folder: only this user can reach the socket. Short, for
        // the socket path's length limit.
        const base = await mkdtemp(path.join(os.tmpdir(), 'hp-git-'));
        await chmod(base, 0o700);
        this.#socket = path.join(base, 's');
      }
      const server = net.createServer((c) => this.#serve(c));
      server.unref();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.#socket, () => resolve());
      });
      this.#server = server;
    })();
    this.#ready.catch(() => {
      this.#ready = null;
    });
    return this.#ready;
  }

  #serve(c: net.Socket) {
    c.setEncoding('utf8');
    let data = '';
    let answered = false;
    const reply = (value: string | null) => {
      if (answered) return;
      answered = true;
      c.end(`${JSON.stringify(value === null ? { cancel: true } : { value })}\n`);
    };
    c.on('error', () => {});
    c.on('data', (d: string) => {
      data += d;
      const nl = data.indexOf('\n');
      if (nl < 0 || answered) return;
      let req: { token?: string; prompt?: string } = {};
      try {
        req = JSON.parse(data.slice(0, nl));
      } catch {
        return reply(null);
      }
      const ask = req.token ? this.#askers.get(req.token) : undefined;
      if (!ask) return reply(null);
      ask(classify(String(req.prompt ?? ''))).then(reply, () => reply(null));
    });
  }

  async close() {
    const server = this.#server;
    this.#server = null;
    this.#ready = null;
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (!WIN && this.#socket) await rm(path.dirname(this.#socket), { recursive: true, force: true });
  }
}

async function writeIfChanged(file: string, text: string, mode: number) {
  const now = await readFile(file, 'utf8').catch(() => null);
  if (now !== text) {
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, text, { mode });
    await rename(temp, file);
  }
  if (!WIN) await chmod(file, mode);
}
