// The commit box under the changes: who commits (shown, and set for this
// repository), a summary and a description, amend (with what it amends),
// sign-off, co-authors from the history, and the button that says what it
// commits where (⌘↵): exactly the files and lines checked (lib/include.ts;
// git's index is left alone), or, staging by hand, what's staged. It keeps
// the draft while you look elsewhere, and offers to undo the last commit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { keys, mod } from '@hyperpane/sdk/client';
import { Button, cn, menuItems, type MenuEntry, styles } from '@hyperpane/ui';
import type { Author } from '../../../shared/index.ts';
import { fileActions } from '../../app/actions/files.ts';
import { useRepo } from '../../app/repo.ts';
import { EMPTY, useCommitDraft } from '../../hooks/useCommitDraft.ts';
import { plural, shortSha } from '../../lib/format.ts';
import { afterCommit, checkedFiles, selection } from '../../lib/include.ts';
import { local } from '../../lib/local.ts';
import { sideFiles } from '../../lib/picks.ts';
import { Chip, CoAuthorList, IdentityButton, LastCommit, SummaryField } from './CommitBoxParts.tsx';

export function CommitBox() {
  const repo = useRepo();
  const { status, api, host } = repo;
  const { draftKey, draft, setDraft, setDraftState } = useCommitDraft(repo.root);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ sha: string; summary: string } | null>(null);
  const [amending, setAmending] = useState<{ sha: string; subject: string } | null>(null);
  const [authors, setAuthors] = useState<Author[] | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const signoffDefault = host.settings.get<boolean>('signoff') === true;
  const signoff = draft.signoff ?? signoffDefault;
  const { including, choices, choose } = repo;

  const groups = useMemo(() => sideFiles(status.files), [status.files]);
  /** What the commit takes: the files checked, or staged. */
  const checked = useMemo(() => checkedFiles(status.files, choices), [status.files, choices]);
  const staged = including ? checked.length : groups.staged.length;
  const conflicts = groups.conflict.length;
  const op = status.operation;
  const merging = op?.kind === 'merge';

  // A merge (or a stopped pick or revert) comes with its message.
  const prepared = op?.message;
  useEffect(() => {
    if (prepared && !draft.summary) {
      const [first, ...rest] = prepared.split('\n');
      setDraft({ summary: first, description: rest.join('\n').trim() });
    }
  }, [prepared]); // eslint-disable-line react-hooks/exhaustive-deps

  // Amend: what's amended, and its message to edit.
  useEffect(() => {
    if (!draft.amend || !status.head) {
      setAmending(null);
      return;
    }
    const p = api.show(status.head);
    p.promise.then(
      (c) => {
        setAmending({ sha: c.sha, subject: c.subject });
        setDraftState((d) => (d.summary || d.description ? d : { ...d, summary: c.subject, description: c.body }));
      },
      () => {},
    );
    return () => p.cancel();
  }, [draft.amend, status.head, api]);

  const pickCoAuthor = async (e: React.MouseEvent) => {
    let list = authors;
    if (!list) {
      list = (await repo.run(() => api.authors(500))) ?? [];
      setAuthors(list);
    }
    const me = status.identity.email?.toLowerCase();
    const choices = list.filter((a) => a.email.toLowerCase() !== me && !draft.coAuthors.some((c) => c.email === a.email)).slice(0, 30);
    const items: (MenuEntry | null)[] = choices.length
      ? choices.map((a) => ({ label: `${a.name} <${a.email}>`, run: () => setDraft({ coAuthors: [...draft.coAuthors, { name: a.name, email: a.email }] }) }))
      : [{ label: 'Nobody else has committed here', disabled: true, run: () => {} }];
    items.push(null, {
      label: 'Someone Else…',
      run: async () => {
        const text = await repo.prompt('Add a co-author', 'Name and email', '', 'Ada Lovelace <ada@example.com>');
        const m = text && /^(.*?)\s*<([^>]+)>\s*$/.exec(text.trim());
        if (m) setDraft({ coAuthors: [...draft.coAuthors, { name: m[1], email: m[2] }] });
        else if (text) repo.toast('Write it as Name <email>.', { error: true });
      },
    });
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = await host.ui.menu({ x: r.left, y: r.bottom + 2 }, menuItems(items));
    const item = id !== null && /^\d+$/.test(id) ? items[Number(id)] : null;
    if (item && !item.disabled) item.run();
  };

  const editIdentity = async () => {
    const result = await host.ui.dialog<{ name: string; email: string; global: boolean }>('identity', {
      title: 'Who commits here',
      data: { name: status.identity.name ?? '', email: status.identity.email ?? '' },
      width: 440,
      height: 236,
    });
    if (!result) return;
    repo.run(() => api.config({ set: { 'user.name': result.name, 'user.email': result.email }, global: result.global }), {
      done: result.global ? 'Saved for every repository.' : 'Saved for this repository.',
    });
  };

  const nothing = staged === 0 && !draft.amend && !merging;
  /** Nothing staged but there are changes: commit them all. (Not when every
   * change is checked by itself: then nothing checked was left out.) */
  const commitAll = !including && nothing && status.files.length > 0;
  const ready = !busy && !conflicts && (!!draft.summary.trim() || draft.amend || (merging && !!prepared)) && (commitAll || !nothing);

  const commit = async () => {
    if (!ready) return;
    const all = commitAll;
    if (!status.identity.name || !status.identity.email) {
      editIdentity();
      return;
    }
    setBusy(true);
    const done = await repo.run(async () =>
      api.commit({
        summary: draft.summary.trim(),
        description: draft.description.trim() || undefined,
        amend: draft.amend || undefined,
        signoff: signoff || undefined,
        coAuthors: draft.coAuthors.length ? draft.coAuthors : undefined,
        all: all || undefined,
        only: including ? await selection(status.files, choices, (f) => api.diff({ path: f.path, ...(f.untracked ? { untracked: true } : { head: true }), full: true }).promise) : undefined,
      }),
    );
    setBusy(false);
    if (done) {
      // What's left of a file committed in part is out now.
      choose(afterCommit);
      setLast(done);
      setDraftState(() => {
        const next = { ...EMPTY, signoff: draft.signoff };
        local.set(draftKey, next);
        return next;
      });
    }
  };

  const undo = async () => {
    const message = await repo.run(() => api.undoCommit());
    if (message) {
      setLast(null);
      setDraft({ summary: message.summary, description: message.description, amend: false });
    }
  };

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && mod(e)) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  };

  if (op?.kind === 'rebase' || op?.kind === 'am' || op?.kind === 'bisect') return null;

  const branch = status.branch ?? (status.head ? `${shortSha(status.head)} (detached)` : 'a new branch');
  const label = draft.amend ? `Amend ${amending ? shortSha(amending.sha) : 'last commit'}` : merging ? 'Commit Merge' : staged ? `Commit ${plural(staged, 'file')} to ${branch}` : `Commit to ${branch}`;

  return (
    <div className="flex flex-none flex-col gap-1.5 border-t border-[var(--node-border)] p-2" onKeyDown={keyDown}>
      {last && <LastCommit last={last} onUndo={undo} onDismiss={() => setLast(null)} />}
      <IdentityButton identity={status.identity} onClick={editIdentity} />
      <SummaryField
        inputRef={summaryRef}
        summary={draft.summary}
        placeholder={draft.amend ? 'Summary (empty: keep the message)' : merging ? 'Merge summary' : 'Summary (required)'}
        onChange={(summary) => setDraft({ summary })}
      />
      <textarea
        value={draft.description}
        spellCheck
        placeholder="Description"
        rows={draft.description.split('\n').length > 2 ? 5 : 3}
        onChange={(e) => setDraft({ description: e.target.value })}
        aria-label="Description"
        className="rounded-control git-scroll w-full resize-none border border-[var(--node-border)] bg-transparent px-2 py-1.5 text-xs leading-relaxed text-[var(--node-fg)] outline-none transition-colors duration-100 placeholder:text-[var(--node-muted)] hover:border-[color-mix(in_srgb,var(--node-fg)_24%,transparent)] focus:border-[var(--node-accent)]"
      />
      {draft.coAuthors.length > 0 && <CoAuthorList coAuthors={draft.coAuthors} onRemove={(c) => setDraft({ coAuthors: draft.coAuthors.filter((x) => x !== c) })} />}
      <div className="flex items-center gap-1">
        <Chip on={draft.amend} disabled={!status.head || merging} onClick={() => setDraft({ amend: !draft.amend, ...(draft.amend ? { summary: '', description: '' } : {}) })} title="Change the last commit instead of making a new one">
          Amend
        </Chip>
        <Chip on={signoff} onClick={() => setDraft({ signoff: !signoff })} title="Add a Signed-off-by line">
          Sign off
        </Chip>
        <span className="flex-1" />
        <button
          type="button"
          title="Add a co-author"
          aria-label="Add a co-author"
          className={cn('rounded-control flex h-6 items-center gap-1 px-1.5 text-2xs text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]', styles.focusRing)}
          onClick={pickCoAuthor}
        >
          <UserPlus className="size-3.5" />
          Co-author
        </button>
      </div>
      {draft.amend && amending && (
        <div className="truncate text-2xs text-[var(--ansi-3)]" title={amending.subject}>
          Amending <span className="font-mono">{shortSha(amending.sha)}</span> {amending.subject}
          {status.ahead === 0 && status.upstream ? ' — it was pushed: pushing again will need a force push.' : ''}
        </div>
      )}
      {conflicts > 0 && <div className="text-2xs text-[var(--ansi-9)]">Resolve {plural(conflicts, 'conflict')} before committing.</div>}
      {nothing && !conflicts && status.files.length > 0 && including && (
        <div className="text-2xs text-[var(--node-muted)]">
          No file is checked.{' '}
          <button type="button" className="text-[var(--node-accent)] hover:underline" onClick={() => fileActions(repo).allIn()}>
            Check all {plural(status.files.length, 'change')}
          </button>
          .
        </div>
      )}
      {nothing && !conflicts && status.files.length > 0 && !including && (
        <div className="text-2xs text-[var(--node-muted)]">
          Nothing is staged.{' '}
          <button type="button" className="text-[var(--node-accent)] hover:underline" onClick={() => fileActions(repo).allIn()}>
            Stage all {plural(status.files.length, 'change')}
          </button>
          , or commit them all ({keys('⌘↵')}).
        </div>
      )}
      <Button
        size="sm"
        className="w-full min-w-0"
        disabled={!ready}
        onClick={() => commit()}
        title={`${label} (${keys('⌘↵')})`}
      >
        <span className="truncate">{busy ? 'Committing…' : commitAll ? `Commit all ${plural(status.files.length, 'change')}` : label}</span>
      </Button>
    </div>
  );
}
