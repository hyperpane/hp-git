// A folder that isn't a repository: make it one (on the branch the settings
// say), or clone one into it (or next to it), with the clone's progress and
// a cancel; repositories found inside it are offered too.

import { useMemo, useState } from 'react';
import { FolderGit2, X } from '@hyperpane/icons';
import { type Host, useHost, useWindow } from '@hyperpane/sdk/client';
import { Progress, cn, styles } from '@hyperpane/ui';
import type { Found } from '../../shared/index.ts';
import { gitTools } from '../app/api.ts';
import { askCredentials } from '../app/credentials.ts';
import { basenameOf } from '../lib/paths.ts';
import { card, section } from '../ui/classes.ts';
import { Button } from '../ui/parts.tsx';

type Cloning = { phase: string; percent: number | null; text: string; cancel(): void };

export function Welcome({ folder, found, onDone, onChoose }: { folder: string; found: Found; onDone(root: string): void; onChoose(): void }) {
  const host: Host = useHost();
  const win = useWindow();
  const server = win?.server ?? undefined;
  const tools = useMemo(() => gitTools(host, server), [host, server]);
  const [busy, setBusy] = useState(false);
  const [cloning, setCloning] = useState<Cloning | null>(null);
  const [error, setError] = useState<string | null>(null);

  const init = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await tools.init(folder, host.settings.get<string>('defaultBranch') || undefined);
      host.app.toast(`Made ${basenameOf(made.root) || made.root} a Git repository`);
      onDone(made.root);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clone = async () => {
    const answer = await host.ui.dialog<{ url: string; into: string }>('clone', { title: 'Clone a repository', data: { folder }, width: 480, height: 210 });
    if (!answer) return;
    setError(null);
    let root: string | null = null;
    let over = false;
    const cancel = tools.clone(
      answer.url,
      answer.into,
      (e) => {
        if (e.type === 'progress') setCloning((c) => (c ? { ...c, phase: e.phase, percent: e.percent ?? null, text: e.text } : c));
        else if (e.type === 'prompt') askCredentials(host, e, tools.answer);
        else if (e.type === 'done') root = e.result.root ?? answer.into;
      },
      (err) => {
        if (over) return;
        over = true;
        setCloning(null);
        if (err && err !== 'Cancelled.') setError(err);
        else if (root) {
          host.app.toast(`Cloned into ${root}`);
          host.win.setData('folder', root);
          host.win.setData('repo', null);
        }
      },
    );
    setCloning({
      phase: 'Starting',
      percent: null,
      text: '',
      cancel: () => {
        over = true;
        cancel();
        setCloning(null);
      },
    });
  };

  return (
    <div className="git-scroll flex h-full flex-col items-center justify-center gap-5 overflow-auto p-6 text-center text-[13px]" data-welcome>
      <div className="rounded-surface grid size-12 place-items-center bg-[var(--git-accent-soft)] text-[var(--node-accent)] ring-1 ring-[color-mix(in_srgb,var(--node-accent)_22%,transparent)] ring-inset">
        <FolderGit2 aria-hidden className="size-6" />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{basenameOf(folder) || folder} isn’t a Git repository</div>
        <div className="font-mono text-xs break-all text-[var(--node-muted)]">{folder}</div>
      </div>
      {cloning ? (
        <div className="flex w-80 max-w-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              Cloning: {cloning.phase}
              {cloning.percent !== null ? ` ${Math.round(cloning.percent)}%` : ''}
            </span>
            <Button variant="ghost" onClick={cloning.cancel}>
              <X />
              Cancel
            </Button>
          </div>
          <Progress value={cloning.percent} size="sm" label="Cloning" />
          {cloning.text && <div className="truncate text-left font-mono text-[11px] text-[var(--node-muted)]">{cloning.text}</div>}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" lg disabled={busy} onClick={init}>
            {busy ? 'Initializing' : 'Initialize Repository'}
          </Button>
          <Button lg onClick={clone}>
            Clone
          </Button>
          <Button variant="ghost" lg onClick={onChoose}>
            Open Another Folder
          </Button>
        </div>
      )}
      {error && <div className="max-w-md text-xs text-[var(--git-deleted)]">{error}</div>}
      {found.repos.length > 0 && (
        <div className={cn(card, 'mt-2 flex w-80 max-w-full flex-col gap-0.5 p-1.5 text-left')}>
          <div className={cn(section.header, 'px-2')}>Repositories in this folder</div>
          {found.repos.slice(0, 12).map((r) => (
            <button
              key={r.root}
              type="button"
              className={cn(
                'rounded-control flex h-8 items-center gap-2 px-2 transition-colors duration-100 hover:bg-[var(--node-hover)] touch:h-10',
                styles.focusRing,
              )}
              onClick={() => {
                host.win.setData('folder', r.root);
                host.win.setData('repo', null);
              }}
            >
              <FolderGit2 variant="outline" className="size-4 flex-none text-[var(--node-muted)]" />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="truncate text-xs text-[var(--node-muted)]">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
