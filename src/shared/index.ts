// What both parts (and plugins that call this one) import: the shapes of the
// server part's replies and events, by area, and the patch builder for line
// and hunk staging. API.md says what each op takes and gives. Types come
// from here; code (patch.ts) from its own file.

export type * from './status.ts';
export type * from './repos.ts';
export type * from './diff.ts';
export type * from './history.ts';
export type * from './refs.ts';
export type * from './sync.ts';
export type * from './topics.ts';
export * from './patch.ts';
