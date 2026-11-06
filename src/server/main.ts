// The server part: one Node process per server, started on the first call.
// `@hyperpane/sdk/server` is always the server's own copy.

import { serve } from '@hyperpane/sdk/server';
import { git } from './plugin.ts';

serve(git);
