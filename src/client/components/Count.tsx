// Numbers beside a name: a count in a tab or a header, ahead and behind.

import { cn } from '@hyperpane/ui';

/** A count in a tab or a header. */
export function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn('rounded-full bg-[var(--node-hover)] px-1.5 text-[10px] leading-4 font-medium text-[var(--node-muted)] tabular-nums', className)}>
      {n > 99999 ? '99k+' : n.toLocaleString('en-US')}
    </span>
  );
}

/** Ahead / behind as ↑n ↓n. */
export function AheadBehind({ ahead, behind, className }: { ahead?: number; behind?: number; className?: string }) {
  if (!ahead && !behind) return null;
  return (
    <span className={cn('flex flex-none items-center gap-1 text-[10px] text-[var(--node-muted)] tabular-nums', className)} title={`${ahead ?? 0} ahead, ${behind ?? 0} behind`}>
      {!!behind && <span>↓{behind}</span>}
      {!!ahead && <span>↑{ahead}</span>}
    </span>
  );
}
