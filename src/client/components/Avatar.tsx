// People in the history, blame and the commit box: a colored circle with
// their initials.

import { cn } from '@hyperpane/ui';
import { initials, personColor } from '../lib/people.ts';

/** A person as a colored circle with their initials. */
export function Avatar({ name, email, size = 16, className }: { name: string; email?: string; size?: number; className?: string }) {
  const color = personColor(email || name);
  return (
    <span
      title={email ? `${name} <${email}>` : name}
      aria-hidden
      className={cn('inline-flex flex-none items-center justify-center rounded-full font-semibold select-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.42)),
        color,
        background: `color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
