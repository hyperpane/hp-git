// A ref on a commit (a branch, a remote branch, a tag, a stash, HEAD), in
// its color.

import { cn } from '@hyperpane/ui';
import type { Ref } from '../../shared/index.ts';

const REF_COLORS: Record<Ref['kind'], string> = {
  head: 'var(--node-accent)',
  branch: 'var(--ansi-2)',
  remote: 'var(--ansi-4)',
  tag: 'var(--ansi-3)',
  stash: 'var(--ansi-5)',
};

/** A branch, remote branch, tag or HEAD on a commit. */
export function RefBadge({ refName, className }: { refName: Ref; className?: string }) {
  const color = REF_COLORS[refName.kind] ?? 'var(--node-muted)';
  const current = refName.current || refName.kind === 'head';
  return (
    <span
      title={`${refName.kind === 'remote' ? 'Remote branch' : refName.kind === 'tag' ? 'Tag' : refName.kind === 'head' ? 'HEAD' : refName.kind === 'stash' ? 'Stash' : 'Branch'} ${refName.name}${refName.current ? ' (checked out)' : ''}`}
      className={cn(
        'rounded-chip inline-flex h-4 max-w-40 flex-none items-center truncate px-1 text-[10px] leading-4 font-medium',
        current && 'ring-1 ring-inset',
        className,
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)`, ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 55%, transparent)` }}
    >
      <span className="truncate">{refName.kind === 'tag' ? `◆ ${refName.name}` : refName.name}</span>
    </span>
  );
}
