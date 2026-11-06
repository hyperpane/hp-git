// What the app's shell does for a frame's code, done for Node: TSX goes
// through sucrase as the shell transforms it, and the host's specifiers
// (React, lucide, CodeMirror) are the SDK's own copies, as the frame's
// import map has them, so the plugin and the SDK share one React. Needs the
// SDK's register.mjs loaded first (it maps @hyperpane/*).

import { readFileSync } from 'node:fs';
import module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HOST = /^(react|react-dom|lucide-react|codemirror|@codemirror\/[^/]+|@lezer\/[^/]+)(\/.*)?$/;
const require = createRequire(import.meta.url);
const { transform } = require('sucrase') as typeof import('sucrase');

let sdk: string | null = null;

module.registerHooks({
  resolve(specifier, context, next) {
    if (!HOST.test(specifier)) return next(specifier, context);
    sdk ??= next('@hyperpane/sdk/client', context).url;
    return next(specifier, { ...context, parentURL: sdk });
  },
  load(url, context, next) {
    if (!url.startsWith('file:') || !/\.[jt]sx$/.test(url)) return next(url, context);
    const filePath = fileURLToPath(url);
    const { code } = transform(readFileSync(filePath, 'utf8'), { transforms: ['typescript', 'jsx'], jsxRuntime: 'automatic', production: true, filePath });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
