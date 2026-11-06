// A conflicted file, resolved here: each conflict as ours beside theirs
// (and the base between them, when the markers have it), to take one side,
// both, or leave for later; the rest of the file folded around them. Save
// writes the result (the old copy to the Trash) and marks it resolved. Or
// take one side for the whole file, or open it in the Editor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { MONO } from '@hyperpane/code';
import { NodeButton, NodeMessage } from '@hyperpane/ui';
import type { FileStatus } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { type Choice, KIND, merged, parseConflicts } from '../../lib/conflicts.ts';
import { plural } from '../../lib/format.ts';
import { basenameOf } from '../../lib/paths.ts';
import { ConflictBar } from './ConflictBar.tsx';
import { ConflictBlock } from './ConflictBlock.tsx';
import { FoldedText } from './FoldedText.tsx';

export function ConflictView({ file }: { file: FileStatus }) {
  const repo = useRepo();
  const { api, status } = repo;
  const [state, setState] = useState<{ lines?: string[]; eol?: string; error?: string; binary?: boolean }>({});
  const [choices, setChoices] = useState<Map<number, Choice>>(new Map());
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const kind = file.conflict ?? 'bothModified';
  const markers = kind === 'bothModified' || kind === 'bothAdded';

  useEffect(() => {
    if (!markers) return;
    let live = true;
    api.blob(file.path).then(
      (b) => {
        if (!live) return;
        if (b.binary || !b.lines) return setState({ binary: true });
        const crlf = b.lines.some((l) => l.endsWith('\r'));
        setState({ lines: b.lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)), eol: crlf ? '\r\n' : '\n' });
      },
      (e: Error) => live && setState({ error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [api, file.path, file.mtime, markers]);

  // Read again (the status moved) but the same text: the choices stay.
  const text = state.lines?.join('\n') ?? null;
  const blocks = useMemo(() => (state.lines ? parseConflicts(state.lines) : []), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useRef(text);
  useEffect(() => {
    if (seen.current === text) return;
    const before = seen.current;
    seen.current = text;
    // The first read has nothing to forget.
    if (before !== null) setChoices(new Map());
  }, [text]);
  const conflicts = blocks.map((b, k) => (b.t === 'conflict' ? k : -1)).filter((k) => k >= 0);
  const chosen = conflicts.filter((k) => choices.has(k)).length;
  const ours = status.operation?.kind === 'rebase' ? 'the branch you rebase onto' : status.branch ?? 'HEAD';
  const theirs = status.operation?.kind === 'rebase' ? 'your commit' : status.operation?.kind === 'merge' ? 'the merged branch' : 'the incoming change';

  const save = async (mark: boolean) => {
    if (!state.lines) return;
    setSaving(true);
    const text = merged(blocks, choices, state.eol ?? '\n') + (state.lines.length ? state.eol ?? '\n' : '');
    await repo.run(() => api.resolveText(file.path, text, mark), { done: mark ? `${basenameOf(file.path)} is resolved.` : undefined });
    setSaving(false);
  };
  const side = (s: 'ours' | 'theirs') => repo.run(() => api.resolve(file.path, s), { done: `Took ${s === 'ours' ? 'ours' : 'theirs'} for ${basenameOf(file.path)}.` });

  const bar = <ConflictBar file={file} kind={kind} ours={ours} theirs={theirs} side={side} />;

  if (!markers)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {bar}
        <Blank icon={TriangleAlert} title="No lines to merge">
          {KIND[kind]} Use ours or theirs to keep or delete it, or change it and mark it resolved.
        </Blank>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-conflict={file.path}>
      {bar}
      {state.error ? (
        <NodeMessage error>{state.error}</NodeMessage>
      ) : state.binary ? (
        <Blank title="A binary file">Use ours or theirs for it.</Blank>
      ) : !state.lines ? (
        <NodeMessage>Loading…</NodeMessage>
      ) : (
        <>
          <div className="flex h-8 flex-none items-center gap-2 border-b border-[var(--node-border)] px-3 text-2xs">
            <span className="text-[var(--node-muted)]">
              {conflicts.length ? `${chosen} of ${plural(conflicts.length, 'conflict')} chosen` : 'No conflict markers are left.'}
            </span>
            <span className="flex-1" />
            <span className="flex items-center gap-1 text-[var(--node-muted)]">
              <span className="size-2 rounded-full bg-[var(--ansi-4)]" /> Ours: {ours}
            </span>
            <span className="flex items-center gap-1 text-[var(--node-muted)]">
              <span className="size-2 rounded-full bg-[var(--ansi-5)]" /> Theirs: {theirs}
            </span>
            <NodeButton disabled={saving || !chosen} onClick={() => save(false)}>
              Save
            </NodeButton>
            <NodeButton
              disabled={saving || chosen < conflicts.length}
              className="border-transparent bg-[var(--node-accent)] text-[var(--node-bg)] hover:opacity-90"
              onClick={() => (conflicts.length ? save(true) : repo.run(() => api.resolve(file.path, 'mark')))}
            >
              <Check />
              {conflicts.length ? 'Save and Mark Resolved' : 'Mark Resolved'}
            </NodeButton>
          </div>
          <div className="git-scroll min-h-0 flex-1 overflow-auto p-2" style={{ fontFamily: MONO, fontSize: 12, lineHeight: '18px' }}>
            {blocks.map((b, k) => {
              if (b.t === 'text') return <FoldedText key={k} lines={b.lines} first={k === 0} last={k === blocks.length - 1} open={open.has(k)} onOpen={() => setOpen(new Set([...open, k]))} />;
              const c = choices.get(k);
              const choose = (x: Choice | null) =>
                setChoices((m) => {
                  const n = new Map(m);
                  if (x === null || n.get(k) === x) n.delete(k);
                  else n.set(k, x);
                  return n;
                });
              const number = conflicts.indexOf(k) + 1;
              return <ConflictBlock key={k} b={b} number={number} choice={c} onChoose={choose} ours={ours} theirs={theirs} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}
