// A new tag: its name, and a message that makes it annotated.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input, Textarea } from '@hyperpane/ui';
import { Form } from './Form.tsx';

export function NewTag({ data }: { data: { sha?: string } }) {
  const host = useHost();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const clean = name.trim().replace(/\s+/g, '-');
  const problem = clean && /[~^:?*[\\]|\.\.|\.lock$|^[-.]|\/$/.test(clean) ? 'That isn’t a valid tag name.' : null;
  return (
    <Form ok="Create Tag" disabled={!clean || !!problem} onSubmit={() => host.ui.closeDialog({ name: clean, message: message.trim() })}>
      <Field error={problem ?? undefined}>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="v1.2.0" />
      </Field>
      <Field description="With a message, the tag is annotated: it keeps who tagged it and when.">
        <FieldLabel>Message</FieldLabel>
        <Textarea rows={3} value={message} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)} placeholder="Optional" />
      </Field>
      {data.sha && <div className="text-muted-foreground -mt-2 font-mono text-xs">{data.sha.slice(0, 12)}</div>}
    </Form>
  );
}
