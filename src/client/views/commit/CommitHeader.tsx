// A commit's header: its subject and message (a long one folded), its SHA
// to copy, who wrote it (with its co-authors) and who committed it (and
// when), its signature, its parents to open, and its refs. The whole of it
// folds to one line, so the diff under it has the room; that's remembered.

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Copy, ShieldAlert, ShieldCheck } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';
import type { CommitDetail } from '../../../shared/index.ts';
import { useRepo } from '../../app/repo.ts';
import { Authors, Avatar } from '../../components/Avatar.tsx';
import { RefBadge } from '../../components/RefBadge.tsx';
import { copy } from '../../lib/clipboard.ts';
import { ago, longDate, shortSha } from '../../lib/format.ts';
import { local } from '../../lib/local.ts';
import { header } from '../../ui/classes.ts';
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
      className="group/sha rounded-chip flex h-6 flex-none items-center gap-1.5 bg-[var(--git-fill)] px-2 font-mono text-xs text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)] touch:h-8"
      onClick={() => copy(c.sha, repo.toast)}
    >
      {shortSha(c.sha)}
      <Copy variant="outline" className="size-3 opacity-60 transition-opacity duration-100 group-hover/sha:opacity-100" />
    </button>
  );
  const fold = (
    <button
      type="button"
      title={shown ? 'Hide the message, for more of the diff' : 'Show the message'}
      aria-label={shown ? 'Hide the message' : 'Show the message'}
      aria-expanded={shown}
      className="rounded-control flex size-6 flex-none items-center justify-center text-[var(--node-muted)] transition-colors duration-100 touch:size-8 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]"
      onClick={() => setShown(!shown)}
    >
      <ChevronRight className={cn('size-3.5 transition-transform duration-150', shown && 'rotate-90')} />
    </button>
  );
  if (!shown)
    return (
      <div className={cn(header.base, 'gap-2 ps-2 pe-3')} data-commit-header="folded">
        {fold}
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium" title={c.subject}>
          {c.subject}
        </div>
        <Authors commit={c} size={18} />
        {sha}
      </div>
    );
  return (
    <div
      className="git-scroll flex max-h-[45%] flex-none flex-col gap-2.5 overflow-auto border-b border-[var(--git-line)] pt-2.5 pb-3.5 ps-2 pe-3"
      data-commit-header="open"
    >
      <div className="flex items-start gap-2">
        {fold}
        <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-5 font-semibold tracking-[-0.01em] break-words select-text">{c.subject}</div>
        {sha}
      </div>
      <div className="flex flex-col gap-2.5 ps-8">
        {body && (
          <div className="relative">
            <pre
              className={cn(
                'font-sans text-[13px] leading-5 break-words whitespace-pre-wrap text-[var(--node-fg)] opacity-85 select-text',
                long && !open && 'max-h-[5.2em] overflow-hidden',
              )}
            >
              {body}
            </pre>
            {long && (
              <button
                type="button"
                className="mt-1 flex items-center gap-0.5 text-xs text-[var(--node-accent)] hover:underline"
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--node-muted)]">
          <span className="flex items-center gap-1.5">
            <Authors commit={c} size={18} />
            <span className="font-medium text-[var(--node-fg)]" title={people.map((p) => `${p.name} <${p.email}>`).join('\n')}>
              {listed(people.map((p) => p.name))}
            </span>
            <span title={longDate(c.date)}>authored {ago(c.date)}</span>
          </span>
          {committed && (
            <span className="flex items-center gap-1.5" title={`${c.committer} <${c.committerEmail}>, ${longDate(c.committerDate)}`}>
              <Avatar name={c.committer} email={c.committerEmail} size={18} />
              <span className="font-medium text-[var(--node-fg)]">{c.committer}</span> committed {ago(c.committerDate)}
            </span>
          )}
          {c.signature && (
            <span
              className={cn('flex items-center gap-1', c.signature.status === 'good' ? 'text-[var(--git-added)]' : 'text-[var(--git-modified)]')}
              title={`Signed by ${c.signature.signer}: ${c.signature.status}`}
            >
              {c.signature.status === 'good' ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}
              {c.signature.status === 'good' ? 'Verified' : c.signature.status}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            {c.parents.length === 0 ? 'The first commit' : c.parents.length > 1 ? 'Merges' : 'Parent'}
            {c.parents.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-chip flex h-5 items-center bg-[var(--git-fill)] px-1.5 font-mono text-[11px] text-[var(--node-fg)] transition-colors duration-100 hover:bg-[var(--git-accent-soft)] hover:text-[var(--node-accent)]"
                title={`Open ${p}`}
                onClick={() => repo.open({ kind: 'commit', sha: p })}
              >
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
