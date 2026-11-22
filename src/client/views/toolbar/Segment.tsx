// A part of the toolbar that opens something: its icon, a muted caption
// over its value, a chevron (the repository, the branch).

import { forwardRef } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn, styles } from '@hyperpane/ui';

/** A toolbar button with a caption over its value: 32px, the row's hover. */
export const segmentButton =
  'rounded-control flex h-8 min-w-0 items-center gap-2 px-2 text-left transition-colors duration-100 hover:bg-[var(--node-hover)] active:bg-[var(--node-active)] touch:h-10 max-sm:gap-1.5 max-sm:px-1.5';

/** Its caption and value, one over the other. */
export function SegmentText({ title, value }: { title: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-2xs leading-3.5 text-[var(--node-muted)]">{title}</span>
      <span className="truncate text-xs leading-4 font-medium">{value}</span>
    </span>
  );
}

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
      className={cn(segmentButton, 'flex-none', active && 'bg-[var(--node-active)]', styles.focusRing, className)}
    >
      <Icon className={cn('size-4 flex-none', warn ? 'text-[var(--ansi-3)]' : 'text-[var(--node-muted)]')} />
      <SegmentText title={title} value={value} />
      <ChevronDown className="size-3.5 flex-none text-[var(--node-muted)]" />
    </button>
  );
});

/** A segment's width: a share of the bar's, or, narrow, an equal part of
 * all of it. */
export const narrowSegment = (wide: string) => `${wide} max-sm:w-auto max-sm:min-w-0 max-sm:max-w-none max-sm:flex-1`;
