// The branch graph in one row of the history: the lines through it and
// the commit's dot (ringed for HEAD, hollow for a merge).

import { memo } from 'react';
import { type GraphRow, LANE_WIDTH, MAX_LANES, laneColor, segmentPath } from '../lib/graph.ts';

/** The graph for one row. */
export const GraphCell = memo(function GraphCell({ row, head, height, width }: { row: GraphRow; head: boolean; height: number; width: number }) {
  const cx = Math.min(row.lane, MAX_LANES) * LANE_WIDTH + LANE_WIDTH / 2;
  const color = laneColor(row.color);
  return (
    <svg width={width} height={height} className="flex-none overflow-visible" aria-hidden>
      {row.segments.map((s, i) => (
        <path key={i} d={segmentPath(s, height)} stroke={laneColor(s.color)} strokeWidth={1.75} fill="none" strokeLinecap="round" />
      ))}
      {head && <circle cx={cx} cy={height / 2} r={6.5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
      <circle cx={cx} cy={height / 2} r={row.merge ? 3 : 4} fill={row.merge ? 'var(--node-bg)' : color} stroke={color} strokeWidth={row.merge ? 2 : 1.5} />
    </svg>
  );
});
