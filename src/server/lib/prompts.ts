// Questions for the user while git runs on the network (a username, a
// password, a host key): a `prompt` event on the subscription that asked,
// answered by the `answer` call with its id. One nobody answers is given
// up on (null) after `timeout`, or when its subscription ends.

import { randomBytes } from 'node:crypto';
import type { Out } from '@hyperpane/sdk/server';
import type { SyncEvent } from '../../shared/index.ts';
import type { Prompt } from './askpass.ts';

/** A prompt waiting for the user. */
export interface Pending {
  resolve(value: string | null): void;
}

/** The prompts waiting (by id), and an asker for a subscription. */
export function prompts(timeout?: number) {
  const pending = new Map<string, Pending>();

  /** Asks the user through a subscription: a `prompt` event, then `answer`. */
  function asker(out: Out) {
    return (p: Prompt) =>
      new Promise<string | null>((resolve) => {
        const id = randomBytes(8).toString('hex');
        let done = false;
        const finish = (value: string | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          out.signal.removeEventListener('abort', onAbort);
          pending.delete(id);
          resolve(value);
        };
        const onAbort = () => finish(null);
        const timer = setTimeout(() => finish(null), timeout ?? 5 * 60_000);
        out.signal.addEventListener('abort', onAbort, { once: true });
        pending.set(id, { resolve: finish });
        const event: SyncEvent = { type: 'prompt', id, prompt: p.prompt, secret: p.secret, kind: p.kind };
        if (!out.emit(event)) finish(null);
      });
  }

  return { pending, asker };
}
