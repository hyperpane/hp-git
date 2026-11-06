// A file path as its name and its folder (muted, cut from the left).

import { cn } from '@hyperpane/ui';

/** A file path as its folder (muted, cut from the left) and its name. */
export function PathLabel({ path, from, className }: { path: string; from?: string; className?: string }) {
  const at = path.lastIndexOf('/');
  const dir = at >= 0 ? path.slice(0, at + 1) : '';
  const name = path.slice(at + 1);
  return (
    <span className={cn('flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap', className)} title={from ? `${from} → ${path}` : path}>
      {from && <span className="me-1 min-w-0 shrink truncate text-[var(--node-muted)] line-through decoration-[color-mix(in_srgb,var(--node-muted)_60%,transparent)]">{from}</span>}
      {from && <span className="me-1 flex-none text-[var(--node-muted)]">→</span>}
      <span className="flex-none truncate">{name}</span>
      {dir && (
        <span className="ml-1.5 min-w-0 shrink truncate text-[var(--node-muted)]" style={{ direction: 'rtl', textAlign: 'left' }}>
          <bdi>{dir.slice(0, -1)}</bdi>
        </span>
      )}
    </span>
  );
}
