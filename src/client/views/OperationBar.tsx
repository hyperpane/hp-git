// The banner under the top bar while a merge, rebase, cherry-pick or revert
// is under way: what it is, what's left, and Continue, Skip or Abort.

import { useRepo } from '../app/repo.ts';
import { plural, shortSha } from '../lib/format.ts';
import { GitCommitHorizontal, GitCompareArrows, GitMerge, Search } from '@hyperpane/icons';
import { Button } from '../ui/parts.tsx';

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
    ? `${plural(conflicts, 'file')} with conflicts: resolve ${conflicts === 1 ? 'it' : 'them'}, then continue`
    : op.kind === 'merge'
      ? 'No conflicts left: commit the merge (or continue)'
      : op.kind === 'bisect'
        ? 'Finish it in a terminal'
        : 'No conflicts left: continue';
  const label = op.kind === 'cherryPick' ? 'cherry-pick' : op.kind;
  const go = async (action: 'continue' | 'abort' | 'skip') => {
    if (action === 'abort') {
      const ok = await repo.confirm(`Abort the ${label}?`, 'Everything goes back to how it was before it started; resolved conflicts are lost', {
        confirm: 'Abort',
        destructive: true,
      });
      if (!ok) return;
    }
    repo.outcome(await repo.run(() => api.operation(action)), action === 'continue' ? 'Continuing' : 'Skipping');
  };
  const Icon = op.kind === 'rebase' ? GitCompareArrows : op.kind === 'merge' ? GitMerge : op.kind === 'bisect' ? Search : GitCommitHorizontal;
  const tone = conflicts ? 'var(--git-conflicted)' : 'var(--git-modified)';
  // A banner under the top bar, in the colour of what's left: conflicts, or
  // a step to take.
  return (
    <div className="flex-none px-2 pt-2" data-operation={op.kind}>
      <div
        role="status"
        className="rounded-surface flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 ps-2 pe-1.5"
        style={{
          background: `color-mix(in srgb, ${tone} 11%, var(--node-bg))`,
        } as React.CSSProperties}
      >
        <span className="grid size-7 flex-none place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${tone} 20%, transparent)`, color: tone }}>
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-medium">{what}</span>
          <span className="truncate text-xs text-[var(--node-muted)]">{next}</span>
        </span>
        <span className="flex flex-none items-center gap-1">
          {op.kind !== 'bisect' && (
            <Button variant="ghost" onClick={() => go('abort')}>
              Abort
            </Button>
          )}
          {op.kind === 'rebase' && <Button onClick={() => go('skip')}>Skip Commit</Button>}
          {op.kind !== 'bisect' && (
            <Button variant="primary" disabled={conflicts > 0} onClick={() => go('continue')}>
              Continue
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}
