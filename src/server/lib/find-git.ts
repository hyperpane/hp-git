// Finding git: the setting, PATH, then Git for Windows' and Homebrew's
// usual places (an app started from Finder or the Start menu has a short
// PATH), and what `git --version` says.

import { execFile } from 'node:child_process';
import { access, lstat } from 'node:fs/promises';
import path from 'node:path';

/** Where git usually is when it isn't on PATH (an app started from Finder
 * or the Start menu has a short PATH). The same places the app looks. */
export function gitFallbacks(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') {
    const w = path.win32;
    return [
      env.ProgramFiles && w.join(env.ProgramFiles, 'Git', 'cmd', 'git.exe'),
      env['ProgramW6432'] && w.join(env['ProgramW6432'], 'Git', 'cmd', 'git.exe'),
      env['ProgramFiles(x86)'] && w.join(env['ProgramFiles(x86)'], 'Git', 'cmd', 'git.exe'),
      env.LOCALAPPDATA && w.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe'),
      env.USERPROFILE && w.join(env.USERPROFILE, 'scoop', 'shims', 'git.exe'),
    ].filter((p): p is string => !!p);
  }
  if (platform === 'darwin') return ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'];
  return ['/usr/bin/git', '/usr/local/bin/git'];
}

function envValue(env: NodeJS.ProcessEnv, name: string, platform: NodeJS.Platform): string | undefined {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key ? env[key] : undefined;
}

function answer(file: string, args: string[], timeout = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout) => resolve(error ? null : String(stdout).trim()));
  });
}

/**
 * The system's git and what `git --version` says, or null when none runs:
 * `configured` (the setting) if it's given, else PATH's, else the usual
 * places. On a Mac, /usr/bin/git is Xcode's stand-in, which offers to
 * install the developer tools when they aren't there: it's only taken when
 * `xcode-select -p` says they are.
 */
export async function findGit(
  configured = '',
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fallbacks: string[] = gitFallbacks(env, platform),
): Promise<{ path: string; version: string } | null> {
  if (configured.trim()) {
    const file = configured.trim();
    const version = await answer(file, ['--version']);
    return version && /^git version /.test(version) ? { path: file, version } : null;
  }
  const p = platform === 'win32' ? path.win32 : path.posix;
  const name = platform === 'win32' ? 'git.exe' : 'git';
  const dirs = (envValue(env, 'PATH', platform) ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const candidates = [...new Set([...dirs.map((d) => p.join(d.replace(/^"|"$/g, ''), name)), ...fallbacks])];
  let tools: boolean | null = null;
  for (const file of candidates) {
    try {
      if (!(await lstat(file).then((s) => s.isFile() || s.isSymbolicLink()))) continue;
      if (platform !== 'win32') await access(file, 1);
    } catch {
      continue;
    }
    if (platform === 'darwin' && file === '/usr/bin/git') {
      tools ??= (await answer('/usr/bin/xcode-select', ['-p'])) !== null;
      if (!tools) continue;
    }
    const version = await answer(file, ['--version']);
    if (version && /^git version /.test(version)) return { path: file, version };
  }
  return null;
}
