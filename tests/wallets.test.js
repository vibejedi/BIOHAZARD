import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, encodeEventTopics, erc20Abi, zeroAddress } from 'viem';
import { WebSocket } from 'ws';
import { WalletAccounts, bscVerifier, TEST_TOKEN } from '../server/wallets.js';
import { createMatchServer } from '../server/index.js';

const origin = 'https://game.test', token = '0x1000000000000000000000000000000000000001', tx = '0x' + 'ab'.repeat(32);
const account = () => privateKeyToAccount('0x' + randomBytes(32).toString('hex'));
async function login(store, wallet, username = 'Operator') {
  const challenge = store.challenge({ address: wallet.address, username }, origin);
  return store.verify({ id: challenge.id, signature: await wallet.signMessage({ message: challenge.message }) }, origin);
}
const proof = wallet => ({ address: token, amount: '100000000000000000000000', burned: '100000000000000000000000', confirmations: 3, wallet });

test('wallet authentication requires a real signature, unique usernames and a single-use expiring challenge', async () => {
  let now = Date.now(); const store = new WalletAccounts({ dbPath: ':memory:', now: () => now });
  try {
    const first = account(), other = account();
    for (const username of ['', 'a', '1Operator', '<script>', 'a'.repeat(21)]) assert.throws(() => store.challenge({ address: first.address, username }, origin));
    const challenge = store.challenge({ address: first.address, username: 'Operator' }, origin);
    await assert.rejects(store.verify({ id: challenge.id, signature: await other.signMessage({ message: challenge.message }) }, origin), /signature/);
    const fresh = store.challenge({ address: first.address, username: 'Operator' }, origin), signature = await first.signMessage({ message: fresh.message });
    const profile = await store.verify({ id: fresh.id, signature }, origin);
    assert.equal(profile.username, 'Operator'); assert.equal(profile.hasPass, false); assert.equal(store.session(profile.sessionToken).wallet, first.address.toLowerCase());
    await assert.rejects(store.verify({ id: fresh.id, signature }, origin), /invalid or expired/);
    assert.throws(() => store.challenge({ address: other.address, username: 'oPERATOR' }, origin), /already registered/);
    const expired = store.challenge({ address: other.address, username: 'Other' }, origin); now += 300001;
    await assert.rejects(store.verify({ id: expired.id, signature: await other.signMessage({ message: expired.message }) }, origin), /expired/);
    now += 3600000; assert.equal(store.session(profile.sessionToken), null);
  } finally { store.close(); }
});

test('burn passes persist, cannot be forged from a claimed amount, and test tokens never grant the project pass', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'biohazard-wallet-')), dbPath = join(directory, 'accounts.sqlite'), wallet = account();
  let store = new WalletAccounts({ dbPath, token, method: 'burn', verifier: { metadata: async () => proof(wallet.address), receipt: async (_tx, address) => { assert.equal(address, wallet.address.toLowerCase()); return proof(address); } } });
  try {
    const profile = await login(store, wallet), session = store.session(profile.sessionToken);
    assert.equal((await store.confirm(session, tx)).hasPass, true); assert.equal(store.hasPass(wallet.address), true);
    store.close(); store = new WalletAccounts({ dbPath, token }); assert.equal(store.hasPass(wallet.address), true);
    const again = await login(store, wallet, 'NewName'); assert.equal(again.username, 'Operator'); assert.equal(again.hasPass, true);
    await assert.rejects(store.confirm(store.session(again.sessionToken), tx), /disabled/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  const testStore = new WalletAccounts({ dbPath: ':memory:', method: 'burn', allowTestBurn: true, verifier: { receipt: async () => ({ ...proof(wallet.address), address: TEST_TOKEN }) } });
  try { const profile = await login(testStore, wallet); const result = await testStore.confirm(testStore.session(profile.sessionToken), tx); assert.equal(result.testPass, true); assert.equal(result.hasPass, false); }
  finally { testStore.close(); }
  const invalid = new WalletAccounts({ dbPath: ':memory:', token, method: 'burn', verifier: { receipt: async () => ({ ...proof(wallet.address), burned: '1' }) } });
  try { const profile = await login(invalid, wallet); await assert.rejects(invalid.confirm(invalid.session(profile.sessionToken), tx), /Invalid burn proof/); assert.equal(invalid.hasPass(wallet.address), false); } finally { invalid.close(); }
});

