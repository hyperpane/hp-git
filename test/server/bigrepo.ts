// A big repository, made fast with `git fast-import`: `files` files in
// folders of 50, `commits` commits each changing a few of them, a merge of
// a side branch every 100 commits, and the working tree checked out.

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

export interface BigRepo {
  commits: number;
  files: number;
}

const pathOf = (i: number) => `src/m${Math.floor(i / 50)}/file${i}.ts`;

function content(i: number, version: number): string {
  let out = `// file ${i}\n`;
  for (let k = 0; k < 20; k++) out += `export const value${k} = ${k === version % 20 ? version : k};\n`;
  return out;
}

export async function makeBigRepo(dir: string, o: BigRepo, env: NodeJS.ProcessEnv): Promise<void> {
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env });
  const child = spawn('git', ['fast-import', '--quiet', '--done'], { cwd: dir, env, stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`fast-import exited ${code}`))));
  });
  const chunks: string[] = [];
  let size = 0;
  const write = async (text: string) => {
    chunks.push(text);
    size += text.length;
    if (size > 1 << 20) await flush();
  };
  const flush = async () => {
    const text = chunks.join('');
    chunks.length = 0;
    size = 0;
    if (!child.stdin.write(text)) await new Promise((r) => child.stdin.once('drain', r));
  };
  const data = (text: string) => `data ${Buffer.byteLength(text)}\n${text}\n`;
  let time = 1_600_000_000;
  const who = (n: number) => `${['Ada Lovelace <ada@example.com>', 'Grace Hopper <grace@example.com>', 'Alan Turing <alan@example.com>'][n % 3]} ${time} +0000`;
  // The first commit: every file.
  await write(`commit refs/heads/main\nmark :1\nauthor ${who(0)}\ncommitter ${who(0)}\n${data('Initial import')}`);
  for (let i = 0; i < o.files; i++) await write(`M 100644 inline ${pathOf(i)}\n${data(content(i, 0))}`);
  for (let c = 2; c <= o.commits; c++) {
    time += 600;
    const isMerge = c % 100 === 0 && c > 10;
    const side = 1_000_000 + c;
    if (isMerge) {
      // A side commit off a few commits back, then merged.
      await write(`commit refs/heads/side\nmark :${side}\nauthor ${who(c + 1)}\ncommitter ${who(c + 1)}\n${data(`Side work before ${c}`)}from :${c - 5}\nM 100644 inline side/notes${c}.md\n${data(`notes ${c}\n`)}`);
    }
    const author = who(c);
    let commit = `commit refs/heads/main\nmark :${c}\nauthor ${author}\ncommitter ${author}\n${data(isMerge ? `Merge side work into main (${c})` : `Change ${c}: update values in ${c % o.files}`)}from :${c - 1}\n`;
    if (isMerge) commit += `merge :${side}\n`;
    for (let k = 0; k < 1 + (c % 3); k++) {
      const f = (c * 7 + k * 131) % o.files;
      commit += `M 100644 inline ${pathOf(f)}\n${data(content(f, c))}`;
    }
    await write(commit);
  }
  await write('done\n');
  await flush();
  child.stdin.end();
  await done;
  execFileSync('git', ['checkout', '-q', '-f', 'main'], { cwd: dir, env });
}

export { pathOf };
