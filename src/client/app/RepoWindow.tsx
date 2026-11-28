// A repository in a Git window: its state (useRepoState.ts) once its status
// has come, given to every view below (useRepo), or why it can't be read.

import type { Host } from '@hyperpane/sdk/client';
import { NodeMessage } from '@hyperpane/ui';
import { Button } from '../ui/parts.tsx';
import { TriangleAlert } from '@hyperpane/icons';
import type { Found } from '../../shared/index.ts';
import { Blank } from '../components/Blank.tsx';
import { WayBackRoot } from '../components/WayBack.tsx';
import { basenameOf } from '../lib/paths.ts';
import { Main } from './Main.tsx';
import { RepoProvider } from './repo.ts';
import { useRepoState } from './useRepoState.ts';

export function RepoWindow({ host, root, server, found, onChooseFolder }: { host: Host; root: string; server?: string; found: Found; onChooseFolder(): void }) {
  const windowId = host.window?.id ?? 0;
  const { repo, error } = useRepoState(host, root, server, windowId);
  if (!repo)
    return error ? (
      <Blank icon={TriangleAlert} error title="Git can’t read this repository" actions={<Button onClick={onChooseFolder}>Open Another Folder</Button>}>
        {error}
      </Blank>
    ) : (
      <NodeMessage>Reading {basenameOf(root)}</NodeMessage>
    );
  return (
    <RepoProvider value={repo}>
      <WayBackRoot>
        <Main repo={repo} found={found} onChooseFolder={onChooseFolder} />
      </WayBackRoot>
    </RepoProvider>
  );
}
