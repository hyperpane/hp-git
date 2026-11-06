// What the History tab can search by.

export type SearchMode = 'message' | 'author' | 'sha' | 'path' | 'added' | 'regex';
export const MODES: { id: SearchMode; label: string; hint: string }[] = [
  { id: 'message', label: 'Message', hint: 'Words in the message' },
  { id: 'author', label: 'Author', hint: 'A name or an email' },
  { id: 'sha', label: 'SHA', hint: 'The start of a commit’s SHA' },
  { id: 'path', label: 'Path', hint: 'A file or folder' },
  { id: 'added', label: 'Added or removed text', hint: 'Text the changes added or removed (-S)' },
  { id: 'regex', label: 'Changed lines matching', hint: 'A regular expression on changed lines (-G)' },
];
