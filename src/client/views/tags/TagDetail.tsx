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
  if (!tag)
    return (
      <Blank icon={TagIcon} title="No tag picked">
        Pick one to see the commit it names.
      </Blank>
    );
  const actions = tagActions(repo, tag);
  return (
    <CommitDetails
      key={tag.name}
      id={`${tag.name}:${tag.sha}`}
      place="tag"
      load={() => repo.api.show(tag.sha)}
      top={() => (
        <div className="flex flex-none flex-col gap-2 border-b border-[var(--node-border)] p-3">
          <div className="flex items-center gap-2 max-sm:flex-wrap">
            <TagIcon className="size-3.5 text-[var(--ansi-3)]" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold max-sm:basis-[calc(100%-1.5rem)]">{tag.name}</span>
            {actions.slice(0, 2).map((a) => (
              <NodeButton key={a.label} disabled={a.disabled} onClick={a.run}>
                {a.label}
              </NodeButton>
            ))}
            <NodeButton variant="danger" onClick={actions[3].run}>
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
