// The commit box's pieces: the commit just made (to undo), who commits,
// the summary with what's left of its 72 characters, the co-authors, and
// the chips that turn amend and sign-off on.

import type { RefObject } from 'react';
import { Undo2, X } from 'lucide-react';
import { NodeButton, NodeInput, cn, styles } from '@hyperpane/ui';
import type { Identity } from '../../../shared/index.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { shortSha } from '../../lib/format.ts';

export function LastCommit({ last, onUndo, onDismiss }: { last: { sha: string; summary: string }; onUndo(): void; onDismiss(): void }) {
  return (
    <div className="rounded-control flex h-8 items-center gap-2 bg-[var(--node-hover)] ps-2.5 pe-1 text-2xs touch:h-11">
      <span className="min-w-0 flex-1 truncate">
        Committed <span className="font-mono">{shortSha(last.sha)}</span> {last.summary}
      </span>
      <NodeButton variant="ghost" className="h-6 px-2" onClick={onUndo} title="Take the commit back; its changes stay staged">
        <Undo2 />
        Undo
      </NodeButton>
      <button
        type="button"
        aria-label="Dismiss"
        className={cn(
          'rounded-chip flex size-6 items-center justify-center text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:size-9',
          styles.focusRing,
        )}
        onClick={onDismiss}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function IdentityButton({ identity, onClick }: { identity: Identity; onClick(): void }) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-chip -mx-0.5 flex min-w-0 items-center gap-2 self-start px-0.5 text-2xs text-[var(--node-muted)] transition-colors duration-100 hover:text-[var(--node-fg)]',
        styles.focusRing,
      )}
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

export function SummaryField({
  inputRef,
  summary,
  placeholder,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  summary: string;
  placeholder: string;
  onChange(summary: string): void;
}) {
  const remaining = 72 - summary.length;
  return (
    <div className="relative">
      <NodeInput
        ref={inputRef}
        value={summary}
        spellCheck
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Summary"
        className="h-8 w-full pe-8 touch:h-10"
      />
      {summary.length > 50 && (
        <span
          className={cn('absolute top-1/2 right-2 -translate-y-1/2 text-2xs tabular-nums', remaining < 0 ? 'text-[var(--ansi-1)]' : 'text-[var(--ansi-3)]')}
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
        <span
          key={c.email}
          className="rounded-chip flex h-6 items-center gap-1.5 bg-[var(--node-hover)] ps-1 pe-0.5 text-2xs touch:h-8"
          title={`Co-authored-by: ${c.name} <${c.email}>`}
        >
          <Avatar name={c.name} email={c.email} size={14} />
          <span className="max-w-32 truncate">{c.name}</span>
          <button
            type="button"
            aria-label={`Remove ${c.name}`}
            className="rounded-chip flex size-5 items-center justify-center text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] touch:size-7"
            onClick={() => onRemove(c)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function Chip({
  on,
  onClick,
  children,
  title,
  disabled,
}: {
  on: boolean;
  onClick(): void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // The kit's toggle look: quiet off, the accent's tint on.
        'rounded-control flex h-7 items-center gap-1.5 px-2 text-xs touch:h-9 touch:px-3 transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
        on
          ? 'bg-[color-mix(in_srgb,var(--node-accent)_18%,transparent)] text-[var(--node-fg)] hover:bg-[color-mix(in_srgb,var(--node-accent)_26%,transparent)]'
          : 'text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]',
        styles.focusRing,
      )}
    >
      <span className={cn('size-1.5 rounded-full', on ? 'bg-[var(--node-accent)]' : 'bg-[color-mix(in_srgb,var(--node-fg)_30%,transparent)]')} />
      {children}
    </button>
  );
}
