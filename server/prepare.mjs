import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let source;
try { source = await readFile(new URL('../game-assets/ready/dust2.json', import.meta.url)); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // A fresh VPS clone can obtain the curated collision data from the already
  // published site branch; the installer and original game files are not needed.
  execFileSync('git', ['fetch', '--no-tags', 'origin', 'gh-pages'], { cwd: root, stdio: 'inherit' });
  source = execFileSync('git', ['show', 'FETCH_HEAD:local-game-assets/dust2.json'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
}
const data = JSON.parse(source);
if (!data.pointNodes?.length || !data.leafContents?.length || !data.nodes?.length) throw new Error('Current Dust2 collision and bullet trace data is required.');
await mkdir(new URL('../server-data/', import.meta.url), { recursive: true });
await writeFile(new URL('../server-data/dust2.json', import.meta.url), source);
console.log(`Prepared authoritative Dust2 server data (${source.length} bytes).`);
