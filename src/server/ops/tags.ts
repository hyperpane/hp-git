// `tags` and `tag`: the tags, newest first (annotated ones with their
// message and tagger), and making or deleting one. Pushing one is a sync.

import { PluginError } from '@hyperpane/sdk/server';
import type { Tag } from '../../shared/index.ts';
import { ref } from '../lib/args.ts';
import { US } from '../lib/commits.ts';
import type { Repo } from '../lib/repo.ts';

export async function tags(repo: Repo, signal?: AbortSignal): Promise<Tag[]> {
  const format = ['%(refname:strip=2)', '%(objecttype)', '%(objectname)', '%(*objectname)', '%(contents:subject)', '%(taggername)', '%(creatordate:unix)'].join('%1f');
  const out = await repo.text(['for-each-ref', '--sort=-creatordate', `--format=${format}`, 'refs/tags'], { signal });
  const list: Tag[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [name, type, sha, peeled, subject, tagger, date] = line.split(US);
    const annotated = type === 'tag';
    const t: Tag = { name, sha: annotated ? peeled || sha : sha, annotated, date: Number(date) * 1000 };
    if (annotated) {
      if (subject) t.message = subject;
      if (tagger) t.tagger = tagger;
    }
    list.push(t);
  }
  return list;
}

export async function tagAction(repo: Repo, r: { action: unknown; name?: unknown; sha?: unknown; message?: unknown }) {
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || name.startsWith('-') || !(await repo.ok(['check-ref-format', `refs/tags/${name}`]))) throw new PluginError(`“${name}” isn't a valid tag name.`);
  if (r.action === 'delete') {
    await repo.run(['tag', '-d', name]);
    return;
  }
  if (r.action !== 'create') throw new PluginError('Create or delete a tag (push one with sync).');
  if (await repo.ok(['show-ref', '--verify', '--quiet', `refs/tags/${name}`])) throw new PluginError(`There's a tag called ${name} already.`);
  const message = typeof r.message === 'string' ? r.message.trim() : '';
  const target = r.sha ? ref(r.sha, 'commit') : 'HEAD';
  if (message) await repo.run(['tag', '-a', name, '-F', '-', target], { input: `${message}\n` });
  else await repo.run(['tag', name, target]);
}
