// Lines checked for the next commit, as GitHub Desktop has it: a press on
// a line's numbers checks it or unchecks it, ⇧ does the same to the lines
// from the last one pressed, and a drag from there to every line it passes.
// The lines are the diff's against HEAD; what's checked is lib/include.ts's.

import { useEffect, useRef } from 'react';
import type { Diff } from '../../shared/index.ts';
import { type LineKey, linesBetween } from '../lib/diff/model.ts';

/** What's checked of a diff's lines, and checking them. */
export interface LineChecks {
  isIn(key: LineKey): boolean;
  set(keys: LineKey[], on: boolean): void;
}

export function useLineChecks(diff: Diff, checks: LineChecks | undefined) {
  const anchor = useRef<LineKey | null>(null);
  const drag = useRef<boolean | null>(null);
  useEffect(() => {
    const up = () => (drag.current = null);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, []);

  /** A press on a line's numbers: it turns the other way, and a drag from
   * there turns the lines it passes the same way. */
  const press = (key: LineKey, e: { shiftKey: boolean }) => {
    if (!checks) return;
    const on = !checks.isIn(key);
    checks.set(e.shiftKey && anchor.current ? linesBetween(diff, anchor.current, key) : [key], on);
    if (!e.shiftKey) anchor.current = key;
    drag.current = on;
  };
  const dragTo = (key: LineKey) => {
    if (!checks || drag.current === null || !anchor.current) return;
    checks.set(linesBetween(diff, anchor.current, key), drag.current);
  };
  return { press, dragTo };
}
