import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPublicClient, http, erc20Abi, isAddress, getAddress, parseUnits, decodeEventLog, verifyMessage, zeroAddress } from 'viem';
import { bsc } from 'viem/chains';

export const TEST_TOKEN = '0xe49b8c748660a318d7d075a7a056a620712c7777';
export const BURN_TOKENS = '100000';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const userName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(value);

export function bscVerifier({ rpcUrl, token, method, burnAddress }) {
  const client = createPublicClient({ chain: bsc, transport: http(rpcUrl, { timeout: 10000, retryCount: 0 }) });
  const address = getAddress(token);
  const destination = method === 'burn' ? zeroAddress : getAddress(burnAddress);
  async function metadata() {
    if (await client.getChainId() !== 56) throw fail(503, 'The rewards RPC must point to BNB Smart Chain mainnet (56).');
    const [code, decimals, symbol] = await Promise.all([client.getCode({ address }), client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }), client.readContract({ address, abi: erc20Abi, functionName: 'symbol' })]);
    if (!code || code === '0x' || decimals > 24) throw fail(503, 'The configured access token could not be verified.');
    return { address, symbol: String(symbol).slice(0, 24), decimals: Number(decimals), amount: parseUnits(BURN_TOKENS, decimals).toString(), method, destination };
  }
  return {
    metadata,
    async receipt(transactionHash, wallet) {
      const meta = await metadata();
      const [receipt, transaction, block] = await Promise.all([client.getTransactionReceipt({ hash: transactionHash }), client.getTransaction({ hash: transactionHash }), client.getBlockNumber({ cacheTime: 0 })]);
      if (receipt.status !== 'success' || transaction.from.toLowerCase() !== wallet || transaction.to?.toLowerCase() !== address.toLowerCase()) throw fail(422, 'This is not a successful token transaction from your connected wallet.');
      const confirmations = Number(block - receipt.blockNumber + 1n);
      if (confirmations < 3) throw fail(409, 'Waiting for three chain confirmations.');
      let burned = 0n;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== address.toLowerCase()) continue;
        try {
          const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: 'Transfer' });
          if (event.args.from.toLowerCase() === wallet && event.args.to.toLowerCase() === destination.toLowerCase()) burned += event.args.value;
        } catch { /* Other events cannot prove a burn. */ }
      }
      if (burned < BigInt(meta.amount)) throw fail(422, 'The receipt does not prove a burn of 100,000 configured tokens.');
      return { ...meta, transactionHash, confirmations, burned: burned.toString() };
    },
  };
}

