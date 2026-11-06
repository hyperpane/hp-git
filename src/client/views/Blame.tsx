// Blame, over the tabs: each line of a file with the commit that last
// changed it. Lines from one commit run together under one label (who,
// when, the summary); a bar beside them shades by age, newest brightest.
// A label opens its commit; a line's menu blames the file as it was before
// that commit.

import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MONO } from '@hyperpane/code';
import { NodeMessage, menuItems, type MenuEntry } from '@hyperpane/ui';
import type { Blame as BlameData } from '../../shared/index.ts';
import { useRepo } from '../app/repo.ts';
import { Avatar } from '../components/Avatar.tsx';
import { type VirtualHandle, VirtualList } from '../components/VirtualList.tsx';
import { copy } from '../lib/clipboard.ts';
import { type Span, highlightLines } from '../lib/diff/highlight.ts';
import { paint } from '../lib/diff/paint.tsx';
import { ago, longDate, shortSha } from '../lib/format.ts';
import { basenameOf } from '../lib/paths.ts';

const ROW = 20;
const NONE = /^0+$/;

export function BlameView({ path, rev, line }: { path: string; rev?: string; line?: number }) {
  const repo = useRepo();
  const [state, setState] = useState<{ b?: BlameData; error?: string }>({});
  const [spans, setSpans] = useState<Span[][] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const list = useRef<VirtualHandle>(null);

  useEffect(() => {
    setState({});
    const p = repo.api.blame(path, rev);
    p.promise.then(
      (b) => setState({ b }),
      (e: Error) => e.message !== 'Cancelled.' && setState({ error: e.message }),
    );
    return () => p.cancel();
  }, [repo.api, path, rev, rev ? 0 : repo.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = state.b;
  useEffect(() => {
    if (!b) return;
    const ac = new AbortController();
    highlightLines(
      basenameOf(path),
      b.lines.map((l) => (l.text.endsWith('\r') ? l.text.slice(0, -1) : l.text)),
      ac.signal,
    ).then((s) => !ac.signal.aborted && setSpans(s), () => {});
    return () => ac.abort();
  }, [b, path]);

  // Ages, for the shading: from the oldest commit here to the newest.
  const ages = useMemo(() => {
    if (!b) return { min: 0, max: 1 };
    const dates = Object.values(b.commits).map((c) => c.date).filter(Boolean);
    return { min: Math.min(...dates), max: Math.max(...dates) };
  }, [b]);

  useEffect(() => {
    if (b && line) requestAnimationFrame(() => list.current?.scrollToIndex(line - 1, 'center'));
  }, [b, line]);

  if (state.error) return <NodeMessage error>{state.error}</NodeMessage>;
  if (!b) return <NodeMessage>Blaming {path}…</NodeMessage>;

  const shade = (date: number) => {
    const t = ages.max > ages.min ? (date - ages.min) / (ages.max - ages.min) : 1;
    return `color-mix(in srgb, var(--node-accent) ${Math.round(22 + t * 78)}%, transparent)`;
  };
  const digits = String(b.lines.length).length;

  const menu = (e: ReactMouseEvent, sha: string) => {
    e.preventDefault();
    e.stopPropagation();
    const c = b.commits[sha];
    const uncommitted = NONE.test(sha);
    const items: (MenuEntry | null)[] = [
      { label: 'Show This Commit', disabled: uncommitted, run: () => repo.open({ kind: 'commit', sha }) },
      { label: 'Blame Before This Commit', disabled: !c?.previous, run: () => c?.previous && repo.open({ kind: 'blame', path: c.previous.path, rev: c.previous.sha }) },
      null,
      { label: 'Copy SHA', disabled: uncommitted, run: () => copy(sha, repo.toast) },
    ];
    repo.host.ui.menu({ x: e.clientX, y: e.clientY }, menuItems(items)).then((id) => {
      const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
      if (item && !item.disabled) item.run();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-blame={path}>
      <div className="flex h-8 flex-none items-center gap-2 border-b border-[var(--node-border)] px-3 text-2xs text-[var(--node-muted)]">
        <span className="min-w-0 flex-1 truncate">
          {b.lines.length.toLocaleString('en-US')} lines · {Object.keys(b.commits).length} commits{rev ? ` · at ${shortSha(rev)}` : ' · the working tree'}
          {b.truncated ? ' · cut short (the file is big)' : ''}
        </span>
        <span className="flex items-center gap-1">
          older
          <span className="h-2 w-16 rounded-full" style={{ background: 'linear-gradient(to right, color-mix(in srgb, var(--node-accent) 22%, transparent), var(--node-accent))' }} />
          newer
        </span>
      </div>
      <VirtualList
        ref={list}
        count={b.lines.length}
        rowHeight={ROW}
        width={`max(100%, calc(${Math.max(...b.lines.slice(0, 5000).map((l) => l.text.length), 10)}ch + 360px))`}
        className="git-scroll"
        style={{ fontFamily: MONO, fontSize: 12, lineHeight: `${ROW}px` }}
        tabIndex={0}
        ariaLabel={`Blame of ${path}`}
        row={(n) => {
          const l = b.lines[n];
          const first = n === 0 || b.lines[n - 1].sha !== l.sha;
          const c = b.commits[l.sha];
          const uncommitted = NONE.test(l.sha);
          const lit = hover === l.sha;
          return (
            <div className="flex h-full" style={{ background: lit ? 'var(--node-hover)' : undefined }} onMouseEnter={() => setHover(l.sha)} onContextMenu={(e) => menu(e, l.sha)}>
              <div
                className="sticky left-0 z-[1] flex h-full w-[260px] flex-none items-center gap-1.5 overflow-hidden border-e border-[var(--node-border)] ps-2 pe-1 font-sans text-2xs"
                style={{ background: lit ? 'linear-gradient(var(--node-hover), var(--node-hover)), var(--node-bg)' : 'var(--node-bg)', borderTop: first && n ? '1px solid var(--node-border)' : undefined }}
                onClick={() => !uncommitted && repo.open({ kind: 'commit', sha: l.sha })}
                title={c ? `${c.summary}\n${c.author} <${c.email}> · ${longDate(c.date)}\n${l.sha}` : l.sha}
              >
                {first &&
                  (uncommitted ? (
                    <span className="truncate text-[var(--ansi-3)]">Not committed yet</span>
                  ) : c ? (
                    <>
                      <Avatar name={c.author} email={c.email} size={14} />
                      <span className="w-14 flex-none truncate text-[var(--node-muted)]">{ago(c.date)}</span>
                      <span className="min-w-0 flex-1 cursor-pointer truncate hover:underline">{c.summary}</span>
                    </>
                  ) : (
                    <span className="font-mono">{shortSha(l.sha)}</span>
                  ))}
              </div>
              <span className="sticky left-[260px] z-[1] h-full w-[3px] flex-none" style={{ background: c && !uncommitted ? shade(c.date) : 'var(--ansi-3)' }} />
              <span className="flex-none pe-2 ps-2 text-right text-[var(--node-muted)] tabular-nums select-none" style={{ width: `${digits + 2}ch` }}>
                {n + 1}
              </span>
              <span className="pe-6 whitespace-pre">{paint(l.text.endsWith('\r') ? l.text.slice(0, -1) : l.text, spans?.[n], null, '')}</span>
            </div>
          );
        }}
      />
    </div>
  );
}
