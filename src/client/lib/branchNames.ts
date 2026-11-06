// Branch names as typed, made valid the way GitHub Desktop does, and why
// one can't be used.

/** A branch name as typed, made valid the way Desktop does: spaces become
 * dashes, characters git refuses become dashes too. */
export function branchName(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[~^:?*[\\\x00-\x1f\x7f]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+/, '')
    .replace(/@\{/g, '-');
}

/** Why a branch name can't be used, or null. */
export function branchProblem(name: string, existing: string[] = []): string | null {
  if (!name) return null;
  if (/\.lock$|\/$|\.$|\/\.|^\/|\/\//.test(name)) return 'That isn’t a valid branch name.';
  if (existing.includes(name)) return `A branch named ${name} already exists.`;
  return null;
}
