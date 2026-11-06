// Unified or side by side, for the diffs of a window.

import { useState } from 'react';
import { useRepo } from '../app/repo.ts';
import { local } from '../lib/local.ts';

/** The view the window shows diffs in: the setting, until the window
 * switches. */
export function useDiffMode(): ['unified' | 'split', (m: 'unified' | 'split') => void] {
  const { host } = useRepo();
  const fallback = (host.settings.get<string>('diffView') === 'split' ? 'split' : 'unified') as 'unified' | 'split';
  const [mode, setMode] = useState<'unified' | 'split'>(() => local.get(`diffView.${host.window?.id ?? 0}`, fallback));
  return [
    mode,
    (m) => {
      setMode(m);
      local.set(`diffView.${host.window?.id ?? 0}`, m);
    },
  ];
}
