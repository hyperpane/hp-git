// The commit box's draft (summary, description, amend, sign-off,
// co-authors), kept on this machine for each repository while you look
// elsewhere.

import { useState } from 'react';
import { local } from '../lib/local.ts';

export interface Draft {
  summary: string;
  description: string;
  amend: boolean;
  signoff: boolean | null;
  coAuthors: { name: string; email: string }[];
}

export const EMPTY: Draft = { summary: '', description: '', amend: false, signoff: null, coAuthors: [] };

export function useCommitDraft(root: string) {
  const draftKey = `draft.${root}`;
  const [draft, setDraftState] = useState<Draft>(() => ({ ...EMPTY, ...local.get<Partial<Draft>>(draftKey, {}) }));
  const setDraft = (d: Partial<Draft>) =>
    setDraftState((was) => {
      const next = { ...was, ...d };
      local.set(draftKey, next);
      return next;
    });
  return { draftKey, draft, setDraft, setDraftState };
}
