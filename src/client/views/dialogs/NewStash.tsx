// Stashing the changes: a message, untracked files or not, staged ones
// kept or not.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { Check, Form } from './Form.tsx';

export function NewStash({ data }: { data: { count: number; untracked: number } }) {
  const host = useHost();
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  const [keepIndex, setKeepIndex] = useState(false);
  return (
    <Form ok="Stash" onSubmit={() => host.ui.closeDialog({ message: message.trim(), untracked, keepIndex })}>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <Input autoFocus value={message} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)} placeholder="What you were doing (optional)" />
      </Field>
      <div className="flex flex-col gap-2.5">
        <Check checked={untracked} onChange={setUntracked} hint={data.untracked ? `${data.untracked} new file${data.untracked === 1 ? '' : 's'}` : undefined}>
          Include untracked files
        </Check>
        <Check checked={keepIndex} onChange={setKeepIndex} hint="Stashed, and left staged too.">
          Keep staged changes
        </Check>
      </div>
    </Form>
  );
}
