// The picked tag: its commit, with who tagged it and its message, and
// what can be done with it.

import { Tag as TagIcon } from 'lucide-react';
import { NodeButton } from '@hyperpane/ui';
import type { Tag } from '../../../shared/index.ts';
import { tagActions } from '../../app/actions/tags.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { ago } from '../../lib/format.ts';
import { CommitDetails } from '../commit/CommitDetails.tsx';

export function TagDetail({ tag }: { tag: Tag | null }) {
  const repo = useRepo();
  if (!tag) return <Blank icon={TagIcon}>Pick a tag.</Blank>;
  const actions = tagActions(repo, tag);
  return (
    <CommitDetails
      key={tag.name}
      id={`${tag.name}:${tag.sha}`}
      place="tag"
      load={() => repo.api.show(tag.sha)}
      top={() => (
        <div className="flex flex-none flex-col gap-1 border-b border-[var(--node-border)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <TagIcon className="size-3.5 text-[var(--ansi-3)]" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tag.name}</span>
            {actions.slice(0, 2).map((a) => (
              <NodeButton key={a.label} disabled={a.disabled} onClick={a.run}>
                {a.label.replace(/…$/, '')}
              </NodeButton>
            ))}
            <NodeButton className="text-[var(--ansi-1)]" onClick={actions[3].run}>
              Delete
            </NodeButton>
          </div>
          {tag.annotated && (
            <div className="text-2xs text-[var(--node-muted)]">
              {tag.tagger ? `Tagged by ${tag.tagger} ` : 'Tagged '}
              {ago(tag.date)}
              {tag.message ? <pre className="mt-1 font-sans text-xs whitespace-pre-wrap text-[var(--node-fg)]">{tag.message}</pre> : null}
            </div>
          )}
        </div>
      )}
    />
  );
}
