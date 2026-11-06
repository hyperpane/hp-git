// A Git window's frame without the app: a DOM (happy-dom), the shell's
// transform (hooks.ts), and a fake app on the other end of a real
// MessageChannel that speaks the frame RPC (sdk/RPC.md) to the real client
// SDK. Calls to the Git server part go to the real one (src/server), in
// this process, on temporary repositories, or to a fake the test gives.

import './hooks.ts';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessageChannel, type MessagePort } from 'node:worker_threads';

GlobalRegistrator.register({ url: 'http://plugin.localhost/', width: 1040, height: 680 });
Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..', '..', '..');

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const sdk = await import('@hyperpane/sdk/client');
const testing = (await import('@hyperpane/sdk/testing')) as unknown as {
  setCurrentHost(host: unknown): void;
  setPlatformOs(os: string | null): void;
  testHost(o: Record<string, unknown>): any;
};

type Host = import('@hyperpane/sdk/client').Host;
type Init = import('@hyperpane/sdk/client').Init;

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));

// Git as the tests run it: a home of its own (no user config), fixed names.
const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'git-ui-home-')));
writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n');
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.XDG_CONFIG_HOME = path.join(home, '.config');
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.on('exit', () => rmSync(home, { recursive: true, force: true }));

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
}

/** A temporary folder, as a server sends paths (forward slashes). */
export function folder(t: { after(fn: () => void): void }, prefix = 'git-ui-'): string {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix))).replaceAll('\\', '/');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function write(dir: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
}

/** A repository on main with `files` committed. */
export function repo(t: { after(fn: () => void): void }, files: Record<string, string>, message = 'first'): string {
  const dir = folder(t, 'git-ui-repo-');
  sh(dir, 'init', '-q', '-b', 'main');
  write(dir, files);
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', message);
  return dir;
}

export const read = (dir: string, name: string) => readFileSync(path.join(dir, name), 'utf8');

/** The real server part, with a test host and a folder for its Trash. */
export async function realPart(t: { after(fn: () => void): void }, projectFolder: string) {
  const { makeGit } = await import(pathToFileURL(path.join(pkg, 'src', 'server', 'plugin.ts')).href);
  const { folderTrash } = await import(pathToFileURL(path.join(pkg, 'src', 'server', 'lib', 'trash.ts')).href);
  const trash = folder(t, 'git-ui-trash-');
  const data = folder(t, 'git-ui-data-');
  const host = testing.testHost({
    id: 'git',
    dataDir: data,
    projects: [{ id: 'p1', name: 'project', folder: projectFolder }],
    settings: { gitPath: '', autoFetch: 'off', defaultBranch: 'main' },
    events: { publish: ['git.changed', 'git.committed', 'git.checkedOut'], subscribe: ['git.status', 'git.open', 'git.changed', 'git.committed', 'git.checkedOut'] },
  });
  const part = makeGit({ trash: folderTrash(trash) })(host);
  t.after(() => part.shutdown?.());
  return { part, trash };
}

export interface Sent {
  id: number;
  m: string;
  a: any;
}

/** What a fake server is handed for each call or subscription. */
export interface ServerCall {
  request: any;
  subscribing: boolean;
  /** For a subscription: an event, and its end. */
  send(v: unknown): void;
  end(error?: string): void;
  signal: AbortSignal;
}

type Part = { call(payload: Uint8Array, sink: any): void };
type Fake = (c: ServerCall) => unknown;

/** The app's end of the port. */
export class FakeApp {
  readonly sent: Sent[] = [];
  readonly logs: { level: string; message: string; stack?: string }[] = [];
  answers: Record<string, (a: any) => unknown> = {};
  readonly port: MessagePort;
  readonly init: Init;
  /** Server subscriptions by id, while open; and the ids the frame cancelled. */
  readonly open = new Map<number, { request: any; controller: AbortController }>();
  readonly cancelled: { id: number; request: any }[] = [];
  #part: Part | null;
  #fake: Fake | null;
  #bus = new Map<number, string>();

  constructor(port: MessagePort, init: Init, server: { part?: Part; fake?: Fake }) {
    this.port = port;
    this.init = init;
    this.#part = server.part ?? null;
    this.#fake = server.fake ?? null;
    port.on('message', (msg: any) => this.#receive(msg));
  }

  #post(msg: unknown) {
    this.port.postMessage(msg);
  }

