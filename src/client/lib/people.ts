// People as the window shows them: up to two initials, a color of their
// own (the same every time), and who wrote a commit (its author and
// co-authors).

import type { Commit, Person } from '../../shared/index.ts';

/** Up to two letters for a person's avatar. */
export function initials(name: string): string {
  const words = name
    .replace(/[<>()[\]"]/g, ' ')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!words.length) return '?';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ([...words[0]][1] ?? '');
  return (first + last).toUpperCase();
}

/** One of the terminal's colors for a person, the same every time. */
export function personColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const palette = [4, 2, 5, 3, 6, 1, 12, 10, 13, 11, 14, 9];
  return `var(--ansi-${palette[Math.abs(h) % palette.length]})`;
}

/** A commit's author, then its co-authors: the people who wrote it. */
export function authorsOf(c: Pick<Commit, 'author' | 'email' | 'coAuthors'>): Person[] {
  return [{ name: c.author, email: c.email }, ...(c.coAuthors ?? [])];
}

/** “Ada Lovelace”, “Ada Lovelace and Grace Hopper”, “Ada Lovelace and 2 others”. */
export function authorNames(c: Pick<Commit, 'author' | 'email' | 'coAuthors'>): string {
  const people = authorsOf(c);
  if (people.length === 1) return people[0].name;
  if (people.length === 2) return `${people[0].name} and ${people[1].name}`;
  return `${people[0].name} and ${people.length - 1} others`;
}
