// A folder that isn't a repository: make it one (on the branch the settings
// say), or clone one into it (or next to it), with the clone's progress and
// a cancel; repositories found inside it are offered too.

import { useMemo, useState } from 'react';
import { FolderGit2, GitBranch, X } from 'lucide-react';
import { type Host, useHost, useWindow } from '@hyperpane/sdk/client';
import { Button, NodeButton } from '@hyperpane/ui';
import type { Found } from '../../shared/index.ts';
import { gitTools } from '../app/api.ts';
import { askCredentials } from '../app/credentials.ts';
import { Progress } from '../components/Progress.tsx';
import { basenameOf } from '../lib/paths.ts';

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
      host.app.toast(`Made ${basenameOf(made.root) || made.root} a Git repository.`);
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
          host.app.toast(`Cloned into ${root}.`);
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
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-auto p-6 text-center text-xs" data-welcome>
      <FolderGit2 className="size-10 text-[var(--node-muted)] opacity-80" strokeWidth={1.25} />
      <div className="flex max-w-md flex-col gap-1">
        <div className="text-base font-semibold">{basenameOf(folder) || folder} isn’t a Git repository</div>
        <div className="break-all text-[var(--node-muted)]">{folder}</div>
      </div>
      {cloning ? (
        <div className="flex w-80 max-w-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-left">
              Cloning… {cloning.phase}
              {cloning.percent !== null ? ` ${Math.round(cloning.percent)}%` : ''}
            </span>
            <NodeButton onClick={cloning.cancel}>
              <X />
              Cancel
            </NodeButton>
          </div>
          <Progress percent={cloning.percent} className="h-1" />
          {cloning.text && <div className="truncate text-left font-mono text-2xs text-[var(--node-muted)]">{cloning.text}</div>}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" disabled={busy} onClick={init}>
            {busy ? 'Initializing…' : 'Initialize Repository'}
          </Button>
          <Button size="sm" variant="secondary" onClick={clone}>
            Clone…
          </Button>
          <Button size="sm" variant="ghost" onClick={onChoose}>
            Open Another Folder…
          </Button>
        </div>
      )}
      {error && <div className="max-w-md text-[var(--ansi-1)]">{error}</div>}
      {found.repos.length > 0 && (
        <div className="flex w-80 max-w-full flex-col gap-1 text-left">
          <div className="text-2xs font-semibold tracking-wide text-[var(--node-muted)] uppercase">Repositories in this folder</div>
          {found.repos.slice(0, 12).map((r) => (
            <button
              key={r.root}
              type="button"
              className="rounded-chip flex h-7 items-center gap-2 px-2 hover:bg-[var(--node-hover)]"
              onClick={() => {
                host.win.setData('folder', r.root);
                host.win.setData('repo', null);
              }}
            >
              <GitBranch className="size-3.5 flex-none text-[var(--node-muted)]" />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="truncate text-2xs text-[var(--node-muted)]">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
