// A checkbox at a node's size, with a mixed state for partly.

import { Check, Minus } from 'lucide-react';
import { cn } from '@hyperpane/ui';

/** A checkbox at a node's size; `mixed` for partly. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean | 'mixed';
  onChange(next: boolean): void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        onChange(checked !== true);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'flex size-3.5 flex-none items-center justify-center rounded-[3px] border transition-colors duration-100 disabled:opacity-40',
        checked ? 'border-[var(--node-accent)] bg-[var(--node-accent)] text-[var(--node-bg)]' : 'border-[color-mix(in_srgb,var(--node-fg)_40%,transparent)] bg-transparent hover:border-[var(--node-fg)]',
        className,
      )}
    >
      {checked === 'mixed' ? <Minus className="size-2.5" strokeWidth={3} /> : checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
    </button>
  );
}
