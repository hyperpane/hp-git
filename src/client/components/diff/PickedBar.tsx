// The bar over a diff while lines are picked: how many, and what to do with
// them.

import { keys as keyLabel } from '@hyperpane/sdk/client';
import { NodeButton } from '@hyperpane/ui';
import { plural } from '../../lib/format.ts';
import type { LineActions } from './DiffView.tsx';

export function PickedBar({ n, actions, busy, onRun, onClear }: { n: number; actions: LineActions; busy: boolean; onRun(action: LineActions['primary']): void; onClear(): void }) {
  return (
    <div className="rounded-surface shadow-popover absolute bottom-3 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-2 border border-[var(--node-border)] bg-[var(--node-bg)] py-1 ps-3 pe-1 text-xs whitespace-nowrap motion-safe:animate-[ax-fade-in_150ms_ease-out]">
      <span className="text-[var(--node-muted)]">{plural(n, 'line')} picked</span>
      {actions.primary && (
        <NodeButton disabled={busy} className="border-transparent bg-[var(--node-accent)] text-[var(--node-bg)] hover:bg-[color-mix(in_srgb,var(--node-accent)_85%,var(--node-fg))]" onClick={() => onRun(actions.primary)}>
          {actions.primary.label} {plural(n, 'line')} <kbd className="font-sans opacity-70">Space</kbd>
        </NodeButton>
      )}
      {actions.discard && (
        <NodeButton disabled={busy} className="text-[var(--ansi-1)]" onClick={() => onRun(actions.discard)}>
          {actions.discard.label}…
        </NodeButton>
      )}
      <NodeButton className="border-transparent" onClick={onClear} title={`Clear (${keyLabel('⎋')})`}>
        Clear
      </NodeButton>
    </div>
  );
}
