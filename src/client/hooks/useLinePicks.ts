// The lines picked in a diff, to stage, unstage or discard: a press on a
// line's numbers picks it (⌘ adds it, ⇧ a range), a drag over them picks
// several, a hunk's header all of its changed lines. A different diff
// starts with none; the same one fetched again keeps them.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Diff } from '../../shared/index.ts';
import { type LineKey, changedLines, linesBetween } from '../lib/diff/model.ts';

export function useLinePicks(diff: Diff, canPick: boolean, onSelection?: (keys: LineKey[]) => void) {
  const [selected, setSelected] = useState<Set<LineKey>>(new Set());
  const anchor = useRef<LineKey | null>(null);
  const dragging = useRef(false);

  // A different diff: nothing picked. (The same one fetched again keeps the pick.)
  const signature = useMemo(() => `${diff.path}|${diff.additions}|${diff.deletions}|${diff.hunks.map((h) => `${h.header}:${h.lines.length}`).join(',')}`, [diff]);
  const seen = useRef(signature);
  useEffect(() => {
    if (seen.current === signature) return;
    seen.current = signature;
    setSelected(new Set());
    anchor.current = null;
  }, [signature]);
  useEffect(() => onSelection?.([...selected]), [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key: LineKey, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (!canPick) return;
    setSelected((was) => {
      if (e.shiftKey && anchor.current) return new Set([...was, ...linesBetween(diff, anchor.current, key)]);
      anchor.current = key;
      if (e.metaKey || e.ctrlKey) {
        const next = new Set(was);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      return was.size === 1 && was.has(key) ? new Set() : new Set([key]);
    });
  };
  const dragTo = (key: LineKey) => {
    if (!dragging.current || !anchor.current) return;
    setSelected(new Set(linesBetween(diff, anchor.current, key)));
  };
  useEffect(() => {
    const up = () => (dragging.current = false);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, []);

  const hunkKeys = (h: number) => changedLines(diff, h);
  const pickHunk = (h: number) => {
    const keys = hunkKeys(h);
    setSelected((was) => (keys.every((k) => was.has(k)) ? new Set([...was].filter((k) => !keys.includes(k))) : new Set([...was, ...keys])));
  };
  /** A press on a line's numbers: it's picked, and a drag from there picks more. */
  const press = (key: LineKey, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    dragging.current = true;
    pick(key, e);
  };
  return { selected, setSelected, dragTo, press, hunkKeys, pickHunk };
}
