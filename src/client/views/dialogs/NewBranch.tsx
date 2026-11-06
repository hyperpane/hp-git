// A new branch: its name (made valid as it's typed), where from, and
// whether to switch to it.

import { useState } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Field, FieldLabel, Input } from '@hyperpane/ui';
import { branchName, branchProblem } from '../../lib/branchNames.ts';
import { Check, Form } from './Form.tsx';

export function NewBranch({ data }: { data: { from: string; fromLabel?: string; checkout?: boolean; pickFrom?: boolean; existing?: string[] } }) {
  const host = useHost();
  const [name, setName] = useState('');
  const [from, setFrom] = useState(data.from);
  const [checkout, setCheckout] = useState(data.checkout !== false);
  const clean = branchName(name.trim());
  const problem = branchProblem(clean, data.existing);
  return (
    <Form ok={checkout ? 'Create and Switch' : 'Create Branch'} disabled={!clean || !!problem} onSubmit={() => host.ui.closeDialog({ name: clean, from, checkout })}>
      <Field error={problem ?? undefined} description={clean && clean !== name.trim() ? `It’ll be ${clean}.` : undefined}>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="feature/better-things" />
      </Field>
      {data.pickFrom ? (
        <Field description="A branch, tag or commit. Empty: the current branch.">
          <FieldLabel>From</FieldLabel>
          <Input value={from} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} placeholder={data.fromLabel ?? 'HEAD'} />
        </Field>
      ) : (
        <div className="text-muted-foreground -mt-1 truncate text-xs">From {data.fromLabel ?? data.from}</div>
      )}
      <Check checked={checkout} onChange={setCheckout}>
        Switch to it
      </Check>
    </Form>
  );
}
