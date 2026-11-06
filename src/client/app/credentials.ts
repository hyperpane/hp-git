// What git asks for while it syncs or clones (a username, a password or a
// passphrase, whether to trust a host), asked through the app's dialogs.

import type { Host } from '@hyperpane/sdk/client';
import type { SyncEvent } from '../../shared/index.ts';

/** Asks for a username, password or passphrase, or to trust a host, for a
 * running sync or clone; answers the server with what was given (null:
 * cancelled). */
export async function askCredentials(host: Host, e: Extract<SyncEvent, { type: 'prompt' }>, answer: (id: string, value: string | null) => Promise<unknown>) {
  let value: string | null;
  if (e.kind === 'hostKey') {
    const ok = await host.ui.confirm({ title: 'Trust this host?', message: e.prompt, confirm: 'Trust and Connect' });
    value = ok ? 'yes' : null;
  } else if (!e.secret) {
    value = await host.ui.prompt({ title: 'Sign in', label: e.prompt.replace(/:\s*$/, ''), placeholder: e.kind === 'username' ? 'Username' : '' });
  } else {
    value = await host.ui.dialog<string>('credentials', {
      title: e.kind === 'passphrase' ? 'Unlock the SSH key' : 'Sign in',
      data: { prompt: e.prompt, kind: e.kind },
      width: 440,
      height: 156,
    });
  }
  await answer(e.id, value ?? null).catch(() => {});
}
