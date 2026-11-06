// A moment's wait, for the frame to draw.

/** Waits a moment, giving the frame a turn. */
export const nextTurn = () => new Promise<void>((r) => setTimeout(r, 0));
