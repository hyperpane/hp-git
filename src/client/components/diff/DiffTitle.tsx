// What a diff is of, in its header: the change's letter, the file (its
// folder muted, its name; renamed from what, how similar, its mode), and
// the lines that came and went as two small chips.

import type { Diff } from '../../../shared/index.ts';
import { Stat } from '../../ui/parts.tsx';
import { StatusLetter } from '../StatusLetter.tsx';

export function DiffTitle({ diff, path }: { diff: Diff | undefined; path: string }) {
  const at = path.lastIndexOf('/');
  const dir = at >= 0 ? path.slice(0, at + 1) : '';
  const name = path.slice(at + 1);
  return (
    <>
      {diff && <StatusLetter letter={diff.status} />}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 ps-1" title={path}>
        {diff?.oldPath && diff.oldPath !== path && (
          <>
            <span className="min-w-0 shrink truncate text-[var(--node-muted)] line-through decoration-[color-mix(in_srgb,var(--node-muted)_50%,transparent)]">
              {diff.oldPath}
            </span>
            <span className="flex-none text-[var(--node-muted)]">→</span>
          </>
        )}
        <span className="flex min-w-0 shrink items-baseline truncate">
          {dir && <span className="min-w-0 truncate text-[var(--node-muted)]">{dir}</span>}
          <span className="flex-none truncate font-medium">{name}</span>
        </span>
        {diff?.similarity !== undefined && diff.oldPath && <span className="flex-none text-xs text-[var(--node-muted)]">{diff.similarity}%</span>}
        {diff?.oldMode && diff.newMode && diff.oldMode !== diff.newMode && (
          <span className="flex-none font-mono text-[11px] text-[var(--node-muted)]" title="File mode">
            {diff.oldMode} → {diff.newMode}
          </span>
        )}
        {diff && !diff.binary && <Stat added={diff.additions} removed={diff.deletions} chips className="ms-1" />}
      </span>
    </>
  );
}
