// The Changes list's rows: each section's header, then its files, flat or
// by folder (a chain of single folders as one row), as far as it's open.

import type { FileStatus } from '../../shared/index.ts';
import { SIDES, type Side, pickOf } from './picks.ts';

export type Item =
  | { t: 'section'; side: Side; count: number }
  | { t: 'dir'; side: Side; path: string; name: string; depth: number; files: FileStatus[] }
  | { t: 'file'; side: Side; file: FileStatus; depth: number };

/** The sections' rows: by folder (one row for a chain of single folders),
 * or flat. */
export function items(groups: Record<Side, FileStatus[]>, tree: boolean, closed: Set<string>): Item[] {
  const out: Item[] = [];
  for (const side of SIDES) {
    const files = groups[side];
    if (!files.length) continue;
    out.push({ t: 'section', side, count: files.length });
    if (closed.has(`section:${side}`)) continue;
    if (!tree) {
      for (const file of files) out.push({ t: 'file', side, file, depth: 0 });
      continue;
    }
    type Node = { name: string; path: string; dirs: Map<string, Node>; files: FileStatus[]; all: FileStatus[] };
    const top: Node = { name: '', path: '', dirs: new Map(), files: [], all: [] };
    for (const f of files) {
      const parts = f.path.split('/');
      let node = top;
      node.all.push(f);
      for (let i = 0; i < parts.length - 1; i++) {
        let next = node.dirs.get(parts[i]);
        if (!next) node.dirs.set(parts[i], (next = { name: parts[i], path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [], all: [] }));
        next.all.push(f);
        node = next;
      }
      node.files.push(f);
    }
    const walk = (node: Node, depth: number) => {
      for (const dir of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        // a/b/c as one row while each has only one folder and no files.
        let d = dir;
        let name = d.name;
        while (d.files.length === 0 && d.dirs.size === 1) {
          d = [...d.dirs.values()][0];
          name += `/${d.name}`;
        }
        out.push({ t: 'dir', side, path: d.path, name, depth, files: d.all });
        if (!closed.has(`${side}:${d.path}`)) walk(d, depth + 1);
      }
      for (const file of node.files) out.push({ t: 'file', side, file, depth });
    };
    walk(top, 0);
  }
  return out;
}

export const itemKey = (it: Item) => (it.t === 'section' ? `section:${it.side}` : it.t === 'dir' ? `dir:${it.side}:${it.path}` : pickOf(it.side, it.file.path));
