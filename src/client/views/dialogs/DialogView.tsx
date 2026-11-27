// The Git window's dialogs, each a modal frame the app draws over
// everything (host.ui.dialog): a password or passphrase git asks for, who
// commits, a new branch, a tag, a stash, a remote, a clone. Each closes
// with what was entered, or null.

import { cn } from '@hyperpane/ui';
import { useGitStyles } from '../../hooks/useGitStyles.ts';
import { GIT_TOKENS_CSS } from '../../ui/tokens.ts';
import { Clone } from './Clone.tsx';
import { Credentials } from './Credentials.tsx';
import { Identity } from './Identity.tsx';
import { NewBranch } from './NewBranch.tsx';
import { NewRemote } from './NewRemote.tsx';
import { NewStash } from './NewStash.tsx';
import { NewTag } from './NewTag.tsx';

/** The data a dialog takes: the app hands it over as JSON. */
type Data<C extends (props: { data: never }) => unknown> = Parameters<C>[0]['data'];

export function DialogView({ view, data }: { view: string; data: unknown }) {
  useGitStyles(GIT_TOKENS_CSS);
  const content =
    view === 'credentials' ? (
      <Credentials data={data as Data<typeof Credentials>} />
    ) : view === 'identity' ? (
      <Identity data={data as Data<typeof Identity>} />
    ) : view === 'branch' ? (
      <NewBranch data={data as Data<typeof NewBranch>} />
    ) : view === 'tag' ? (
      <NewTag data={data as Data<typeof NewTag>} />
    ) : view === 'stash' ? (
      <NewStash data={data as Data<typeof NewStash>} />
    ) : view === 'remote' ? (
      <NewRemote data={data as Data<typeof NewRemote>} />
    ) : view === 'clone' ? (
      <Clone data={data as Data<typeof Clone>} />
    ) : (
      <p className="text-muted-foreground p-5 text-sm">This dialog isn’t known: {view}.</p>
    );
  return <div className={cn('bg-background min-h-full')}>{content}</div>;
}
