// Dates, counts and SHAs as the Git window writes them.

import { formatAgo } from '@hyperpane/sdk/client';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : '');

/** “3 minutes ago”, from milliseconds. */
export const ago = (ms: number) => (ms ? formatAgo(ms) : '');

/** How long ago, in a column's few letters: “now”, “5m”, “3h”, “2d”, “3w”,
 * “4mo”, “2y”. */
export function shortAgo(ms: number, now = Date.now()): string {
  if (!ms) return '';
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 30 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo`;
  return `${Math.floor(s / (365 * 86400))}y`;
}

/** A date as people read it: “4 Nov 2026, 12:30”. */
export function longDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A short date for a column: the time today, the day this year, else the year too. */
export function shortDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
