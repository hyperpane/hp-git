// The commit box's pieces: the commit just made (to undo), who commits,
// the summary with what's left of its 72 characters, the co-authors, and
// the toggles that turn amend and sign-off on.

import type { ReactNode, RefObject } from 'react';
import { CircleCheck, type Icon as IconComponent, Undo2, X } from '@hyperpane/icons';
import { cn, styles } from '@hyperpane/ui';
import type { Identity } from '../../../shared/index.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { shortSha } from '../../lib/format.ts';
import { Button } from '../../ui/parts.tsx';

export function LastCommit({ last, onUndo, onDismiss }: { last: { sha: string; summary: string }; onUndo(): void; onDismiss(): void }) {
  return (
    <div className="rounded-control flex h-9 items-center gap-2 bg-[color-mix(in_srgb,var(--git-added)_10%,transparent)] ps-2.5 pe-1 text-xs motion-safe:animate-[git-pop_150ms_ease-out] touch:h-11">
      <CircleCheck className="size-3.5 flex-none text-[var(--git-added)]" />
      <span className="min-w-0 flex-1 truncate">
        Committed <span className="font-mono text-[var(--node-muted)]">{shortSha(last.sha)}</span> {last.summary}
      </span>
      <Button variant="ghost" className="h-6 px-2 text-xs [&_svg]:size-3.5" onClick={onUndo} title="Take the commit back; its changes stay staged">
        <Undo2 />
        Undo
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className={cn(
          'rounded-full flex size-6 items-center justify-center text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)] touch:size-9',
          styles.focusRing,
        )}
        onClick={onDismiss}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/** Who commits: their avatar in the composer's foot (a click changes it);
 * no name or email yet, a warning that says so. */
export function IdentityButton({ identity, onClick }: { identity: Identity; onClick(): void }) {
  const set = !!identity.name && !!identity.email;
  return (
    <button
      type="button"
      className={cn(
        'rounded-full flex flex-none items-center gap-1.5 transition-[opacity,background-color,color] duration-100',
        set
          ? 'size-6 justify-center opacity-90 hover:opacity-100 hover:bg-[var(--git-fill-hover)]'
          : 'h-6 px-2 text-xs text-[var(--git-modified)] bg-[color-mix(in_srgb,var(--git-modified)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--git-modified)_18%,transparent)]',
        styles.focusRing,
      )}
      title={set ? `Committing as ${identity.name} <${identity.email}>: click to change` : 'Who commits here: click to set'}
      aria-label={set ? `Committing as ${identity.name}` : 'Set your name and email to commit'}
      onClick={onClick}
    >
      {set ? <Avatar name={identity.name!} email={identity.email!} size={20} /> : 'Set your name and email to commit'}
    </button>
  );
}

/** The summary: the composer's first line, its title; past 50 characters
 * a count of what's left of 72 (amber, then red). */
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
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        value={summary}
        spellCheck
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Summary"
        className="h-10 w-full min-w-0 bg-transparent ps-3 pe-10 text-[13px] font-medium text-[var(--node-fg)] outline-none placeholder:font-normal placeholder:text-[var(--node-muted)] touch:h-11"
      />
      {summary.length > 0 && (
        <span
          className={cn(
            'pointer-events-none absolute right-3 text-[11px] tabular-nums transition-colors duration-150',
            remaining < 0 ? 'font-medium text-[var(--git-deleted)]' : summary.length > 50 ? 'text-[var(--git-modified)]' : 'text-[var(--node-muted)] opacity-70',
          )}
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
    <div className="flex flex-wrap gap-1 px-2.5 pb-1">
      {coAuthors.map((c) => (
        <span
          key={c.email}
          className="flex h-6 items-center gap-1.5 rounded-full bg-[var(--git-fill)] ps-0.5 pe-0.5 text-xs touch:h-8"
          title={`Co-authored-by: ${c.name} <${c.email}>`}
        >
          <Avatar name={c.name} email={c.email} size={20} />
          <span className="max-w-32 truncate">{c.name}</span>
          <button
            type="button"
            aria-label={`Remove ${c.name}`}
            className="flex size-5 items-center justify-center rounded-full text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)] touch:size-7"
            onClick={() => onRemove(c)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

/** A toggle in the composer's foot: a small pill with its icon, quiet
 * (muted, no fill) off, in the accent's tint on. Not a radio dot: these
 * are two independent switches, not a choice between them. */
export function Toggle({
  on,
  onClick,
  children,
  title,
  disabled,
  icon: Icon,
}: {
  on: boolean;
  onClick(): void;
  children: ReactNode;
  title: string;
  disabled?: boolean;
  icon: IconComponent;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors duration-150 disabled:cursor-default disabled:opacity-40 touch:h-9 touch:px-3',
        on
          ? 'bg-[var(--git-accent-soft)] text-[var(--node-fg)] hover:bg-[var(--git-selected-hover)]'
          : 'text-[var(--node-muted)] hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)]',
        styles.focusRing,
      )}
    >
      <Icon aria-hidden variant={on ? undefined : 'outline'} className={cn('size-3.5 flex-none transition-colors duration-150', on && 'text-[var(--node-accent)]')} />
      {children}
    </button>
  );
}
