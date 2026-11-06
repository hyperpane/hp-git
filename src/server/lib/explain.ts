// Git's complaints, put plainly: the cases people hit, in their words;
// otherwise git's own lines without the hints and prefixes. The same texts
// v0.1.3's Git plugin gave.

export function explain(stderr: string, stdout = ''): string {
  const all = `${stderr}\n${stdout}`;
  const lower = all.toLowerCase();
  const has = (needle: string) => lower.includes(needle);
  const files = () =>
    all
      .split('\n')
      .filter((l) => l.startsWith('\t'))
      .map((l) => l.trim())
      .slice(0, 5)
      .join(', ');

  if (has('could not read username') || has('could not read password') || has('terminal prompts disabled') || has('user interactivity has been disabled')) {
    return 'The remote wants a username and password, and no credential helper on this server has them. Sign in with git\'s credential helper (or gh auth login) on the server, or use an SSH remote.';
  }
  if (has('authentication failed') || has('invalid username or password') || has('http basic: access denied')) {
    return "The remote turned down the credentials (authentication failed). Sign in again with git's credential helper on the server.";
  }
  if (has('permission denied (publickey')) {
    return "The remote turned down this server's SSH key (permission denied, publickey). Add a key to the ssh agent on the server, or to your account.";
  }
  if (has('host key verification failed')) {
    return "SSH doesn't know the remote's host key yet. Connect once from a terminal on this server to accept it.";
  }
  if (has('could not resolve host') || has('could not resolve hostname')) {
    const m = /resolve host(?:name)?:?\s*([^\s:]+)/i.exec(all);
    return m ? `Couldn't reach ${m[1]}: is the network up?` : "Couldn't reach the remote: is the network up?";
  }
  if (has('repository not found') || has('does not appear to be a git repository')) {
    return "The remote repository isn't there, or this server's account can't see it.";
  }
  if ((has('[rejected]') && (has('fetch first') || has('non-fast-forward'))) || has('updates were rejected')) {
    return "The remote has commits this branch doesn't have. Pull first, then push.";
  }
  if (has('stale info')) {
    return 'The remote branch moved since the last fetch, so the force push was refused. Fetch, look, then try again.';
  }
  if (has('would be overwritten by')) {
    const list = files();
    return list ? `Your changes to ${list} would be overwritten. Commit or stash them first.` : 'Your changes would be overwritten. Commit or stash them first.';
  }
  if (has('untracked working tree files would be')) {
    const list = files();
    return `New files here would be overwritten${list ? ` (${list})` : ''}. Move them, or commit them first.`;
  }
  if (has('please tell me who you are') || has('author identity unknown') || has('empty ident name')) {
    return 'Git doesn\'t know who you are on this server yet. Set your name and email: git config --global user.name "…" and user.email "…".';
  }
  if (has('index.lock') && has('file exists')) {
    return 'Another git command is running in this repository (.git/index.lock is there). If none is, delete that file.';
  }
  if (has('not a git repository')) {
    return "This folder isn't in a Git repository.";
  }
  if (has('nothing to commit') || has('no changes added to commit') || has('nothing added to commit')) {
    return "There's nothing to commit.";
  }
  if (has('not fully merged')) {
    return "This branch isn't fully merged: deleting it loses its commits.";
  }
  if (has('you need to resolve your current index first') || has('unmerged files') || has('committing is not possible because you have unmerged files')) {
    return 'Some files still have conflicts. Resolve them first.';
  }
  if (has('no stash entries found')) {
    return "There's no stash.";
  }
  if (has('is not a valid branch name') || has('not a valid branch name')) {
    return "That isn't a valid branch name.";
  }
  if (has('patch does not apply') || has('patch failed') || has('does not match index') || has('does not exist in index')) {
    return 'The file changed since its diff was shown. Look again, then try once more.';
  }
  if (has('your local changes would be overwritten') || has('cannot rebase: you have unstaged changes') || has('cannot pull with rebase')) {
    return 'You have changes that a rebase would overwrite. Commit or stash them first.';
  }
  if (has('no tracking information') || has('there is no tracking information')) {
    return "This branch has no upstream to pull from. Push it first.";
  }
  if (has('refusing to merge unrelated histories')) {
    return "These branches have no commit in common, so git won't merge them.";
  }
  if (has('not possible to fast-forward')) {
    return "The branches have diverged, so they can't be fast-forwarded. Merge or rebase instead.";
  }
  if (has('already exists') && has('destination path')) {
    return 'The folder to clone into is there already, and not empty.';
  }

  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('hint:') && !l.startsWith('Aborting') && l !== 'remote:')
    .map((l) => l.replace(/^(fatal|error|warning): /, ''))
    .slice(0, 4);
  let text = lines.length ? lines.join(' ') : stdout.trim().split('\n').slice(0, 3).join(' ');
  if (!text) text = 'Git failed.';
  text = text[0].toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}
