// People in the history, blame and the commit box: a colored circle with
// their initials; a commit's author and co-authors as circles stacked over
// each other, as GitHub Desktop draws them.

import { cn } from '@hyperpane/ui';
import type { Commit } from '../../shared/index.ts';
import { authorsOf, initials, personColor } from '../lib/people.ts';

/** A person as a colored circle with their initials. */
export function Avatar({
  name,
  email,
  size = 16,
  className,
  stacked,
}: {
  name: string;
  email?: string;
  size?: number;
  className?: string;
  /** In a stack: solid, ringed with the background, the stack's tooltip. */
  stacked?: { z: number };
}) {
  const color = personColor(email || name);
  return (
    <span
      title={stacked ? undefined : email ? `${name} <${email}>` : name}
      aria-hidden
      className={cn('inline-flex flex-none items-center justify-center rounded-full font-semibold select-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.42)),
        color,
        // Stacked, a circle over another hides it rather than mixing with it.
        background: `color-mix(in srgb, ${color} 20%, ${stacked ? 'var(--node-bg)' : 'transparent'})`,
        boxShadow: stacked ? '0 0 0 1.5px var(--node-bg)' : undefined,
        position: stacked ? 'relative' : undefined,
        zIndex: stacked?.z,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** A commit's author and co-authors, stacked with the author on top (as
 * many as `max`, then how many more), everyone named in the tooltip. */
export function Authors({ commit, size = 16, max = 3, className }: { commit: Pick<Commit, 'author' | 'email' | 'coAuthors'>; size?: number; max?: number; className?: string }) {
  const people = authorsOf(commit);
  if (people.length === 1) return <Avatar name={people[0].name} email={people[0].email} size={size} className={className} />;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className={cn('flex flex-none items-center', className)} title={people.map((p) => `${p.name} <${p.email}>`).join('\n')} data-authors={people.length}>
      {shown.map((p, i) => (
        <Avatar key={p.email.toLowerCase()} name={p.name} email={p.email} size={size} stacked={{ z: shown.length - i }} className={i > 0 ? '-ms-1.5' : undefined} />
      ))}
      {more > 0 && <span className="ms-0.5 text-[10px] text-[var(--node-muted)] tabular-nums">+{more}</span>}
    </span>
  );
}
