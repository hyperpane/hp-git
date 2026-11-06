// The branch graph beside the history: which lane each commit sits in, and
// the lines through each row. Commits come newest first, in topological
// order (children before parents), a page at a time: the layout carries on
// from where the last page stopped, so paging never redraws what's there.
//
// Each lane follows one line of history down. A commit takes the lane that
// was waiting for it (or a free one); its first parent carries that lane
// on, other parents (merges) take lanes of their own, and lanes from
// several children waiting for the same commit join at its dot.

export interface Segment {
  /** Lanes, and heights from 0 (the row's top) to 1 (its bottom). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
}

export interface GraphRow {
  lane: number;
  color: number;
  segments: Segment[];
  /** Lanes in use at this row. */
  width: number;
  merge: boolean;
}

type Lane = { sha: string; color: number } | null;

export class Graph {
  readonly rows: GraphRow[] = [];
  #lanes: Lane[] = [];
  #color = 0;
  /** The widest row so far. */
  width = 1;

  #free(avoid: number): number {
    const at = this.#lanes.findIndex((l, i) => l === null && i !== avoid);
    if (at >= 0) return at;
    this.#lanes.push(null);
    return this.#lanes.length - 1;
  }

  /** Lays out the next commits. */
  add(commits: { sha: string; parents: string[] }[]): void {
    const lanes = this.#lanes;
    for (const commit of commits) {
      const waiting: number[] = [];
      for (let i = 0; i < lanes.length; i++) if (lanes[i]?.sha === commit.sha) waiting.push(i);
      let lane: number;
      let color: number;
      if (waiting.length) {
        lane = waiting[0];
        color = lanes[lane]!.color;
      } else {
        lane = this.#free(-1);
        color = this.#color++;
      }
      const segments: Segment[] = [];
      // Lines passing by.
      for (let i = 0; i < lanes.length; i++) {
        const l = lanes[i];
        if (l && l.sha !== commit.sha) segments.push({ x0: i, y0: 0, x1: i, y1: 1, color: l.color });
      }
      // Lines coming down into this commit.
      for (const i of waiting) {
        segments.push({ x0: i, y0: 0, x1: lane, y1: 0.5, color: lanes[i]!.color });
        lanes[i] = null;
      }
      const before = lanes.length;
      commit.parents.forEach((parent, nth) => {
        if (nth === 0) {
          // Lanes waiting for the same parent join at its dot.
          lanes[lane] = { sha: parent, color };
          segments.push({ x0: lane, y0: 0.5, x1: lane, y1: 1, color });
          return;
        }
        const at = lanes.findIndex((l) => l?.sha === parent);
        if (at >= 0) {
          segments.push({ x0: lane, y0: 0.5, x1: at, y1: 1, color: lanes[at]!.color });
        } else {
          const i = this.#free(lane);
          const c = this.#color++;
          lanes[i] = { sha: parent, color: c };
          segments.push({ x0: lane, y0: 0.5, x1: i, y1: 1, color: c });
        }
      });
      if (commit.parents.length === 0) lanes[lane] = null;
      const width = Math.max(before, lanes.length, lane + 1);
      while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
      this.width = Math.max(this.width, width);
      this.rows.push({ lane, color, segments, width, merge: commit.parents.length > 1 });
    }
  }
}

/** Lane colors, from the terminal palette. */
export const LANE_COLORS = ['var(--ansi-4)', 'var(--ansi-2)', 'var(--ansi-5)', 'var(--ansi-3)', 'var(--ansi-6)', 'var(--ansi-1)', 'var(--ansi-12)', 'var(--ansi-10)', 'var(--ansi-13)', 'var(--ansi-11)'];

export function laneColor(n: number): string {
  return LANE_COLORS[n % LANE_COLORS.length];
}

/** The most lanes drawn; past them lines are cut at the edge. */
export const MAX_LANES = 14;
export const LANE_WIDTH = 12;

/** An SVG path for a segment in a row `h` tall. */
export function segmentPath(s: Segment, h: number): string {
  const x = (lane: number) => Math.min(lane, MAX_LANES) * LANE_WIDTH + LANE_WIDTH / 2;
  const x0 = x(s.x0);
  const x1 = x(s.x1);
  const y0 = s.y0 * h;
  const y1 = s.y1 * h;
  if (x0 === x1) return `M${x0} ${y0}V${y1}`;
  // A curve that leaves and arrives straight.
  const mid = (y0 + y1) / 2;
  return `M${x0} ${y0}C${x0} ${mid} ${x1} ${mid} ${x1} ${y1}`;
}
