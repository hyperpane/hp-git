// Who commits: a name and an email, for this repository or every one.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { Check, Form } from './Form.tsx';

export function Identity({ data }: { data: { name: string; email: string } }) {
  const host = useHost();
  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [global, setGlobal] = useState(false);
  const bad = !!email && !/^[^\s@]+@[^\s@]+$/.test(email.trim());
  return (
    <Form ok="Save" disabled={!name.trim() || !email.trim() || bad} onSubmit={() => host.ui.closeDialog({ name: name.trim(), email: email.trim(), global })}>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Ada Lovelace" />
      </Field>
      <Field error={bad ? 'That doesn’t look like an email.' : undefined}>
        <FieldLabel>Email</FieldLabel>
        <Input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="ada@example.com" />
      </Field>
      <Check checked={global} onChange={setGlobal} hint="Off: only this repository (user.name and user.email in .git/config).">
        For every repository on this server
      </Check>
    </Form>
  );
}
