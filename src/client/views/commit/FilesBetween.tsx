// The files changed from one revision to another (or to the working tree),
// and the picked one's diff beside them.

import { useEffect, useState } from 'react';
import { NodeMessage } from '@hyperpane/ui';
import type { ChangedFile } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { DiffPane } from '../../components/diff/DiffPane.tsx';
import { Split } from '../../components/Split.tsx';
import { FileList } from './FileList.tsx';

/** The files changed from one revision to another (or to the working tree,
 * `to` undefined), and the picked one's diff. */
export function FilesBetween({ from, to, place = 'between' }: { from: string; to?: string; place?: string }) {
  const repo = useRepo();
  const [state, setState] = useState<{ files?: ChangedFile[]; truncated?: boolean; error?: string; key: string }>({ key: '' });
  const [file, setFile] = useState<string | null>(null);
  const key = `${from}..${to ?? ''}`;
  useEffect(() => {
    const p = repo.api.changes(from, to);
    p.promise.then(
      (r) => setState({ files: r.files, truncated: r.truncated, key }),
      (e: Error) => e.message !== 'Cancelled.' && setState({ error: e.message, key }),
    );
    return () => p.cancel();
  }, [repo.api, key, repo.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const files = state.key === key ? state.files : undefined;
  useEffect(() => {
    if (files) setFile((cur) => (cur && files.some((f) => f.path === cur) ? cur : (files[0]?.path ?? null)));
  }, [files]);
  if (state.key === key && state.error) return <NodeMessage error>{state.error}</NodeMessage>;
  if (!files) return <NodeMessage>Comparing…</NodeMessage>;
  if (!files.length) return <Blank>No files differ.</Blank>;
  const picked = files.find((f) => f.path === file) ?? null;
  return (
    <Split
      id={`${place}.files`}
      initial={240}
      min={140}
      minOther={240}
      first={<FileList files={files} truncated={!!state.truncated} picked={file} onPick={setFile} />}
      second={
        picked ? (
          <DiffPane key={`${key}:${picked.path}`} request={{ path: picked.path, oldPath: picked.from, from, to }} newRev={to} />
        ) : (
          <Blank>Pick a file.</Blank>
        )
      }
    />
  );
}
