// Cloning a repository: its URL, and the folder it goes into (named for
// the repository unless you change it).

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { Form } from './Form.tsx';

/** The folder a clone of `url` gets by default: the repository's name. */
export function cloneName(url: string): string {
  const m = /([^/:\\]+?)(?:\.git)?\/*$/.exec(url.trim());
  return m ? m[1] : '';
}

export function Clone({ data }: { data: { folder: string } }) {
  const host = useHost();
  const [url, setUrl] = useState('');
  const [into, setInto] = useState('');
  const [touched, setTouched] = useState(false);
  const parent = data.folder.replace(/\/+$/, '');
  const suggested = cloneName(url) ? `${parent}/${cloneName(url)}` : '';
  const target = touched ? into : suggested;
  return (
    <Form ok="Clone" disabled={!url.trim() || !target.trim()} onSubmit={() => host.ui.closeDialog({ url: url.trim(), into: target.trim() })}>
      <Field>
        <FieldLabel>Repository URL</FieldLabel>
        <Input autoFocus value={url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo.git" />
      </Field>
      <Field description="A new folder, or an empty one, on this window’s server.">
        <FieldLabel>Into</FieldLabel>
        <Input
          value={target}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setTouched(true);
            setInto(e.target.value);
          }}
          placeholder={`${parent}/repo`}
        />
      </Field>
    </Form>
  );
}
