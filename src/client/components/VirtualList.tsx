// A list that draws only the rows on screen (and a few past them), so a
// history of 50 000 commits or a diff of 100 000 lines scrolls as a short
// one does. Rows are one height. It says when its end comes into view (for
// the next page) and scrolls a row into view for the keyboard
// (lib/listKey.ts moves through it).

import { type CSSProperties, type KeyboardEvent, type ReactNode, type Ref, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@hyperpane/ui';

export interface VirtualHandle {
  scrollToIndex(index: number, align?: 'nearest' | 'center' | 'start'): void;
  readonly element: HTMLDivElement | null;
  /** The first and last rows on screen. */
  visible(): [number, number];
}

export interface VirtualProps {
  count: number;
  rowHeight: number;
  row(index: number): ReactNode;
  /** A key per row (default: its index). */
  rowKey?(index: number): string | number;
  overscan?: number;
  /** Called when the last rows come into view. */
  onEnd?(): void;
  /** Wider than the box: it scrolls sideways too. */
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Above the rows, inside the scroller (sticky). */
  header?: ReactNode;
  headerHeight?: number;
  onKeyDown?(e: KeyboardEvent<HTMLDivElement>): void;
  onScroll?(top: number, left: number): void;
  tabIndex?: number;
  role?: string;
  ariaLabel?: string;
  /** Rows absolutely placed under this: e.g. a selection overlay. */
  children?: ReactNode;
  onContextMenu?(e: React.MouseEvent<HTMLDivElement>): void;
  onPointerDown?(e: React.PointerEvent<HTMLDivElement>): void;
  innerClassName?: string;
}

/** Until a box has been measured (or where nothing is laid out, as in
 * tests): this tall. */
const ASSUMED = 600;

export const VirtualList = forwardRef(function VirtualList(p: VirtualProps, ref: Ref<VirtualHandle>) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const overscan = p.overscan ?? 10;
  const headerHeight = p.header ? (p.headerHeight ?? 0) : 0;
  const latest = useRef(p);
  latest.current = p;

  // The rows to draw, worked out again only when they change.
  const range = (scrolled: number, height: number): [number, number] => {
    const h = height || ASSUMED;
    // Past the end (the list got shorter): the browser moves the scroll back too.
    const top = Math.max(0, Math.min(scrolled, headerHeight + p.count * p.rowHeight - h));
    const first = Math.max(0, Math.floor((top - headerHeight) / p.rowHeight) - overscan);
    const last = Math.min(p.count, Math.ceil((top - headerHeight + h) / p.rowHeight) + overscan);
    return [first, last];
  };

  const sync = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setView((v) => {
      const top = el.scrollTop;
      const height = el.clientHeight;
      if (v.height === height && Math.abs(v.top - top) < 1) return v;
      return { top, height };
    });
    latest.current.onScroll?.(el.scrollTop, el.scrollLeft);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    sync();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sync]);

  const [first, last] = range(view.top, view.height);

  // The end in view: the next page, once per count.
  const endFor = useRef(-1);
  useEffect(() => {
    if (!p.onEnd || p.count === 0) return;
    if (last >= p.count - overscan && endFor.current !== p.count) {
      endFor.current = p.count;
      p.onEnd();
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      get element() {
        return box.current;
      },
      visible: () => {
        const el = box.current;
        const top = el?.scrollTop ?? 0;
        const h = el?.clientHeight || ASSUMED;
        const rh = latest.current.rowHeight;
        return [Math.max(0, Math.floor((top - headerHeight) / rh)), Math.min(latest.current.count - 1, Math.floor((top - headerHeight + h - 1) / rh))];
      },
      scrollToIndex: (index, align = 'nearest') => {
        const el = box.current;
        if (!el || index < 0) return;
        const rh = latest.current.rowHeight;
        const y = headerHeight + index * rh;
        const h = el.clientHeight || ASSUMED;
        if (align === 'start') el.scrollTop = y - headerHeight;
        else if (align === 'center') el.scrollTop = y - h / 2 + rh / 2;
        else if (y < el.scrollTop + headerHeight) el.scrollTop = y - headerHeight;
        else if (y + rh > el.scrollTop + h) el.scrollTop = y + rh - h;
        sync();
      },
    }),
    [headerHeight, sync],
  );

  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    rows.push(
      <div key={p.rowKey ? p.rowKey(i) : i} data-row={i} className="absolute inset-x-0" style={{ top: headerHeight + i * p.rowHeight, height: p.rowHeight }}>
        {p.row(i)}
      </div>,
    );
  }

  return (
    <div
      ref={box}
      tabIndex={p.tabIndex}
      role={p.role}
      aria-label={p.ariaLabel}
      onScroll={sync}
      onKeyDown={p.onKeyDown}
      onContextMenu={p.onContextMenu}
      onPointerDown={p.onPointerDown}
      className={cn('relative min-h-0 flex-1 overflow-auto outline-none', p.className)}
      style={p.style}
    >
      <div className={cn('relative', p.innerClassName)} style={{ height: headerHeight + p.count * p.rowHeight, minWidth: '100%', width: p.width }}>
        {p.header && (
          <div className="sticky top-0 z-[2]" style={{ height: headerHeight }}>
            {p.header}
          </div>
        )}
        {rows}
        {p.children}
      </div>
    </div>
  );
});
