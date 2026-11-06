// A password, token or passphrase git asks for.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { Form } from './Form.tsx';

export function Credentials({ data }: { data: { prompt: string; kind: string } }) {
  const host = useHost();
  const [value, setValue] = useState('');
  return (
    <Form ok={data.kind === 'passphrase' ? 'Unlock' : 'Sign In'} onSubmit={() => host.ui.closeDialog(value)}>
      <Field>
        <FieldLabel>{data.prompt.replace(/:\s*$/, '')}</FieldLabel>
        <Input type="password" autoFocus value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} placeholder={data.kind === 'passphrase' ? 'Passphrase' : 'Password or token'} />
      </Field>
    </Form>
  );
}
