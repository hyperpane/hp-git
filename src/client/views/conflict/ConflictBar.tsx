// A conflicted file's bar: what kind of conflict it is, and taking one side
// for the whole file, opening it in the Editor, or marking it resolved.

import { TriangleAlert } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';
import { header } from '../../ui/classes.ts';
import { Button } from '../../ui/parts.tsx';
import type { ConflictKind, FileStatus } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { KIND } from '../../lib/conflicts.ts';
import { basenameOf } from '../../lib/paths.ts';

export function ConflictBar({
  file,
  kind,
  ours,
  theirs,
  side,
}: {
  file: FileStatus;
  kind: ConflictKind;
  ours: string;
  theirs: string;
  side(s: 'ours' | 'theirs'): unknown;
}) {
  const repo = useRepo();
  const { api } = repo;
  return (
    <div className={cn(header.base, 'gap-2 ps-3 pe-2 max-sm:h-auto max-sm:min-h-11 max-sm:flex-wrap max-sm:py-1.5')}>
      <span className="grid size-6 flex-none place-items-center rounded-full bg-[color-mix(in_srgb,var(--git-conflicted)_16%,transparent)] text-[var(--git-conflicted)]">
        <TriangleAlert className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={header.title}>{file.path}</span>
        <span className={header.meta}>{KIND[kind]}</span>
      </span>
      <span className="flex flex-none flex-wrap items-center gap-1">
        <Button variant="ghost" title={`Take ${ours}'s version of the whole file`} onClick={() => side('ours')}>
          Use Ours
        </Button>
        <Button variant="ghost" title={`Take ${theirs}'s version of the whole file`} onClick={() => side('theirs')}>
          Use Theirs
        </Button>
        <Button variant="ghost" onClick={() => repo.openInEditor(file.path)} disabled={kind === 'deletedByUs' || kind === 'bothDeleted'}>
          Open in Editor
        </Button>
        <Button onClick={() => repo.run(() => api.resolve(file.path, 'mark'), { done: `${basenameOf(file.path)} is resolved` })}>Mark Resolved</Button>
      </span>
    </div>
  );
}
