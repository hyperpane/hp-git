// A commit in full: its message, author and committer (and when), its
// parents (open them), its branches and tags, its signature; then the files
// it changed with their counts, and the picked file's diff beside them.
// History, tags, stashes and the views opened over the tabs all show
// commits this way.

import { type ReactNode, useEffect, useState } from 'react';
import { NodeMessage } from '@hyperpane/ui';
import type { ChangedFile, CommitDetail } from '../../../shared/index.ts';
import type { DiffRequest, Pending } from '../../app/api.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { DiffPane } from '../../components/diff/DiffPane.tsx';
import { Split } from '../../components/Split.tsx';
import { CommitHeader } from './CommitHeader.tsx';
import { FileList } from './FileList.tsx';

export interface CommitDetailsProps {
  /** Loads the commit (show, or a stash's show). */
  load(): Pending<CommitDetail>;
  /** Its key: loads again when it changes. */
  id: string;
  /** The diff request for one of its files. */
  diffOf?(file: ChangedFile, c: CommitDetail): DiffRequest;
  /** The revision its files' new side is (for unchanged lines). */
  rev?(c: CommitDetail): string;
  /** Above the header (a stash's or a tag's actions). */
  top?(c: CommitDetail): ReactNode;
  /** Which split the sizes are remembered for. */
  place?: string;
}

export function CommitDetails({ load, id, diffOf, rev, top, place = 'commit' }: CommitDetailsProps) {
  const repo = useRepo();
  const [state, setState] = useState<{ c?: CommitDetail; error?: string; id: string }>({ id: '' });
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {
    const p = load();
    p.promise.then(
      (c) => setState({ c, id }),
      (e: Error) => e.message !== 'Cancelled.' && setState({ error: e.message, id }),
    );
    return () => p.cancel();
  }, [id, repo.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = state.id === id ? state.c : undefined;
  useEffect(() => {
    if (c) setFile((cur) => (cur && c.files.some((f) => f.path === cur) ? cur : (c.files[0]?.path ?? null)));
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.id === id && state.error) return <NodeMessage error>{state.error}</NodeMessage>;
  if (!c) return <NodeMessage>Loading the commit…</NodeMessage>;
  const picked = c.files.find((f) => f.path === file) ?? null;
  const request = picked ? (diffOf ? diffOf(picked, c) : { path: picked.path, oldPath: picked.from, commit: c.sha }) : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-commit={c.sha}>
      {top?.(c)}
      <CommitHeader c={c} />
      <Split
        id={`${place}.files`}
        initial={240}
        min={140}
        minOther={240}
        first={<FileList files={c.files} truncated={c.truncated} picked={file} onPick={setFile} sha={c.sha} />}
        second={request ? <DiffPane key={`${c.sha}:${picked!.path}`} request={request} newRev={rev ? rev(c) : c.sha} /> : <Blank>{c.files.length ? 'Pick a file.' : 'This commit changes no files.'}</Blank>}
      />
    </div>
  );
}
