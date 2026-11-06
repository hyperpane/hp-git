// The Git window's dialogs, each a modal frame the app draws over
// everything (host.ui.dialog): a password or passphrase git asks for, who
// commits, a new branch, a tag, a stash, a remote, a clone. Each closes
// with what was entered, or null.

import { cn } from '@hyperpane/ui';
import { Clone } from './Clone.tsx';
import { Credentials } from './Credentials.tsx';
import { Identity } from './Identity.tsx';
import { NewBranch } from './NewBranch.tsx';
import { NewRemote } from './NewRemote.tsx';
import { NewStash } from './NewStash.tsx';
import { NewTag } from './NewTag.tsx';

export function DialogView({ view, data }: { view: string; data: any }) {
  const content =
    view === 'credentials' ? (
      <Credentials data={data} />
    ) : view === 'identity' ? (
      <Identity data={data} />
    ) : view === 'branch' ? (
      <NewBranch data={data} />
    ) : view === 'tag' ? (
      <NewTag data={data} />
    ) : view === 'stash' ? (
      <NewStash data={data} />
    ) : view === 'remote' ? (
      <NewRemote data={data} />
    ) : view === 'clone' ? (
      <Clone data={data} />
    ) : (
      <p className="text-muted-foreground p-5 text-sm">This dialog isn’t known: {view}.</p>
    );
  return <div className={cn('bg-background min-h-full')}>{content}</div>;
}
