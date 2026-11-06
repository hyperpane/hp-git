// What this server runs on. Windows differs: no process groups (a cancel
// kills the tree), named pipes for the askpass helper, a batch file to
// start it, and its own places git usually is.

export const WIN = process.platform === 'win32';
