// The code selected in a diff, as text to copy: its rows are placed one by
// one (absolutely, in a list that draws only what's in view), so what the
// browser would copy can run lines together or bring the line numbers and
// hunk headers along. This takes each line's code alone, a line per row.

/** The code selected under `root`, a line per row; null when the
 * selection isn't in its code. */
export function selectedCode(root: Element, sel: Selection | null): string | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const cells = [...root.querySelectorAll('[data-code]')].filter((cell) => range.intersectsNode(cell));
  if (!cells.length) return null;
  return cells.map((cell) => partOf(cell, range)).join('\n');
}

/** What of a line's code the selection takes: all of it, or from where the
 * selection starts, or up to where it ends. */
function partOf(cell: Element, range: Range): string {
  const r = cell.ownerDocument.createRange();
  r.selectNodeContents(cell);
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
  return r.toString();
}
