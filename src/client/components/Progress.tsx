// A thin bar of how far a sync or a clone got.

import { cn } from '@hyperpane/ui';

/** A thin bar of how far something got (null: it's going, no percent). */
export function Progress({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <div className={cn('relative h-0.5 overflow-hidden rounded-full bg-[var(--node-hover)]', className)}>
      {percent === null ? (
        <div className="absolute inset-y-0 w-1/3 animate-[git-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-[var(--node-accent)]" />
      ) : (
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--node-accent)] transition-[width] duration-200" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
      )}
    </div>
  );
}
