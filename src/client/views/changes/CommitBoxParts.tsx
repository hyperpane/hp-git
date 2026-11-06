// The commit box's pieces: the commit just made (to undo), who commits,
// the summary with what's left of its 72 characters, the co-authors, and
// the chips that turn amend and sign-off on.

import type { RefObject } from 'react';
import { Undo2, X } from 'lucide-react';
import { NodeButton, cn, styles } from '@hyperpane/ui';
import type { Identity } from '../../../shared/index.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { shortSha } from '../../lib/format.ts';

export function LastCommit({ last, onUndo, onDismiss }: { last: { sha: string; summary: string }; onUndo(): void; onDismiss(): void }) {
  return (
    <div className="rounded-control flex h-7 items-center gap-2 bg-[var(--node-hover)] ps-2 pe-1 text-2xs">
      <span className="min-w-0 flex-1 truncate">
        Committed <span className="font-mono">{shortSha(last.sha)}</span> {last.summary}
      </span>
      <NodeButton className="h-5 border-transparent" onClick={onUndo} title="Take the commit back; its changes stay staged">
        <Undo2 />
        Undo
      </NodeButton>
      <button type="button" aria-label="Dismiss" className="rounded-chip flex size-5 items-center justify-center text-[var(--node-muted)] hover:bg-[var(--node-hover)]" onClick={onDismiss}>
        <X className="size-3" />
      </button>
    </div>
  );
}

export function IdentityButton({ identity, onClick }: { identity: Identity; onClick(): void }) {
  return (
    <button
      type="button"
      className={cn('rounded-chip -mx-0.5 flex min-w-0 items-center gap-1.5 px-0.5 text-2xs text-[var(--node-muted)] hover:text-[var(--node-fg)]', styles.focusRing)}
      title="Who commits here: click to change"
      onClick={onClick}
    >
      <Avatar name={identity.name ?? '?'} email={identity.email ?? ''} size={16} />
      {identity.name && identity.email ? (
        <span className="truncate">
          {identity.name} <span className="opacity-70">&lt;{identity.email}&gt;</span>
        </span>
      ) : (
        <span className="text-[var(--ansi-3)]">Set your name and email to commit</span>
      )}
    </button>
  );
}

export function SummaryField({ inputRef, summary, placeholder, onChange }: { inputRef: RefObject<HTMLInputElement | null>; summary: string; placeholder: string; onChange(summary: string): void }) {
  const remaining = 72 - summary.length;
  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={summary}
        spellCheck
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Summary"
        className="rounded-control h-7 w-full border border-[var(--node-border)] bg-transparent px-2 pe-8 text-xs text-[var(--node-fg)] outline-none transition-colors duration-100 placeholder:text-[var(--node-muted)] hover:border-[color-mix(in_srgb,var(--node-fg)_24%,transparent)] focus:border-[var(--node-accent)]"
      />
      {summary.length > 50 && (
        <span
          className={cn('absolute top-1/2 right-2 -translate-y-1/2 text-[10px] tabular-nums', remaining < 0 ? 'text-[var(--ansi-1)]' : 'text-[var(--ansi-3)]')}
          title="Summaries read best under 50 characters, and are cut past 72"
        >
          {remaining}
        </span>
      )}
    </div>
  );
}

export function CoAuthorList({ coAuthors, onRemove }: { coAuthors: { name: string; email: string }[]; onRemove(c: { name: string; email: string }): void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {coAuthors.map((c) => (
        <span key={c.email} className="rounded-chip flex h-5 items-center gap-1 bg-[var(--node-hover)] ps-0.5 pe-0.5 text-2xs" title={`Co-authored-by: ${c.name} <${c.email}>`}>
          <Avatar name={c.name} email={c.email} size={14} />
          <span className="max-w-32 truncate">{c.name}</span>
          <button type="button" aria-label={`Remove ${c.name}`} className="rounded-chip flex size-4 items-center justify-center text-[var(--node-muted)] hover:text-[var(--node-fg)]" onClick={() => onRemove(c)}>
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children, title, disabled }: { on: boolean; onClick(): void; children: React.ReactNode; title: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-control flex h-6 items-center gap-1 border px-2 text-2xs transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
        on
          ? 'border-[color-mix(in_srgb,var(--node-accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--node-accent)_18%,transparent)] text-[var(--node-fg)]'
          : 'border-[var(--node-border)] text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]',
        styles.focusRing,
      )}
    >
      <span className={cn('size-1.5 rounded-full', on ? 'bg-[var(--node-accent)]' : 'bg-[color-mix(in_srgb,var(--node-fg)_30%,transparent)]')} />
      {children}
    </button>
  );
}
