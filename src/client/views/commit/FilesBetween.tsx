// The files changed from one revision to another (or to the working tree),
// and the picked one's diff beside them (or alone, in a narrow window).

import { useEffect, useState } from 'react';
import { FileDiff, TriangleAlert } from '@hyperpane/icons';
import { NodeMessage, PHONE_WIDTH } from '@hyperpane/ui';
import type { ChangedFile } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { DiffPane } from '../../components/diff/DiffPane.tsx';
import { ListDetail } from '../../components/ListDetail.tsx';
import { basenameOf } from '../../lib/paths.ts';
import { FileList } from './FileList.tsx';

/** The files changed from one revision to another (or to the working tree,
 * `to` undefined), and the picked one's diff. */
export function FilesBetween({ from, to, place = 'between' }: { from: string; to?: string; place?: string }) {
  const repo = useRepo();
  const [state, setState] = useState<{ files?: ChangedFile[]; truncated?: boolean; error?: string; key: string }>({ key: '' });
  const [file, setFile] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
  if (state.key === key && state.error)
    return (
      <Blank icon={TriangleAlert} error title="The files can’t be compared">
        {state.error}
      </Blank>
    );
  if (!files) return <NodeMessage>Comparing</NodeMessage>;
  if (!files.length)
    return (
      <Blank icon={FileDiff} title="No differences">
        No files differ.
      </Blank>
    );
  const picked = files.find((f) => f.path === file) ?? null;
  return (
    <ListDetail
      id={`${place}.files`}
      initial={240}
      min={140}
      minOther={240}
      below={PHONE_WIDTH}
      open={open}
      onBack={() => setOpen(false)}
      backLabel="Files"
      title={picked ? basenameOf(picked.path) : undefined}
      first={<FileList files={files} truncated={!!state.truncated} picked={file} onPick={setFile} onOpen={() => setOpen(true)} />}
      second={
        picked ? (
          <DiffPane key={`${key}:${picked.path}`} request={{ path: picked.path, oldPath: picked.from, from, to }} newRev={to} />
        ) : (
          <Blank icon={FileDiff} title="No file picked">
            Pick one to see its diff.
          </Blank>
        )
      }
    />
  );
}
