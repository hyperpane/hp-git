// A repository: its root, its git folders, and git run in it.

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { PluginError, fromClient, shown } from '@hyperpane/sdk/server';
import type { Identity } from '../../shared/index.ts';
import type { Git } from './git.ts';
import type { Output, RunOptions } from './process.ts';

export class Repo {
  readonly git: Git;
  /** The working tree's root, the git folder (a worktree's own) and the
   * common one (refs, objects, config), as this system writes paths. */
  readonly root: string;
  readonly gitDir: string;
  readonly commonDir: string;
  /** For the project these calls are for (the server tracks git there). */
  project?: string;
  private emptyTreeId: string | null = null;

  constructor(git: Git, root: string, gitDir: string, commonDir: string) {
    this.git = git;
    this.root = root;
    this.gitDir = gitDir;
    this.commonDir = commonDir;
  }

  get shownRoot(): string {
    return shown(this.root);
  }

  get shownGitDir(): string {
    return shown(this.gitDir);
  }

  #o(o: RunOptions): RunOptions {
    return this.project && !o.project ? { ...o, project: this.project } : o;
  }

  exec(args: readonly string[], o: RunOptions = {}): Promise<Output> {
    return this.git.exec(this.root, args, this.#o(o));
  }

  run(args: readonly string[], o: RunOptions = {}): Promise<Output> {
    return this.git.run(this.root, args, this.#o(o));
  }

  text(args: readonly string[], o: RunOptions = {}): Promise<string> {
    return this.git.text(this.root, args, this.#o(o));
  }

  ok(args: readonly string[], o: RunOptions = {}): Promise<boolean> {
    return this.git.ok(this.root, args, this.#o(o));
  }

  /** A config value (any scope), or null. */
  async config(key: string): Promise<string | null> {
    const out = await this.exec(['config', '--get', key]);
    const v = out.stdout.toString('utf8').trim();
    return out.code === 0 && v ? v : null;
  }

  async identity(): Promise<Identity> {
    const out = await this.exec(['config', '-z', '--get-regexp', String.raw`^user\.(name|email)$`]);
    const id: Identity = { name: null, email: null };
    for (const entry of out.stdout.toString('utf8').split('\0')) {
      const nl = entry.indexOf('\n');
      if (nl < 0) continue;
      const key = entry.slice(0, nl).toLowerCase();
      const value = entry.slice(nl + 1);
      if (key === 'user.name') id.name = value || null;
      if (key === 'user.email') id.email = value || null;
    }
    return id;
  }

  /** Whether HEAD is a commit yet. */
  hasHead(): Promise<boolean> {
    return this.ok(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  }

  /** The empty tree's id here (SHA-256 repositories have another). */
  async emptyTree(): Promise<string> {
    this.emptyTreeId ??= (await this.text(['hash-object', '-t', 'tree', '--stdin'], { input: '' })).trim();
    return this.emptyTreeId;
  }

  /** The branch HEAD is on, or null when detached. */
  async currentBranch(): Promise<string | null> {
    const out = await this.exec(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    return out.code === 0 ? out.stdout.toString('utf8').trim() : null;
  }

  /** A whole path in the working tree. */
  file(rel: string): string {
    return path.join(this.root, ...rel.split('/'));
  }
}

/** A path from a client: `~` expanded, either slash; it must be whole. */
export function whole(p: unknown): string {
  if (typeof p !== 'string' || !p.trim()) throw new PluginError('Which repository? No path was given.');
  const text = p.trim();
  const full = fromClient(text);
  if (!path.isAbsolute(full)) throw new PluginError(`${text} isn't a whole path.`);
  return path.resolve(full);
}

interface Known {
  repo: Repo;
  checked: number;
}

/** Repositories by the path a client gave, so each call needn't ask git
 * where the root is. Checked again (its git folder still there) every 2 s. */
export class Repos {
  #git: Git;
  #known = new Map<string, Known>();

  constructor(git: Git) {
    this.#git = git;
  }

  async open(p: unknown, project?: string | null): Promise<Repo> {
    const folder = whole(p);
    const known = this.#known.get(folder);
    if (known) {
      if (Date.now() - known.checked < 2000 || (await exists(known.repo.gitDir))) {
        known.checked = Date.now();
        return withProject(known.repo, project);
      }
      this.#known.delete(folder);
    }
    if (!(await isDir(folder))) throw new PluginError(`${shown(folder)} isn't there.`);
    const out = await this.#git.exec(folder, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir']);
    const lines = out.stdout.toString('utf8').split('\n');
    if (out.code !== 0 || lines.length < 3 || !lines[0]) {
      if (/not a git repository/i.test(out.stderr)) throw new PluginError(`${shown(folder)} isn't in a Git repository.`);
      if (/this operation must be run in a work tree|bare repository/i.test(out.stderr)) throw new PluginError(`${shown(folder)} is a bare repository: it has no files to work with.`);
      throw new PluginError(out.stderr.trim().replace(/^fatal: /, '') || `${shown(folder)} isn't in a Git repository.`);
    }
    const root = path.resolve(lines[0]);
    const gitDir = path.resolve(lines[1]);
    const commonDir = path.resolve(root, lines[2]);
    const repo = new Repo(this.#git, root, gitDir, commonDir);
    this.#known.set(folder, { repo, checked: Date.now() });
    if (folder !== root) this.#known.set(root, { repo, checked: Date.now() });
    return withProject(repo, project);
  }

  forget(folder?: string) {
    if (folder === undefined) this.#known.clear();
    else this.#known.delete(path.resolve(folder));
  }
}

function withProject(repo: Repo, project?: string | null): Repo {
  // The project of the latest call: git's processes are tracked there.
  if (project) repo.project = project;
  return repo;
}

const exists = (p: string) => stat(p).then(() => true, () => false);
const isDir = (p: string) => stat(p).then((s) => s.isDirectory(), () => false);