export class WalletAccounts {
  constructor({ dbPath = process.env.ACCOUNTS_DB || new URL('../game-assets/accounts/accounts.sqlite', import.meta.url).pathname, now = () => Date.now(), token = process.env.BSC_ACCESS_TOKEN || '', testToken = process.env.BSC_TEST_TOKEN || TEST_TOKEN, rpcUrl = process.env.BSC_RPC_URL || '', method = process.env.BSC_BURN_METHOD || '', burnAddress = process.env.BSC_BURN_ADDRESS || '', allowTestBurn = process.env.BSC_ALLOW_TEST_BURN === 'true', verifier, domain } = {}) {
    if (token && (!isAddress(token) || /^0x0{40}$/i.test(token))) throw new Error('BSC_ACCESS_TOKEN must be a nonzero ERC-20 contract address.');
    if (!isAddress(testToken)) throw new Error('Invalid BSC_TEST_TOKEN address.');
    if (method && !['burn', 'transfer'].includes(method)) throw new Error('BSC_BURN_METHOD must be burn or transfer.');
    if (method === 'transfer' && !/^0x(?:0{40}|0{36}dead)$/i.test(burnAddress)) throw new Error('Transfer burns require the zero address or 0x000000000000000000000000000000000000dEaD.');
    this.now = now; this.challenges = new Map(); this.sessions = new Map(); this.limits = new Map(); this.domain = domain;
    this.token = token ? getAddress(token) : null; this.testToken = getAddress(testToken); this.mode = this.token ? 'live' : 'test';
    this.burnEnabled = Boolean((this.token || allowTestBurn) && method && (verifier || rpcUrl));
    this.verifier = verifier || (this.burnEnabled ? bscVerifier({ rpcUrl, token: this.token || this.testToken, method, burnAddress }) : null);
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (wallet TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS passes (wallet TEXT NOT NULL REFERENCES users(wallet), token TEXT NOT NULL, chain INTEGER NOT NULL, tx_hash TEXT NOT NULL UNIQUE, amount TEXT NOT NULL, mode TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(wallet, token, chain));`);
  }
  close() { this.db.close(); }
  hasPass(wallet) { return Boolean(this.token && this.db.prepare('SELECT 1 FROM passes WHERE wallet=? AND token=? AND chain=56 AND mode=\'live\'').get(wallet.toLowerCase(), this.token.toLowerCase())); }
  session(token) {
    if (typeof token !== 'string') return null;
    const key = hash(token), entry = this.sessions.get(key);
    if (!entry || entry.expiresAt <= this.now()) { this.sessions.delete(key); return null; }
    return { ...entry, hasPass: this.hasPass(entry.wallet) };
  }
  publicProfile(entry) {
    const row = this.db.prepare('SELECT username FROM users WHERE wallet=?').get(entry.wallet);
    const testPass = this.db.prepare('SELECT 1 FROM passes WHERE wallet=? AND token=? AND chain=56 AND mode=\'test\'').get(entry.wallet, this.testToken.toLowerCase());
    return { wallet: getAddress(entry.wallet), username: row?.username, hasPass: this.hasPass(entry.wallet), testPass: Boolean(testPass), permanent: true, expiresAt: entry.expiresAt };
  }
  configuration() {
    return { chainId: 56, chainName: 'BNB Smart Chain', mode: this.mode, token: this.token, testToken: this.testToken, requiredTokens: BURN_TOKENS, burnEnabled: this.burnEnabled, permanent: true, requirePass: Boolean(this.token), rewardPoolConfigured: false, achievementsConfigured: false };
  }
  challenge({ address, username }, origin) {
    for (const [id, item] of this.challenges) if (item.expiresAt <= this.now()) this.challenges.delete(id);
    if (!isAddress(address) || !userName(username)) throw fail(400, 'Use a wallet address and a 3–20 character username starting with a letter (letters, numbers and underscore).');
    if (this.challenges.size >= 200) throw fail(429, 'Too many pending wallet sign-ins. Try again shortly.');
    const wallet = address.toLowerCase(), existing = this.db.prepare('SELECT username FROM users WHERE wallet=?').get(wallet);
    const name = existing?.username || username;
    const taken = this.db.prepare('SELECT wallet FROM users WHERE username_key=?').get(name.toLowerCase());
    if (taken && taken.wallet !== wallet) throw fail(409, 'That username is already registered.');
    const id = randomUUID(), nonce = randomBytes(16).toString('hex'), expiresAt = this.now() + 300000;
    const parsed = new URL(origin); if (this.domain && parsed.host !== this.domain) throw fail(403, 'Incorrect wallet sign-in domain.');
    const message = `${parsed.host} wants you to sign in with your Ethereum account:\n${getAddress(wallet)}\n\nBIOHAZARD username: ${name}. Sign-in only; this signature does not transfer or burn tokens.\n\nURI: ${parsed.origin}\nVersion: 1\nChain ID: 56\nNonce: ${nonce}\nIssued At: ${new Date(this.now()).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}`;
    this.challenges.set(id, { wallet, username: name, message, expiresAt, origin }); return { id, message, expiresAt };
  }
  async verify({ id, signature }, origin) {
    const challenge = this.challenges.get(id); this.challenges.delete(id);
    if (!challenge || challenge.expiresAt <= this.now() || challenge.origin !== origin || typeof signature !== 'string') throw fail(401, 'Wallet sign-in challenge is invalid or expired.');
    let valid = false;
    try { valid = await verifyMessage({ address: challenge.wallet, message: challenge.message, signature }); } catch { /* Invalid signatures fail closed. */ }
    if (!valid) throw fail(401, 'The wallet signature could not be verified.');
    const existing = this.db.prepare('SELECT username FROM users WHERE wallet=?').get(challenge.wallet);
    if (!existing) {
      try { this.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(challenge.wallet, challenge.username, challenge.username.toLowerCase(), this.now()); }
      catch { throw fail(409, 'That username is already registered.'); }
    }
    for (const [key, entry] of this.sessions) if (entry.expiresAt <= this.now()) this.sessions.delete(key);
    const token = randomBytes(32).toString('hex'), entry = { wallet: challenge.wallet, username: existing?.username || challenge.username, expiresAt: this.now() + 3600000 };
    this.sessions.set(hash(token), entry); return { sessionToken: token, ...this.publicProfile(entry) };
  }
  async confirm(entry, transactionHash) {
    if (!this.burnEnabled || !this.verifier) throw fail(503, 'Burning is disabled until RPC and the contract burn method are configured.');
    if (typeof transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw fail(400, 'A valid transaction hash is required.');
    const proof = await this.verifier.receipt(transactionHash, entry.wallet);
    const configured = (this.token || this.testToken).toLowerCase();
    if (proof.address.toLowerCase() !== configured || BigInt(proof.burned) < BigInt(proof.amount) || proof.confirmations < 3) throw fail(422, 'Invalid burn proof.');
    try { this.db.prepare('INSERT INTO passes VALUES (?, ?, 56, ?, ?, ?, ?) ON CONFLICT(wallet,token,chain) DO NOTHING').run(entry.wallet, configured, transactionHash.toLowerCase(), proof.burned, this.mode, this.now()); }
    catch { throw fail(409, 'That burn receipt has already been used.'); }
    return this.publicProfile(entry);
  }
  async handle(request, response, origins) {
    if (!request.url?.startsWith('/api/wallet/')) return false;
    const origin = request.headers.origin;
    const reply = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
    if (!origin || !origins.includes(origin)) { reply(403, { error: 'Wallet requests require an allowed game origin.' }); return true; }
    response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return true; }
    const now = this.now(), key = request.socket.remoteAddress || 'unknown';
    for (const [ip, value] of this.limits) if (now - value.start > 60000) this.limits.delete(ip);
    const limit = this.limits.get(key) || { start: now, count: 0 }; limit.count++; this.limits.set(key, limit);
    if (limit.count > 80 || this.limits.size > 10000) { reply(429, { error: 'Wallet request limit reached. Try again shortly.' }); return true; }
    try {
      if (request.method === 'GET' && request.url === '/api/wallet/config') { reply(200, this.configuration()); return true; }
      const entry = this.session(request.headers.authorization?.replace(/^Bearer /, ''));
      if (request.method === 'GET' && request.url === '/api/wallet/me') {
        if (!entry) throw fail(401, 'Sign in with your wallet again.'); reply(200, this.publicProfile(entry)); return true;
      }
      if (request.method !== 'POST') throw fail(405, 'Unsupported wallet API method.');
      let text = '';
      for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 8192) throw fail(413, 'Wallet request is too large.'); }
      let body; try { body = JSON.parse(text); } catch { throw fail(400, 'Invalid JSON.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Invalid wallet request.');
      if (request.url === '/api/wallet/challenge') reply(200, this.challenge(body, origin));
      else if (request.url === '/api/wallet/verify') reply(200, await this.verify(body, origin));
      else if (request.url === '/api/wallet/logout') { if (entry) this.sessions.delete(hash(request.headers.authorization.slice(7))); reply(200, { ok: true }); }
      else if (request.url === '/api/wallet/burn/prepare') {
        if (!entry) throw fail(401, 'Sign in with your wallet first.');
        if (!this.burnEnabled) throw fail(503, 'Burning is disabled until RPC and the contract burn method are configured.');
        reply(200, { ...(await this.verifier.metadata()), tokens: BURN_TOKENS, chainId: 56, mode: this.mode, permanent: true });
      } else if (request.url === '/api/wallet/burn/confirm') {
        if (!entry) throw fail(401, 'Sign in with your wallet first.'); reply(200, await this.confirm(entry, body.transactionHash));
      } else throw fail(404, 'Unknown wallet route.');
    } catch (error) { reply(error.status || 503, { error: error.status ? error.message : 'Wallet verification is temporarily unavailable. Check the configured BSC RPC and retry.' }); }
    return true;
  }
}
