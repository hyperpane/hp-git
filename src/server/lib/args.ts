// What a request's fields must be: a list of paths, a revision, a branch or
// commit (no spaces), a count within its limits. Each refuses what git could
// take for an option (a leading `-`), in the words the op uses.

import { PluginError } from '@hyperpane/sdk/server';

export function rev(r: unknown, what = 'revision'): string {
  if (typeof r !== 'string' || !r.trim() || r.trim().startsWith('-') || /[\0\n]/.test(r)) throw new PluginError(`That isn't a ${what}.`);
  return r.trim();
}

export function count(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : fallback;
}

export function ref(r: unknown, what = 'branch or commit'): string {
  if (typeof r !== 'string' || !r.trim() || r.trim().startsWith('-') || /[\0\n\s]/.test(r.trim())) throw new PluginError(`That isn't a ${what}.`);
  return r.trim();
}

export function asList(paths: unknown): unknown[] {
  if (paths === undefined || paths === null) return [];
  if (!Array.isArray(paths)) throw new PluginError('Paths come as a list.');
  return paths;
}
