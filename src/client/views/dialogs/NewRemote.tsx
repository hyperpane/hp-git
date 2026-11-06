// A new remote: its name and URL.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { Form } from './Form.tsx';

export function NewRemote({ data }: { data: { name: string } }) {
  const host = useHost();
  const [name, setName] = useState(data.name);
  const [url, setUrl] = useState('');
  return (
    <Form ok="Add Remote" disabled={!name.trim() || !url.trim() || /\s/.test(name.trim())} onSubmit={() => host.ui.closeDialog({ name: name.trim(), url: url.trim() })}>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus={!data.name} value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="origin" />
      </Field>
      <Field description="https, ssh (git@host:owner/repo.git) or a path.">
        <FieldLabel>URL</FieldLabel>
        <Input autoFocus={!!data.name} value={url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="git@github.com:you/repo.git" />
      </Field>
    </Form>
  );
}
