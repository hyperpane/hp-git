// The picked tag: its commit, with who tagged it and its message, and
// what can be done with it.

import { Tag as TagIcon } from '@hyperpane/icons';
import { cn } from '@hyperpane/ui';
import type { Tag } from '../../../shared/index.ts';
import { tagActions } from '../../app/actions/tags.ts';
import { useRepo } from '../../app/repo.ts';
import { Blank } from '../../components/Blank.tsx';
import { ago } from '../../lib/format.ts';
import { header } from '../../ui/classes.ts';
import { Button } from '../../ui/parts.tsx';
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
        <>
          <div className={cn(header.base, 'gap-2 ps-3.5 pe-2 max-sm:h-auto max-sm:flex-wrap max-sm:py-2')}>
            <TagIcon className="size-4 flex-none text-[var(--git-tag)]" />
            <span className={cn(header.title, 'max-sm:basis-[calc(100%-1.5rem)]')}>{tag.name}</span>
            <span className={cn(header.meta, 'flex-1')}>
              {tag.annotated ? `${tag.tagger ? `Tagged by ${tag.tagger} ` : 'Tagged '}${ago(tag.date)}` : 'Lightweight'}
            </span>
            {actions.slice(0, 2).map((a) => (
              <Button key={a.label} disabled={a.disabled} onClick={a.run}>
                {a.label}
              </Button>
            ))}
            <Button variant="danger" onClick={actions[3].run}>
              Delete
            </Button>
          </div>
          {tag.annotated && tag.message ? (
            <pre className="flex-none border-b border-[var(--git-line)] px-3.5 py-3 font-sans text-[13px] leading-5 whitespace-pre-wrap text-[var(--node-fg)] opacity-85 select-text">
              {tag.message}
            </pre>
          ) : null}
        </>
      )}
    />
  );
}
