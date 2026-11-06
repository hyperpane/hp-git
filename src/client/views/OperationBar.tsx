// The bar under the toolbar while a merge, rebase, cherry-pick or revert
// is under way: what it is, what's left, and Continue, Skip or Abort.

import { useRepo } from '../app/repo.ts';
import { plural, shortSha } from '../lib/format.ts';

/** The branch a merge's prepared message names (“Merge branch 'x'”). */
const mergedName = (message?: string) => /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(message ?? '')?.[1] ?? null;

/** A merge, rebase, cherry-pick or revert under way: what's left, and
 * Continue or Abort. */
export function OperationBar() {
  const repo = useRepo();
  const { status, api } = repo;
  const op = status.operation;
  if (!op) return null;
  const conflicts = status.files.filter((f) => f.conflict).length;
  const what =
    op.kind === 'rebase'
      ? `Rebasing${op.branch ? ` ${op.branch}` : ''}${op.onto ? ` onto ${shortSha(op.onto)}` : ''}${op.step && op.total ? ` (commit ${op.step} of ${op.total})` : ''}`
      : op.kind === 'merge'
        ? `Merging ${mergedName(op.message) ?? (op.head ? shortSha(op.head) : 'a branch')} into ${status.branch ?? 'HEAD'}`
        : op.kind === 'cherryPick'
          ? `Cherry-picking${op.head ? ` ${shortSha(op.head)}` : ''}`
          : op.kind === 'revert'
            ? `Reverting${op.head ? ` ${shortSha(op.head)}` : ''}`
            : op.kind === 'am'
              ? 'Applying patches'
              : 'Bisecting';
  const next = conflicts
    ? `${plural(conflicts, 'file')} with conflicts: resolve ${conflicts === 1 ? 'it' : 'them'}, then continue.`
    : op.kind === 'merge'
      ? 'No conflicts left: commit the merge (or continue).'
      : op.kind === 'bisect'
        ? 'Finish it in a terminal.'
        : 'No conflicts left: continue.';
  const label = op.kind === 'cherryPick' ? 'cherry-pick' : op.kind;
  const go = async (action: 'continue' | 'abort' | 'skip') => {
    if (action === 'abort') {
      const ok = await repo.confirm(`Abort the ${label}?`, 'Everything goes back to how it was before it started; resolved conflicts are lost.', { confirm: 'Abort', destructive: true });
      if (!ok) return;
    }
    repo.outcome(await repo.run(() => api.operation(action)), action === 'continue' ? 'Continuing' : 'Skipping');
  };
  return (
    <div className="flex min-h-9 flex-none flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--node-border)] px-3 py-1" style={{ background: 'color-mix(in srgb, var(--ansi-3) 12%, transparent)' }} data-operation={op.kind}>
      <span className="size-2 flex-none rounded-full bg-[var(--ansi-3)]" />
      <span className="font-medium">{what}</span>
      <span className="min-w-0 flex-1 truncate text-[var(--node-muted)]">{next}</span>
      {op.kind !== 'bisect' && (
        <button type="button" disabled={conflicts > 0} className="rounded-control h-6 bg-[var(--node-accent)] px-2.5 text-xs font-medium text-[var(--node-bg)] transition-opacity duration-100 hover:opacity-90 disabled:opacity-40" onClick={() => go('continue')}>
          Continue
        </button>
      )}
      {op.kind === 'rebase' && (
        <button type="button" className="rounded-control h-6 border border-[var(--node-border)] px-2.5 text-xs hover:bg-[var(--node-hover)]" onClick={() => go('skip')}>
          Skip Commit
        </button>
      )}
      {op.kind !== 'bisect' && (
        <button type="button" className="rounded-control h-6 border border-[var(--node-border)] px-2.5 text-xs hover:bg-[var(--node-hover)]" onClick={() => go('abort')}>
          Abort
        </button>
      )}
    </div>
  );
}
