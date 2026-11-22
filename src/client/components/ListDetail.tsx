// A list and what's picked in it, side by side (a SplitPane); narrower
// than `below`, one at a time: the list, or what's picked under a bar with
// the way back to it. A row clicked or tapped opens what it picks (`open`);
// a pick made by the keys or by itself (the first row) doesn't. What's
// over the two (`top`, a commit's header) makes room for what's picked
// when it's shown alone.

import { type ReactNode, useRef } from 'react';
import { PaneBar, SplitPane, type SplitPaneProps, useCompact, useSplitCompact } from '@hyperpane/ui';

type ListDetailProps = Omit<SplitPaneProps, 'compactBelow' | 'show'> & {
  /** Narrower than this (px), one at a time. */
  below: number;
  /** One at a time, what's picked shows rather than the list. */
  open: boolean;
  onBack(): void;
  /** The back button's words: the list's name. */
  backLabel: string;
  title?: ReactNode;
  top?: ReactNode;
};

export function ListDetail({ below, open, onBack, backLabel, title, top, second, ...split }: ListDetailProps) {
  const box = useRef<HTMLDivElement>(null);
  const frameNarrow = useCompact(below);
  const ownNarrow = useCompact(below, box);
  const alone = (frameNarrow || ownNarrow) && open;
  return (
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!alone && top}
      <SplitPane
        {...split}
        compactBelow={below}
        show={open ? 'second' : 'first'}
        second={
          <Detail onBack={onBack} backLabel={backLabel} title={title}>
            {second}
          </Detail>
        }
      />
    </div>
  );
}

/** What's picked, under its way back when it's shown alone. */
function Detail({ children, ...bar }: { children: ReactNode; onBack(): void; backLabel: string; title?: ReactNode }) {
  const alone = useSplitCompact();
  return (
    <>
      {alone && <PaneBar {...bar} />}
      {children}
    </>
  );
}
