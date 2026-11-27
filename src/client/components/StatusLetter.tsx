// A file's change as git writes it, in one small letter chip (M, A, D, R…),
// tinted in its kind's colour (DESIGN.md: tint, don't fill).

import { cn } from '@hyperpane/ui';
import type { Letter } from '../../shared/index.ts';

type Shown = Letter | '?' | '!';

const LETTERS: Record<Shown, { color: string; label: string }> = {
  M: { color: 'var(--git-modified)', label: 'Modified' },
  A: { color: 'var(--git-added)', label: 'Added' },
  D: { color: 'var(--git-deleted)', label: 'Deleted' },
  R: { color: 'var(--git-renamed)', label: 'Renamed' },
  C: { color: 'var(--git-copied)', label: 'Copied' },
  T: { color: 'var(--git-typechange)', label: 'Type changed' },
  U: { color: 'var(--git-conflicted)', label: 'Conflicted' },
  '?': { color: 'var(--git-added)', label: 'Untracked' },
  '!': { color: 'var(--git-conflicted)', label: 'Conflicted' },
};

function letterInfo(letter: Shown) {
  return LETTERS[letter] ?? LETTERS.M;
}

/** A file's change as one small letter, tinted in its colour; `plain`, the
 * letter alone in its colour (a list's rows: lighter beside a checkbox and
 * the counts), else on a tile of it (a diff's header). */
export function StatusLetter({ letter, className, title, plain }: { letter: Shown; className?: string; title?: string; plain?: boolean }) {
  const { color, label } = letterInfo(letter);
  return (
    <span
      title={title ?? label}
      className={cn(
        'inline-flex size-4 flex-none items-center justify-center font-mono leading-none font-semibold',
        plain ? 'text-[11px]' : 'rounded-[4px] text-[10px]',
        className,
      )}
      style={{ color, background: plain ? undefined : `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      {letter}
    </span>
  );
}
