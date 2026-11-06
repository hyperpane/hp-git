// The Git plugin's frames: a Git window, or one of its dialogs.

import { mount } from '@hyperpane/sdk/client';
import { GitWindow } from './app/GitWindow.tsx';
import { DialogView } from './views/dialogs/DialogView.tsx';

mount((host) => (host.view.type === 'dialog' ? <DialogView view={host.view.view} data={host.view.data ?? {}} /> : host.view.type === 'node' ? <GitWindow host={host} /> : null));
