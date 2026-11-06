// A file's change as git writes it, in one colored letter (M, A, D, R…).

import { cn } from '@hyperpane/ui';
import type { Letter } from '../../shared/index.ts';

type Shown = Letter | '?' | '!';

const LETTERS: Record<Shown, { color: string; label: string }> = {
  M: { color: 'var(--ansi-3)', label: 'Modified' },
  A: { color: 'var(--ansi-2)', label: 'Added' },
  D: { color: 'var(--ansi-1)', label: 'Deleted' },
  R: { color: 'var(--ansi-4)', label: 'Renamed' },
  C: { color: 'var(--ansi-6)', label: 'Copied' },
  T: { color: 'var(--ansi-5)', label: 'Type changed' },
  U: { color: 'var(--ansi-9)', label: 'Conflicted' },
  '?': { color: 'var(--ansi-2)', label: 'Untracked' },
  '!': { color: 'var(--ansi-9)', label: 'Conflicted' },
};

export function letterInfo(letter: Shown) {
  return LETTERS[letter] ?? LETTERS.M;
}

/** A file's change as one colored letter, as git writes it. */
export function StatusLetter({ letter, className, title }: { letter: Shown; className?: string; title?: string }) {
  const { color, label } = letterInfo(letter);
  return (
    <span
      title={title ?? label}
      className={cn('rounded-chip inline-flex h-4 w-4 flex-none items-center justify-center font-mono text-[10px] leading-none font-semibold', className)}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {letter}
    </span>
  );
}
