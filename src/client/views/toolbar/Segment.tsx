// A part of the toolbar that opens something: what it is, its value, a
// chevron (the repository, the branch).

import { forwardRef } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn, styles } from '@hyperpane/ui';

type SegmentProps = {
  icon: LucideIcon;
  title: string;
  value: string;
  onClick(e: React.MouseEvent<HTMLButtonElement>): void;
  className?: string;
  active?: boolean;
  warn?: boolean;
};

export const Segment = forwardRef<HTMLButtonElement, SegmentProps>(function Segment({ icon: Icon, title, value, onClick, className, active, warn }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        'flex min-w-0 flex-none items-center gap-2 border-e border-[var(--node-border)] px-2.5 text-left transition-colors duration-100 first-of-type:border-s hover:bg-[var(--node-hover)]',
        active && 'bg-[var(--node-active)]',
        styles.focusRingInset,
        className,
      )}
    >
      <Icon className={cn('size-4 flex-none', warn ? 'text-[var(--ansi-3)]' : 'text-[var(--node-muted)]')} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[10px] text-[var(--node-muted)]">{title}</span>
        <span className="truncate text-xs font-semibold">{value}</span>
      </span>
      <ChevronDown className="size-3.5 flex-none text-[var(--node-muted)]" />
    </button>
  );
});
