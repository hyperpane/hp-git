// A conflicted file's bar: what kind of conflict it is, and taking one side
// for the whole file, opening it in the Editor, or marking it resolved.

import { TriangleAlert } from 'lucide-react';
import { NodeButton } from '@hyperpane/ui';
import type { ConflictKind, FileStatus } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { KIND } from '../../lib/conflicts.ts';
import { basenameOf } from '../../lib/paths.ts';

export function ConflictBar({ file, kind, ours, theirs, side }: { file: FileStatus; kind: ConflictKind; ours: string; theirs: string; side(s: 'ours' | 'theirs'): unknown }) {
  const repo = useRepo();
  const { api } = repo;
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--node-border)] px-3 py-1.5" style={{ background: 'color-mix(in srgb, var(--ansi-9) 10%, transparent)' }}>
      <TriangleAlert className="size-3.5 flex-none text-[var(--ansi-9)]" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{file.path}</span> <span className="text-[var(--node-muted)]">{KIND[kind]}</span>
      </span>
      <NodeButton title={`Take ${ours}'s version of the whole file`} onClick={() => side('ours')}>
        Use Ours
      </NodeButton>
      <NodeButton title={`Take ${theirs}'s version of the whole file`} onClick={() => side('theirs')}>
        Use Theirs
      </NodeButton>
      <NodeButton onClick={() => repo.openInEditor(file.path)} disabled={kind === 'deletedByUs' || kind === 'bothDeleted'}>
        Open in Editor
      </NodeButton>
      <NodeButton onClick={() => repo.run(() => api.resolve(file.path, 'mark'), { done: `${basenameOf(file.path)} is resolved.` })}>Mark Resolved</NodeButton>
    </div>
  );
}
