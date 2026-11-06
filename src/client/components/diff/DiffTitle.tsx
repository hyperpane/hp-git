// What a diff is of, on its bar: the change's letter, the file (renamed
// from what, how similar, its mode), and the lines that came and went.

import type { Diff } from '../../../shared/index.ts';
import { StatusLetter } from '../StatusLetter.tsx';

export function DiffTitle({ diff, path }: { diff: Diff | undefined; path: string }) {
  return (
    <>
      {diff && <StatusLetter letter={diff.status} />}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate" title={path}>
        {diff?.oldPath && diff.oldPath !== path && (
          <>
            <span className="truncate text-[var(--node-muted)]">{diff.oldPath}</span>
            <span className="text-[var(--node-muted)]">→</span>
          </>
        )}
        <span className="truncate font-medium">{path}</span>
        {diff?.similarity !== undefined && diff.oldPath && <span className="flex-none text-2xs text-[var(--node-muted)]">{diff.similarity}%</span>}
        {diff?.oldMode && diff.newMode && diff.oldMode !== diff.newMode && (
          <span className="flex-none font-mono text-2xs text-[var(--node-muted)]" title="File mode">
            {diff.oldMode} → {diff.newMode}
          </span>
        )}
      </span>
      {diff && !diff.binary && (diff.additions > 0 || diff.deletions > 0) && (
        <span className="flex-none text-2xs tabular-nums">
          <span className="text-[var(--ansi-2)]">+{diff.additions.toLocaleString('en-US')}</span> <span className="text-[var(--ansi-1)]">−{diff.deletions.toLocaleString('en-US')}</span>
        </span>
      )}
    </>
  );
}
