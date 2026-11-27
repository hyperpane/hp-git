// The window's keys: the tabs, the filter, back and forward, Escape out of
// a view over the tabs, and the rail folded (⌘\) and the list hidden (⇧⌘\).

import { type RefObject, useEffect } from 'react';
import { mod, shortcutKey } from '@hyperpane/sdk/client';
import type { Repo, Tab } from '../app/repo.ts';

export function useWindowKeys(
  repo: Repo,
  /** Whether the list shows, and showing or hiding it. */
  list: boolean,
  setList: (on: boolean) => void,
  filters: Record<Tab, RefObject<HTMLInputElement | null>>,
  /** Folding the rail and back. */
  toggleRail?: () => void,
) {
  const { tab, setTab } = repo;
  // Keys: tabs by Ctrl+1…5, the filter by ⌘F, the rail by ⌘\ and the list
  // by ⇧⌘\, back and forward by ⌘[ ⌘]
  // (and Alt+← →, and the mouse's buttons), all by the physical key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = shortcutKey(e);
      const digit = /^Digit([1-5])$/.exec(e.code);
      if (digit && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setTab((['changes', 'history', 'branches', 'stashes', 'tags'] as Tab[])[Number(digit[1]) - 1]);
      } else if (k === 'f' && mod(e) && !e.shiftKey && !e.altKey) {
        if (repo.view) return;
        if (!list) setList(true);
        requestAnimationFrame(() => {
          filters[tab].current?.focus();
          filters[tab].current?.select();
        });
      } else if (e.code === 'Backslash' && mod(e) && !e.altKey) {
        if (e.shiftKey) setList(!list);
        else if (toggleRail) toggleRail();
        else return;
      } else if ((e.code === 'BracketLeft' && mod(e)) || (e.key === 'ArrowLeft' && e.altKey && !isField(e.target))) {
        repo.back();
      } else if ((e.code === 'BracketRight' && mod(e)) || (e.key === 'ArrowRight' && e.altKey && !isField(e.target))) {
        repo.forward();
      } else if (e.key === 'Escape' && repo.view && !isField(e.target)) {
        repo.back();
      } else return;
      e.preventDefault();
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) repo.back();
      else if (e.button === 4) repo.forward();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    addEventListener('mouseup', onMouse);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('mouseup', onMouse);
    };
  }); // every render: the handlers read the latest
}

const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
