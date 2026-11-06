// The styles the window adds (syntax colors, keyframes), once per frame.

import { useEffect } from 'react';

/** The styles the window adds: syntax colors, keyframes. Once per frame. */
let styled = false;
export function useGitStyles(css: string) {
  useEffect(() => {
    if (styled) return;
    styled = true;
    const tag = document.createElement('style');
    tag.dataset.git = '';
    tag.textContent = css;
    document.head.append(tag);
  }, [css]);
}
