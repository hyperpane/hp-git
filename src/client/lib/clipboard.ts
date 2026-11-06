// Copying text, with a toast when the clipboard refuses.

export async function copy(text: string, toast?: (m: string, o?: { error?: boolean }) => void) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    toast?.('Couldn’t copy.', { error: true });
    void e;
  }
}
