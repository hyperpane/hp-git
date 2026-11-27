// The text between conflicts: a few lines on each side of them, the rest
// folded, to open.

import { ChevronsUpDown } from '@hyperpane/icons';
import { plural } from '../../lib/format.ts';
import { Code } from './Code.tsx';

export function FoldedText({ lines, first, last, open, onOpen }: { lines: string[]; first: boolean; last: boolean; open: boolean; onOpen(): void }) {
  const long = lines.length > 8 && !open;
  const head = long ? lines.slice(0, first ? 0 : 3) : lines;
  const tail = long ? lines.slice(last ? lines.length : -3) : [];
  return (
    <>
      {head.map((l, n) => (
        <Code key={`h${n}`} text={l} />
      ))}
      {long && (
        <button
          type="button"
          className="rounded-control my-1 flex h-6 w-full items-center gap-1.5 px-2.5 font-sans text-xs text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--git-fill-hover)] hover:text-[var(--node-fg)] touch:h-9"
          style={{ background: 'var(--git-diff-bar)' }}
          onClick={onOpen}
        >
          <ChevronsUpDown className="size-3" /> {plural(lines.length - head.length - tail.length, 'unchanged line')}
        </button>
      )}
      {tail.map((l, n) => (
        <Code key={`t${n}`} text={l} />
      ))}
    </>
  );
}
