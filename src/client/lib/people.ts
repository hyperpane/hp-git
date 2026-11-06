// People as the window shows them: up to two initials, and a color of
// their own (the same every time).

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
