// A Git window's start: the folder it shows (its own, else the project's,
// on the project's server), the repository that folder is in (looked for
// again while the server part is being installed or restarts), or what to
// do when there's none (views/Welcome.tsx). The repository opens in
// RepoWindow.tsx.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Host, useData, useProject, useServerPart, useWindow } from '@hyperpane/sdk/client';
import { codeHighlightCss } from '@hyperpane/code';
import { NodeButton, NodeMessage } from '@hyperpane/ui';
import type { Found } from '../../shared/index.ts';
import { Blank } from '../components/Blank.tsx';
import { DIFF_CSS } from '../components/diff/styles.ts';
import { useGitStyles } from '../hooks/useGitStyles.ts';
import { basenameOf } from '../lib/paths.ts';
import { Welcome } from '../views/Welcome.tsx';
import { gitTools } from './api.ts';
import { RepoWindow } from './RepoWindow.tsx';

/** The folder a Git window shows: its own, else the project's (on the
 * project's server). */
function startFolder(host: Host, data: Record<string, string>): string {
  const project = host.project;
  const elsewhere = host.window?.server && host.window.server !== project?.server;
  return data.folder || (!elsewhere && project?.folder) || '~';
}

export function GitWindow({ host }: { host: Host }) {
  useGitStyles(`${codeHighlightCss}\n${DIFF_CSS}`);
  const data = useData();
  const win = useWindow();
  useProject();
  // The server part, as it's installed or restarted: a failed look goes again then.
  const part = useServerPart();
  const server = win?.server ?? undefined;
  const tools = useMemo(() => gitTools(host, server), [host, server]);
  const folder = startFolder(host, data);
  const [found, setFound] = useState<{ f?: Found; error?: string; for: string }>({ for: '' });
  const [attempt, setAttempt] = useState(0);
  /** A repository picked in this window: nested, a submodule. */
  const chosen = data.repo || null;

  useEffect(() => {
    let live = true;
    tools.find(folder).then(
      (f) => live && setFound({ f, for: folder }),
      (e: Error) => live && setFound({ error: e.message, for: folder }),
    );
    return () => {
      live = false;
    };
  }, [tools, folder, attempt, part?.version, part?.status]);

  // Couldn't look (the server part is still being installed, the server
  // restarts): again in a moment, then less often.
  const failed = found.for === folder && !!found.error;
  const tries = useRef(0);
  useEffect(() => {
    if (!failed) {
      tries.current = 0;
      return;
    }
    const t = setTimeout(() => setAttempt((n) => n + 1), Math.min(10_000, 1000 * 2 ** tries.current++));
    return () => clearTimeout(t);
  }, [failed, found]);

  const chooseFolder = useCallback(async () => {
    const answer = await host.ui.prompt({ title: 'Open a repository', label: 'A folder on this window’s server', value: folder, placeholder: '~/code/app' });
    if (answer?.trim()) {
      host.win.setData('folder', answer.trim());
      host.win.setData('repo', null);
    }
  }, [host, folder]);

  const f = found.for === folder ? found.f : undefined;
  useEffect(() => {
    if (f && !f.root) host.win.setTitle(`Git · ${basenameOf(folder) || folder}`);
  }, [f, folder, host]);

  if (found.for === folder && found.error)
    return (
      <Blank
        title="Git can’t open this folder"
        actions={
          <>
            <NodeButton onClick={() => setAttempt((n) => n + 1)}>Try Again</NodeButton>
            <NodeButton onClick={chooseFolder}>Open Another Folder…</NodeButton>
          </>
        }
      >
        <span className="text-[var(--ansi-1)]">{found.error}</span>
      </Blank>
    );
  if (!f) return <NodeMessage>Looking for a repository…</NodeMessage>;
  if (!f.root) return <Welcome folder={folder} found={f} onDone={(root) => (root === folder ? setAttempt((n) => n + 1) : host.win.setData('folder', root))} onChoose={chooseFolder} />;
  const root = chosen && f.repos.some((r) => r.root === chosen) ? chosen : f.root;
  return <RepoWindow key={`${server ?? ''}\n${root}`} host={host} root={root} server={server} found={f} onChooseFolder={chooseFolder} />;
}