  #receive(msg: any) {
    if (msg.t === 'hello') return this.#post({ t: 'init', v: this.init });
    if (msg.t === 'batch') return msg.m.forEach((m: any) => this.#receive(m));
    if (msg.t === 'log') return void this.logs.push(msg);
    if (msg.t === 'cancel') {
      this.#bus.delete(msg.id);
      const s = this.open.get(msg.id);
      if (s) {
        this.cancelled.push({ id: msg.id, request: s.request });
        s.controller.abort();
        this.open.delete(msg.id);
      }
      return;
    }
    if (msg.t !== 'req') return;
    this.sent.push({ id: msg.id, m: msg.m, a: msg.a });
    if (msg.m === 'server.call' || msg.m === 'server.subscribe') return this.#server(msg.id, msg.m === 'server.subscribe', msg.a);
    if (msg.m === 'bus.subscribe') {
      this.#bus.set(msg.id, msg.a.pattern);
      return this.#post({ t: 'res', id: msg.id, ok: true });
    }
    const answer = this.answers[msg.m] ?? DEFAULTS[msg.m];
    Promise.resolve()
      .then(() => answer?.(msg.a))
      .then(
        (v) => this.#post(v === undefined ? { t: 'res', id: msg.id, ok: true } : { t: 'res', id: msg.id, ok: true, v }),
        (e: Error) => this.#post({ t: 'res', id: msg.id, ok: false, error: e.message }),
      );
  }

  #server(id: number, subscribing: boolean, a: { plugin: string; request: any }) {
    if (a.plugin !== 'git') return this.#post({ t: 'res', id, ok: false, error: `${a.plugin} isn't installed here.` });
    const controller = new AbortController();
    let ended = false;
    if (subscribing) {
      this.open.set(id, { request: a.request, controller });
      this.#post({ t: 'res', id, ok: true });
    }
    const event = (v: unknown) => {
      if (controller.signal.aborted || ended) return false;
      this.#post({ t: 'sub', id, v });
      return true;
    };
    const end = (error?: string) => {
      if (ended) return;
      ended = true;
      this.open.delete(id);
      if (!controller.signal.aborted) this.#post(error ? { t: 'subEnd', id, error } : { t: 'subEnd', id });
    };
    // A reply to a subscription: its one event, then its end (as the app does).
    const reply = (v: unknown) => {
      if (subscribing) {
        event(v);
        end();
      } else this.#post({ t: 'res', id, ok: true, v });
    };
    const fail = (error: string) => {
      if (subscribing) end(error);
      else this.#post({ t: 'res', id, ok: false, error });
    };
    if (this.#fake) {
      let streaming = false;
      Promise.resolve()
        .then(() =>
          this.#fake!({
            request: a.request,
            subscribing,
            send: (v) => {
              streaming = true;
              event(v);
            },
            end: (e) => {
              streaming = true;
              end(e);
            },
            signal: controller.signal,
          }),
        )
        .then(
          (v) => {
            if (v === STREAM || streaming) return;
            reply(v ?? null);
          },
          (e: Error) => fail(e.message),
        );
      return;
    }
    this.#part!.call(encode(a.request), {
      reply: (r: Uint8Array | { error: string }) => (r instanceof Uint8Array ? reply(decode(r)) : fail(r.error)),
      subscribed: () => {},
      event: (v: Uint8Array) => event(decode(v)),
      end: (reason?: string) => end(reason ?? undefined),
      get open() {
        return !controller.signal.aborted && !ended;
      },
      signal: controller.signal,
      from: null,
      project: 'p1',
    });
  }

  /** A bus event to the frame's subscriptions that take it. */
  publish(topic: string, data: unknown) {
    for (const [id, pattern] of this.#bus) {
      if (pattern === '*' || pattern === topic || (pattern.endsWith('.*') && topic.startsWith(pattern.slice(0, -1))))
        this.#post({ t: 'sub', id, v: { id: 1, topic, data, from: { plugin: 'other', part: 'client' }, project: 'p1', time: Date.now() } });
    }
  }

  /** An event, as the app sends it. */
  event(e: string, v?: unknown) {
    this.#post({ t: 'ev', e, v });
  }

  calls(m: string): any[] {
    return this.sent.filter((s) => s.m === m).map((s) => s.a);
  }

  last(m: string): any {
    return this.calls(m).at(-1);
  }

  /** The server requests the frame made, of an op. */
  ops(op: string): any[] {
    return this.sent
      .filter((s) => s.m === 'server.call' || s.m === 'server.subscribe')
      .map((s) => (s.a.request?.op === 'once' ? s.a.request.call : s.a.request))
      .filter((r) => r?.op === op);
  }

  stop() {
    for (const s of this.open.values()) s.controller.abort();
    this.port.close();
  }
}

/** A fake server's answer that says: the subscription goes on (events come from `send`). */
export const STREAM = Symbol('stream');

const DEFAULTS: Record<string, (a: any) => unknown> = {
  'ui.menu': () => null,
  'ui.confirm': () => true,
  'ui.prompt': () => null,
  'ui.dialog': () => null,
  'live.watch': () => null,
};

