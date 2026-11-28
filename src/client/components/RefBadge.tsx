// A ref on a commit (a branch, a remote branch, a tag, a stash, HEAD) as a
// small chip tinted in its colour; the checked-out one in a stronger fill
// (flat: no ring).

import { Cloud, GitBranch, Tag } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';
import type { Ref } from '../../shared/index.ts';
import { chip } from '../ui/classes.ts';

const REF_COLORS: Record<Ref['kind'], string> = {
  head: 'var(--node-accent)',
  branch: 'var(--git-branch)',
  remote: 'var(--git-remote)',
  tag: 'var(--git-tag)',
  stash: 'var(--git-stash)',
};

const REF_ICONS = { branch: GitBranch, remote: Cloud, tag: Tag } as const;

/** A branch, remote branch, tag or HEAD on a commit. */
export function RefBadge({ refName, className }: { refName: Ref; className?: string }) {
  const color = REF_COLORS[refName.kind] ?? 'var(--node-muted)';
  const current = refName.current || refName.kind === 'head';
  const Icon = REF_ICONS[refName.kind as keyof typeof REF_ICONS];
  return (
    <span
      title={`${refName.kind === 'remote' ? 'Remote branch' : refName.kind === 'tag' ? 'Tag' : refName.kind === 'head' ? 'HEAD' : refName.kind === 'stash' ? 'Stash' : 'Branch'} ${refName.name}${refName.current ? ' (checked out)' : ''}`}
      className={cn(chip.base, chip.tinted, 'max-w-40 gap-1', current && 'bg-[color-mix(in_srgb,var(--chip)_24%,transparent)]', className)}
      style={{
        '--chip': color,
      } as React.CSSProperties}
    >
      {Icon && <Icon variant="outline" aria-hidden className="size-3 flex-none opacity-80" />}
      <span className="truncate">{refName.name}</span>
    </span>
  );
}
