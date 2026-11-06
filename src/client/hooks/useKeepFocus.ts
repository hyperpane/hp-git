// Keeping the keyboard in a list whose focused row went away.

import { type RefObject, useEffect } from 'react';

/** The keyboard's focus stays in the list it's in after a re-render that
 * took the focused row away. */
export function useKeepFocus(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement === document.body && el.dataset.focused === '1') el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
