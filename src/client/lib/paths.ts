// Paths in a repository as the app writes them (forward slashes): their
// parts, under the root and back, and a .gitignore pattern for one path.

export const basenameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const dirnameOf = (path: string) => {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
};
export const extOf = (path: string) => {
  const name = basenameOf(path);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
};

/** A path under the repository's root, as the app writes paths. */
export const inRepo = (root: string, path: string) => (root.endsWith('/') ? root + path : `${root}/${path}`);

/** The path relative to `root`, or null when it isn't inside it. */
export function relativeTo(root: string, path: string): string | null {
  const r = root.replace(/\/+$/, '');
  if (path === r) return '';
  if (path.startsWith(`${r}/`)) return path.slice(r.length + 1);
  return null;
}

/** A pattern for .gitignore that matches only this path. */
export const ignoreExact = (path: string) => `/${path.replace(/([*?[\]\\!#])/g, '\\$1')}`;