test('the BSC receipt verifier checks chain, contract, sender, amount, status and confirmations through actual JSON-RPC', async () => {
  const wallet = account(), blockHash = '0x' + '11'.repeat(32); let confirmations = 3, chain = 56, amount = 100000n * 10n ** 18n, sender = wallet.address, status = '0x1', contract = token;
  const rpc = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk; const call = JSON.parse(body); let result;
    if (call.method === 'eth_chainId') result = '0x' + chain.toString(16);
    else if (call.method === 'eth_getCode') result = '0x60006000';
    else if (call.method === 'eth_call') result = call.params[0].data.startsWith('0x313ce567') ? encodeAbiParameters([{ type: 'uint8' }], [18]) : encodeAbiParameters([{ type: 'string' }], ['BHTEST']);
    else if (call.method === 'eth_blockNumber') result = '0x' + (100 + confirmations - 1).toString(16);
    else if (call.method === 'eth_getTransactionByHash') result = { hash: tx, from: sender, to: token, blockNumber: '0x64', blockHash, nonce: '0x0', gas: '0x5208', gasPrice: '0x1', input: '0x', value: '0x0', transactionIndex: '0x0', type: '0x0', v: '0x25', r: '0x1', s: '0x1' };
    else if (call.method === 'eth_getTransactionReceipt') result = { transactionHash: tx, transactionIndex: '0x0', blockNumber: '0x64', blockHash, from: sender, to: token, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', status, type: '0x0', logsBloom: '0x' + '00'.repeat(256), contractAddress: null, logs: [{ address: contract, blockHash, blockNumber: '0x64', data: encodeAbiParameters([{ type: 'uint256' }], [amount]), topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: wallet.address, to: zeroAddress } }), logIndex: '0x0', transactionIndex: '0x0', transactionHash: tx, removed: false }] };
    else throw Error(call.method);
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
  });
  await new Promise(resolve => rpc.listen(0, '127.0.0.1', resolve));
  try {
    const verifier = bscVerifier({ rpcUrl: `http://127.0.0.1:${rpc.address().port}`, token, method: 'burn' });
    assert.equal((await verifier.receipt(tx, wallet.address.toLowerCase())).burned, amount.toString());
    confirmations = 2; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /three chain confirmations/); confirmations = 3;
    amount = 1n; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /does not prove/); amount = 100000n * 10n ** 18n;
    contract = TEST_TOKEN; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /does not prove/); contract = token;
    sender = account().address; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /from your connected wallet/); sender = wallet.address;
    status = '0x0'; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /successful/); status = '0x1';
    chain = 97; await assert.rejects(verifier.receipt(tx, wallet.address.toLowerCase()), /mainnet/);
  } finally { await new Promise(resolve => rpc.close(resolve)); }
});

test('wallet HTTP API checks origin and a funded-mode PvP queue requires a verified permanent pass', async () => {
  const wallet = account(), store = new WalletAccounts({ dbPath: ':memory:', token, method: 'burn', verifier: { receipt: async () => proof(wallet.address) } });
  const data = JSON.parse(readFileSync(new URL('../game-assets/ready/dust2.json', import.meta.url)));
  const app = createMatchServer({ data, manual: true, origins: [origin], wallets: store });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const address = `http://127.0.0.1:${app.server.address().port}`; let socket;
  try {
    assert.equal((await fetch(address + '/api/wallet/config', { headers: { Origin: 'https://wrong.test' } })).status, 403);
    const config = await (await fetch(address + '/api/wallet/config', { headers: { Origin: origin } })).json(); assert.equal(config.requirePass, true);
    const profile = await login(store, wallet), messages = [];
    socket = new WebSocket(address.replace('http:', 'ws:') + '/ws', { origin }); socket.on('message', b => messages.push(JSON.parse(b)));
    await new Promise(resolve => socket.once('open', resolve)); socket.send(JSON.stringify({ type: 'join', name: 'ForgedName', authToken: profile.sessionToken }));
    await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(app.manager.queue.length, 0); assert.match(messages.at(-1).message, /pass are required/);
    await store.confirm(store.session(profile.sessionToken), tx);
    socket.send(JSON.stringify({ type: 'join', name: 'ForgedName', authToken: profile.sessionToken }));
    await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(app.manager.queue.length, 1); assert.equal(app.manager.queue[0].name, 'Operator');
  } finally { socket?.terminate(); await app.close(); }
});
