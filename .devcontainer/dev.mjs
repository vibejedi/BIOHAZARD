import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, open, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'game-assets', 'development'), stateFile = join(directory, 'processes.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const webPort = Number(process.env.BIOHAZARD_DEV_FRONTEND_PORT || 5173), matchPort = Number(process.env.BIOHAZARD_DEV_MATCH_PORT || 8080);
if (![webPort, matchPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535) || webPort === matchPort) throw new Error('Invalid development ports.');
const space = process.env.CODESPACE_NAME, domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
if ((space && !/^[a-z0-9-]+$/.test(space)) || !/^[a-z0-9.-]+$/.test(domain)) throw new Error('Invalid Codespaces forwarding hostname.');
const host = space ? `${space}-${webPort}.${domain}` : null;
const endpoint = space ? `wss://${space}-${matchPort}.${domain}/ws` : `ws://127.0.0.1:${matchPort}/ws`;
const services = [
  { name: 'multiplayer', port: matchPort, path: '/healthz', entry: 'server/index.js', args: [], env: { HOST: '0.0.0.0', PORT: String(matchPort), ALLOWED_ORIGINS: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`, 'https://vibejedi.github.io', ...(host ? [`https://${host}`] : [])].join(',') } },
  { name: 'frontend', port: webPort, path: '/local-game-assets/status.json', entry: 'node_modules/vite/bin/vite.js', args: ['--host', '0.0.0.0', '--port', String(webPort), '--strictPort'], env: { VITE_MULTIPLAYER_URL: endpoint, VITE_WALLET_API_URL: space ? `https://${space}-${matchPort}.${domain}` : `http://127.0.0.1:${matchPort}`, ...(host ? { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: host } : {}) } },
];
let state;
try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; state = {}; }
function owned(record) {
  if (!Number.isSafeInteger(record?.pid) || !/^biohazard-(frontend|multiplayer)-[a-f0-9-]+$/.test(record.title || '')) return false;
  try { const args = execFileSync('ps', ['-p', String(record.pid), '-o', 'args='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); return args === record.title || args.split(/\s+/).includes(`--title=${record.title}`); } catch { return false; }
}
async function healthy(service) {
  try {
    const response = await fetch(`http://127.0.0.1:${service.port}${service.path}`, { signal: AbortSignal.timeout(1000) });
    const data = response.ok ? await response.json() : {};
    return service.name === 'frontend' ? data.available === true : data.status === 'ok' && data.capacity === 10;
  } catch { return false; }
}
async function free(port) {
  await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', () => reject(new Error(`Port ${port} is already in use. Stop its existing server before starting the managed development services.`))); probe.listen(port, '0.0.0.0', () => probe.close(resolve)); });
}
async function save() { await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n'); }
async function stop(name) {
  const record = state[name];
  if (owned(record)) {
    process.kill(record.pid, 'SIGTERM');
    for (let i = 0; i < 40 && owned(record); i++) await delay(100);
    if (owned(record)) throw new Error(`The tracked ${name} process did not stop; see its log.`);
  }
  delete state[name]; await save();
}
async function start(service) {
  if (owned(state[service.name])) {
    if (await healthy(service)) return;
    await stop(service.name);
  }
  await free(service.port); await access(join(root, service.entry));
  const title = `biohazard-${service.name}-${randomUUID()}`;
  const log = await open(join(directory, `${service.name}.log`), 'a');
  let child;
  try {
    child = spawn(process.execPath, [`--title=${title}`, join(root, service.entry), ...service.args], { cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, ...service.env } });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    state[service.name] = { pid: child.pid, title }; child.unref(); await save();
  } finally { await log.close(); }
  for (let i = 0; i < 80; i++) { if (await healthy(service)) return; if (!owned(state[service.name])) break; await delay(250); }
  await stop(service.name); throw new Error(`${service.name} did not become ready. Read game-assets/development/${service.name}.log.`);
}
async function main() {
  await mkdir(directory, { recursive: true });
  const command = process.argv[2] || 'status';
  if (!['start', 'status', 'stop'].includes(command)) throw new Error('Use: node .devcontainer/dev.mjs start|status|stop');
  if (command === 'stop') { for (const service of [...services].reverse()) await stop(service.name); console.log('Managed BIOHAZARD development servers stopped.'); return; }
  if (command === 'start') {
    const started = [];
    try {
      for (const service of services) { const previous = state[service.name]?.pid; await start(service); if (state[service.name]?.pid !== previous) started.push(service.name); }
    } catch (error) { for (const name of started.reverse()) await stop(name); throw error; }
  }
  let ready = true;
  for (const service of services) { const running = owned(state[service.name]) && await healthy(service); console.log(`${service.name}: ${running ? 'ready' : 'not running'} (port ${service.port})`); ready &&= running; }
  if (host && ready) { console.log(`Game preview: https://${host}`); console.log(`Development multiplayer: ${endpoint}`); }
  else if (ready) console.log(`Open forwarded port ${webPort} to preview the game.`);
  console.log('Logs: game-assets/development/{frontend,multiplayer}.log');
  if (!ready) process.exitCode = 1;
}
main().catch(error => { console.error(`Development services: ${error.message}`); process.exitCode = 1; });
