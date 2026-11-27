// The Git window's small parts (DESIGN.md): a button, a chip, a status dot,
// a count. Views use these, or the class strings in classes.ts, so sizes and
// states stay the same everywhere.

import type { CSSProperties, ComponentProps, ReactNode, Ref } from 'react';
import { Search, X } from '@hyperpane/icons';
import { cn, styles } from '@hyperpane/ui';
import { button, chip, field, kbd } from './classes.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** A button: primary (one per place), secondary, ghost or danger; 28px, or
 * 32px `lg`; `iconOnly` for a square one (give it an aria-label). */
export function Button({
  variant = 'secondary',
  lg,
  iconOnly,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; lg?: boolean; iconOnly?: boolean }) {
  return <button type={type} {...props} className={cn(button.base, button[variant], lg && button.lg, iconOnly && button.icon, className)} />;
}

/** The colour of each kind of change. */
export const STATUS_COLOR = {
  added: 'var(--git-added)',
  modified: 'var(--git-modified)',
  deleted: 'var(--git-deleted)',
  renamed: 'var(--git-renamed)',
  copied: 'var(--git-copied)',
  conflicted: 'var(--git-conflicted)',
  ignored: 'var(--git-ignored)',
} as const;
export type StatusKind = keyof typeof STATUS_COLOR;

/** A small tinted label: a ref, a state, a count. `color` tints it (a CSS
 * colour or a token); without one it's neutral. */
export function Chip({ color, children, className, title }: { color?: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn(chip.base, color ? chip.tinted : chip.neutral, className)} style={color ? ({ '--chip': color } as CSSProperties) : undefined}>
      {children}
    </span>
  );
}

/** A dot in a status colour (6px). */
export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('size-1.5 flex-none rounded-full', className)} style={{ background: color }} />;
}

/** A count as the rail and headers show it: muted, tabular; `alert` in the
 * conflict colour. */
export function CountText({ n, alert, className }: { n: number; alert?: boolean; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn('text-xs tabular-nums', alert ? 'font-semibold text-[var(--git-conflicted)]' : 'text-[var(--node-muted)]', className)}>
      {n > 9999 ? '9k+' : n.toLocaleString('en-US')}
    </span>
  );
}

/** Lines added and removed, as two small tinted numbers (+12 −3); none when
 * both are 0. `chips`: on tinted chips (a diff's header). */
export function Stat({ added, removed, chips, className }: { added: number; removed: number; chips?: boolean; className?: string }) {
  if (!added && !removed) return null;
  const n = (x: number) => x.toLocaleString('en-US');
  if (chips)
    return (
      <span className={cn('flex flex-none items-center gap-1', className)} title={`${n(added)} added, ${n(removed)} removed`}>
        {added > 0 && <Chip color="var(--git-added)">+{n(added)}</Chip>}
        {removed > 0 && <Chip color="var(--git-deleted)">−{n(removed)}</Chip>}
      </span>
    );
  return (
    <span className={cn('flex flex-none items-center gap-1 text-xs tabular-nums', className)}>
      {added > 0 && <span className="text-[var(--git-added)]">+{n(added)}</span>}
      {removed > 0 && <span className="text-[var(--git-deleted)]">−{n(removed)}</span>}
    </span>
  );
}

/** A key's hint, as in a button: ⌘↵. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn(kbd, className)}>{children}</kbd>;
}

/** A search field (DESIGN.md, field): the magnifier inside it, and a way
 * to clear it once there's text. */
export function SearchField({
  inputRef,
  value,
  onClear,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'ref'> & { inputRef?: Ref<HTMLInputElement>; value: string; onClear?(): void }) {
  return (
    <span className={cn('relative flex min-w-0 flex-1 items-center', className)}>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-[var(--node-muted)]" />
      <input ref={inputRef} spellCheck={false} value={value} {...props} className={cn(field, 'w-full ps-8', onClear && value && 'pe-7')} />
      {onClear && value && (
        <button
          type="button"
          aria-label="Clear"
          className={cn(
            'absolute right-1.5 flex size-5 items-center justify-center rounded-full text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)] touch:size-8',
            styles.focusRing,
          )}
          onClick={onClear}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
