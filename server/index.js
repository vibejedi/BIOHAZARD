import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Matchmaker } from './queue.js';
import { WalletAccounts } from './wallets.js';

export function createMatchServer({ data, now, interval, duration, manual = false, origins = ['https://vibejedi.github.io'], maxConnections = 200, wallets = null } = {}) {
  if (!data?.pointNodes || !data.leafContents) throw new Error('Server needs the current prepared Dust2 collision and point-hull data.');
  const manager = new Matchmaker(data, { now, interval, duration });
  const server = createServer(async (request, response) => {
    if (wallets && await wallets.handle(request, response, origins)) return;
    if (request.url !== '/healthz') { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: 'ok', region: 'US West', queueIntervalMs: manager.interval, matchDurationMs: manager.duration, capacity: 10, queued: manager.queue.length, matches: manager.matches.size, nextStartAt: manager.nextStartAt }));
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws' || (request.headers.origin && !origins.includes(request.headers.origin)) || sockets.clients.size >= maxConnections) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client));
  });
  sockets.on('connection', socket => {
    const session = manager.connect(message => { if (socket.readyState === 1) socket.send(JSON.stringify(message)); });
    let count = 0, since = Date.now();
    socket.on('message', (buffer, binary) => {
      if (Date.now() - since >= 1000) { since = Date.now(); count = 0; }
      if (binary || ++count > 100) { socket.close(1008, 'Invalid message or input rate'); return; }
      try { const message = JSON.parse(buffer.toString()); if (message && typeof message === 'object' && typeof message.type === 'string') {
        if (message.type === 'join' && wallets?.token) {
          const account = wallets.session(message.authToken);
          if (!account?.hasPass) { socket.send(JSON.stringify({ type: 'error', message: 'A verified wallet and permanent token-burn pass are required.' })); return; }
          if ([...manager.sessions.values()].some(other => other !== session && other.wallet === account.wallet && (other.queued || other.matchId))) { socket.send(JSON.stringify({ type: 'error', message: 'This wallet is already queued or playing.' })); return; }
          session.wallet = account.wallet; message.name = account.username;
        }
        manager.handle(session, message);
      } }
      catch { socket.send(JSON.stringify({ type: 'error', message: 'INVALID MESSAGE' })); }
    });
    socket.on('close', () => manager.disconnect(session)); socket.on('error', () => {});
  });
  const timer = manual ? null : setInterval(() => manager.tick(), 1000 / 30);
  return { server, sockets, manager, async close() { if (timer) clearInterval(timer); for (const socket of sockets.clients) socket.terminate(); await new Promise(resolve => sockets.close(resolve)); if (server.listening) await new Promise(resolve => server.close(resolve)); wallets?.close(); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = process.env.BIOHAZARD_MAP_DATA || new URL('../game-assets/ready/dust2.json', import.meta.url);
  const data = JSON.parse(await readFile(path, 'utf8'));
  const app = createMatchServer({ data, wallets: new WalletAccounts(), origins: (process.env.ALLOWED_ORIGINS || 'https://vibejedi.github.io,http://127.0.0.1:5173,http://localhost:5173').split(',') });
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`BIOHAZARD US West match server listening on ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
