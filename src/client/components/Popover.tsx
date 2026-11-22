// A panel under a button, inside the window (the branch picker).

import { type ReactNode, type RefObject, useRef } from 'react';
import { cn, useDismissable, usePopper } from '@hyperpane/ui';

/** A panel under a button, inside the window, closed by Escape or a press
 * outside. */
export function Popover({
  open,
  anchor,
  onClose,
  children,
  className,
  align = 'start',
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose(): void;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const { style } = usePopper({ open, anchorRef: anchor, floatingRef: panel, side: 'bottom', align, offset: 4 });
  useDismissable({ open, onDismiss: onClose, refs: [panel, anchor as RefObject<HTMLElement | null>] });
  if (!open) return null;
  return (
    <div
      ref={panel}
      style={style}
      className={cn(
        // The menus' step above the window, not the window's own card.
        'rounded-surface shadow-popover z-(--z-popover) flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--popover)] text-xs text-[var(--popover-foreground)] motion-safe:animate-[ax-fade-in_150ms_ease-out]',
        className,
      )}
    >
      {children}
    </div>
  );
}
