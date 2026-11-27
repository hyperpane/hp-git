// The bar over a diff while lines are picked: how many, and what to do with
// them.

import { keys as keyLabel } from '@hyperpane/sdk/client';
import { Button, Kbd } from '../../ui/parts.tsx';
import { plural } from '../../lib/format.ts';
import type { LineActions } from './DiffView.tsx';

export function PickedBar({
  n,
  actions,
  busy,
  onRun,
  onClear,
}: {
  n: number;
  actions: LineActions;
  busy: boolean;
  onRun(action: LineActions['primary']): void;
  onClear(): void;
}) {
  return (
    <div className="shadow-popover absolute bottom-4 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--popover)] p-1 ps-3.5 text-xs whitespace-nowrap motion-safe:animate-[git-pop_150ms_ease-out]">
      <span className="me-1 font-medium tabular-nums">{plural(n, 'line')} picked</span>
      {actions.primary && (
        <Button disabled={busy} variant="primary" className="rounded-full" onClick={() => onRun(actions.primary)}>
          {actions.primary.label} {plural(n, 'line')} <Kbd>Space</Kbd>
        </Button>
      )}
      {actions.discard && (
        <Button disabled={busy} variant="danger" className="rounded-full" onClick={() => onRun(actions.discard)}>
          {actions.discard.label}
        </Button>
      )}
      <Button variant="ghost" className="rounded-full" onClick={onClear} title={`Clear (${keyLabel('⎋')})`}>
        Clear
      </Button>
    </div>
  );
}
