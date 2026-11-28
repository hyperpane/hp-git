// The back button in the window's header (useBack): the deepest way back
// that's shown has it. A view over the tabs claims it (app/Main.tsx); so
// does a list and what's picked in it, one at a time, while what's picked
// shows (components/ListDetail.tsx). A view hidden by the one over it
// claims nothing.

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useBack } from '@hyperpane/sdk/client';

interface Claim {
  depth: number;
  run(): void;
}

interface Scope {
  depth: number;
  shown: boolean;
  claim(c: Claim): () => void;
}

const ScopeContext = createContext<Scope | null>(null);

/** The window's: whichever claim is deepest (the last made, of two as
 * deep) is the header's back button; none, no button. */
export function WayBackRoot({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const claim = useCallback((c: Claim) => {
    setClaims((l) => [...l, c]);
    return () => setClaims((l) => l.filter((x) => x !== c));
  }, []);
  const top = claims.reduce<Claim | null>((a, c) => (!a || c.depth >= a.depth ? c : a), null);
  useBack(top ? top.run : null);
  const scope = useMemo(() => ({ depth: 0, shown: true, claim }), [claim]);
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/** What's in it is a level deeper, and shown only when `shown` is (and
 * what it's in). */
export function WayBackScope({ shown, children }: { shown: boolean; children: ReactNode }) {
  const parent = useContext(ScopeContext);
  const scope = useMemo(
    () => parent && { depth: parent.depth + 1, shown: parent.shown && shown, claim: parent.claim },
    [parent, shown],
  );
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/** Claims the header's back button while `on` (and shown): `run` is where
 * it goes. */
export function useWayBack(on: boolean, run: () => void, deeper = 0) {
  const scope = useContext(ScopeContext);
  const latest = useRef(run);
  latest.current = run;
  const live = on && !!scope?.shown;
  useEffect(() => {
    if (!live || !scope) return;
    return scope.claim({ depth: scope.depth + deeper, run: () => latest.current() });
  }, [live, scope, deeper]);
}
