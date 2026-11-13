// A commit's header: its subject and message (a long one folded), its SHA
// to copy, who wrote it (with its co-authors) and who committed it (and
// when), its signature, its parents to open, and its refs. The whole of it
// folds to one line, so the diff under it has the room; that's remembered.

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Copy, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@hyperpane/ui';
import type { CommitDetail } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { Authors, Avatar } from '../../components/Avatar.tsx';
import { RefBadge } from '../../components/RefBadge.tsx';
import { copy } from '../../lib/clipboard.ts';
import { ago, longDate, shortSha } from '../../lib/format.ts';
import { local } from '../../lib/local.ts';
import { authorsOf } from '../../lib/people.ts';

export function CommitHeader({ c }: { c: CommitDetail }) {
  const repo = useRepo();
  const [open, setOpen] = useState(() => local.get('commitBody', true));
  const [shown, setShownState] = useState(() => local.get('commitHeader', true));
  const setShown = (on: boolean) => {
    setShownState(on);
    local.set('commitHeader', on);
  };
  const committed = c.committer && (c.committer !== c.author || Math.abs(c.committerDate - c.date) > 60_000);
  const body = c.body.trim();
  const lines = body.split('\n');
  const people = authorsOf(c);
  const long = lines.length > 6;
  const sha = (
    <button
      type="button"
      title="Copy the SHA"
      className="rounded-chip flex h-5 flex-none items-center gap-1 px-1 font-mono text-2xs text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
      onClick={() => copy(c.sha, repo.toast)}
    >
      {shortSha(c.sha)}
      <Copy className="size-3" />
    </button>
  );
  const fold = (
    <button
      type="button"
      title={shown ? 'Hide the message, for more of the diff' : 'Show the message'}
      aria-label={shown ? 'Hide the message' : 'Show the message'}
      aria-expanded={shown}
      className="rounded-chip flex size-5 flex-none items-center justify-center text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
      onClick={() => setShown(!shown)}
    >
      {shown ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  );
  if (!shown)
    return (
      <div className="flex h-8 flex-none items-center gap-1.5 border-b border-[var(--node-border)] ps-1.5 pe-3" data-commit-header="folded">
        {fold}
        <div className="min-w-0 flex-1 truncate font-semibold" title={c.subject}>
          {c.subject}
        </div>
        <Authors commit={c} size={16} />
        {sha}
      </div>
    );
  return (
    <div className="flex max-h-[45%] flex-none flex-col gap-1.5 overflow-auto border-b border-[var(--node-border)] py-2 ps-1.5 pe-3" data-commit-header="open">
      <div className="flex items-start gap-1.5">
        {fold}
        <div className="min-w-0 flex-1 text-sm leading-snug font-semibold break-words select-text">{c.subject}</div>
        {sha}
      </div>
      <div className="flex flex-col gap-1.5 ps-[26px]">
        {body && (
          <div className="relative">
            <pre className={cn('font-sans text-xs leading-relaxed break-words whitespace-pre-wrap text-[var(--node-fg)] opacity-90 select-text', long && !open && 'max-h-[5.2em] overflow-hidden')}>{body}</pre>
            {long && (
              <button
                type="button"
                className="mt-0.5 flex items-center gap-0.5 text-2xs text-[var(--node-accent)] hover:underline"
                onClick={() => {
                  setOpen(!open);
                  local.set('commitBody', !open);
                }}
              >
                {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                {open ? 'Less' : `${lines.length} lines`}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-[var(--node-muted)]">
          <span className="flex items-center gap-1.5">
            <Authors commit={c} size={16} />
            <span className="text-[var(--node-fg)]" title={people.map((p) => `${p.name} <${p.email}>`).join('\n')}>
              {listed(people.map((p) => p.name))}
            </span>
            <span title={longDate(c.date)}>authored {ago(c.date)}</span>
          </span>
          {committed && (
            <span className="flex items-center gap-1.5" title={`${c.committer} <${c.committerEmail}>, ${longDate(c.committerDate)}`}>
              <Avatar name={c.committer} email={c.committerEmail} size={16} />
              <span className="text-[var(--node-fg)]">{c.committer}</span> committed {ago(c.committerDate)}
            </span>
          )}
          {c.signature && (
            <span className={cn('flex items-center gap-1', c.signature.status === 'good' ? 'text-[var(--ansi-2)]' : 'text-[var(--ansi-3)]')} title={`Signed by ${c.signature.signer}: ${c.signature.status}`}>
              {c.signature.status === 'good' ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}
              {c.signature.status === 'good' ? 'Verified' : c.signature.status}
            </span>
          )}
          <span className="flex items-center gap-1">
            {c.parents.length === 0 ? 'The first commit' : c.parents.length > 1 ? 'Merges' : 'Parent'}
            {c.parents.map((p) => (
              <button key={p} type="button" className="rounded-chip px-0.5 font-mono text-[var(--node-accent)] hover:bg-[var(--node-hover)]" title={`Open ${p}`} onClick={() => repo.open({ kind: 'commit', sha: p })}>
                {shortSha(p)}
              </button>
            ))}
          </span>
          {c.refs.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              {c.refs.map((r) => (
                <RefBadge key={`${r.kind}:${r.name}`} refName={r} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** “Ada”, “Ada and Grace”, “Ada, Grace and Alan”. */
const listed = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