/** This package's settings, as the app fills them in. */
function defaults(): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(path.join(pkg, 'plugin.json'), 'utf8'));
  return Object.fromEntries((manifest.contributes?.settings ?? []).map((s: { id: string; default: unknown }) => [s.id, s.default]));
}

export interface Options {
  folder: string;
  data?: Record<string, string>;
  settings?: Record<string, unknown>;
  part?: Part;
  fake?: Fake;
  dark?: boolean;
  view?: Init['view'];
}

let nextWindow = 7;

function initFor(o: Options): Init {
  const window = { id: nextWindow++, title: '', named: false, plugin: 'git', kind: '', data: o.data ?? {}, server: null };
  return {
    api: 1,
    appVersion: '0.1.5',
    plugin: { id: 'git', version: '0.1.5' },
    view: o.view ?? { type: 'node', kind: '', window },
    project: { id: 'p1', name: 'project', folder: o.folder, server: 'local', plugins: ['git', 'editor', 'explorer', 'files', 'terminal'], windows: [] },
    servers: [{ id: 'local', name: 'This Mac', local: true, status: 'connected', os: 'macos', target: null, part: { version: '0.1.5', status: 'running' } }],
    theme: { id: o.dark === false ? 'astralyx-light' : 'astralyx-dark', dark: o.dark !== false, vars: { '--node-fg': '#eee', '--node-bg': '#111' } },
    locale: 'en-US',
    platform: { os: 'mac', desktop: true, machine: 'here', thisMachine: 'here' },
    settings: { ...defaults(), ...o.settings },
    inputs: {},
    links: [],
    focused: true,
    scroll: false,
    zoom: 1,
    shortcuts: [],
  };
}

export interface Opened {
  app: FakeApp;
  host: Host;
  root: HTMLElement;
  close(): void;
}

/** A frame of this package showing `Component`. */
export async function open(Component: (props: { host: Host }) => unknown, o: Options): Promise<Opened> {
  const init = initFor(o);
  const { port1, port2 } = new MessageChannel();
  const app = new FakeApp(port2, init, { part: o.part, fake: o.fake });
  const rpc = new sdk.Rpc(port1 as unknown as import('@hyperpane/sdk/client').PortLike);
  const host = sdk.createHost(rpc, await rpc.hello());
  testing.setCurrentHost(host);
  testing.setPlatformOs(init.platform.os);
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const react = createRoot(root);
  flushSync(() => react.render(React.createElement(sdk.HostProvider, { host }, React.createElement(Component as never, { host }))));
  return {
    app,
    host,
    root,
    close() {
      react.unmount();
      rpc.stop();
      app.stop();
      port1.close();
      root.remove();
      testing.setCurrentHost(null);
      testing.setPlatformOs(null);
    },
  };
}

/** The frame as the app starts it: main.tsx, then the app's `connect`. */
export async function boot(o: Options): Promise<{ app: FakeApp; root: HTMLElement; stop(): void }> {
  const timers: ReturnType<typeof setInterval>[] = [];
  const setInterval_ = globalThis.setInterval;
  globalThis.setInterval = ((...a: Parameters<typeof setInterval>) => {
    const timer = setInterval_(...a);
    timers.push(timer);
    return timer;
  }) as typeof setInterval;
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const parent = {} as Window;
  Object.defineProperty(window, 'parent', { value: parent, configurable: true });
  const { port1, port2 } = new MessageChannel();
  const app = new FakeApp(port2, initFor(o), { part: o.part, fake: o.fake });
  await import(pathToFileURL(path.join(pkg, 'src', 'client', 'main.tsx')).href);
  window.dispatchEvent(new MessageEvent('message', { data: { hyperpane: 'connect', api: 1 }, source: parent, ports: [port1 as never] }));
  return {
    app,
    root,
    stop() {
      timers.forEach((t) => clearInterval(t));
      globalThis.setInterval = setInterval_;
      app.stop();
      port1.close();
      root.remove();
    },
  };
}

/** Waits until `f` gives something truthy. */
export async function until<T>(f: () => T | null | undefined | false, ms = 15000, what?: string | (() => string)): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = f();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${typeof what === 'function' ? what() : (what ?? f)}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mouse(el: Element, type: string, o: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, ...o }));
}

export function click(el: Element, o: MouseEventInit = {}) {
  mouse(el, 'click', o);
}

/** A key by its physical place (`code`) and what the layout types there (`key`). */
export function key(el: Element | Window, k: string, o: KeyboardEventInit = {}) {
  (el as EventTarget).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
}

export function pointer(el: Element, type: string, o: PointerEventInit = {}) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...o }));
}

/** Sets a React-controlled field's value, as typing does. */
export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const button = (root: ParentNode, label: string | RegExp) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof label === 'string' ? b.textContent?.trim() === label || b.title === label || b.getAttribute('aria-label') === label : label.test(b.textContent ?? '') || label.test(b.title)));
