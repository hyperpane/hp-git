// Two panes with a divider to drag, the first one's size remembered.

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@hyperpane/ui';
import { local } from '../lib/local.ts';

/** Two panes with a divider to drag; the first one's size is remembered on
 * this machine. `collapsed` hides the first. */
export function Split({
  id,
  direction = 'row',
  initial,
  min = 120,
  minOther = 160,
  collapsed,
  className,
  first,
  second,
}: {
  id: string;
  direction?: 'row' | 'column';
  /** The first pane's size: px, or a fraction of the whole under 1. */
  initial: number;
  min?: number;
  minOther?: number;
  collapsed?: boolean;
  className?: string;
  first: ReactNode;
  second: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [whole, setWhole] = useState(0);
  const [size, setSize] = useState<number | null>(() => local.get<number | null>(`split.${id}`, null));
  const row = direction === 'row';
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWhole(row ? el.clientWidth : el.clientHeight);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [row]);
  const wanted = size ?? (initial < 1 ? Math.round((whole || 800) * initial) : initial);
  const most = whole ? Math.max(min, whole - minOther) : wanted;
  const shown = Math.round(Math.max(min, Math.min(most, wanted)));
  const drag = useRef<{ start: number; from: number } | null>(null);
  return (
    <div ref={box} className={cn('flex min-h-0 min-w-0 flex-1', row ? 'flex-row' : 'flex-col', className)}>
      {!collapsed && (
        <>
          <div className="flex min-h-0 min-w-0 flex-none flex-col overflow-hidden" style={row ? { width: shown } : { height: shown }}>
            {first}
          </div>
          <div
            role="separator"
            aria-orientation={row ? 'vertical' : 'horizontal'}
            title="Drag to resize; double-click to reset"
            className={cn(
              'group relative z-10 flex-none bg-[var(--node-border)]',
              row ? '-mx-[2px] w-[5px] cursor-col-resize border-x-2 border-transparent bg-clip-content' : '-my-[2px] h-[5px] cursor-row-resize border-y-2 border-transparent bg-clip-content',
              'hover:bg-[var(--node-accent)]',
            )}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              drag.current = { start: row ? e.clientX : e.clientY, from: shown };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const next = d.from + (row ? e.clientX : e.clientY) - d.start;
              setSize(Math.max(min, Math.min(most, next)));
            }}
            onPointerUp={() => {
              if (!drag.current) return;
              drag.current = null;
              setSize((s) => {
                local.set(`split.${id}`, s);
                return s;
              });
            }}
            onDoubleClick={() => {
              setSize(null);
              local.set(`split.${id}`, null);
            }}
          />
        </>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
    </div>
  );
}
