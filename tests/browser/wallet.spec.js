import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { hexToString, decodeFunctionData } from 'viem';
import { WalletAccounts } from '../../server/wallets.js';
import { createMatchServer } from '../../server/index.js';

const token = '0x1000000000000000000000000000000000000001', transactionHash = '0x' + 'cd'.repeat(32);
const account = privateKeyToAccount('0x' + randomBytes(32).toString('hex'));
let app, api, proofs = 0;
test.beforeAll(async () => {
  const wallets = new WalletAccounts({ dbPath: ':memory:', token, method: 'burn', verifier: {
    metadata: async () => ({ address: token, symbol: 'BHTEST', decimals: 18, amount: '100000000000000000000000', method: 'burn', destination: '0x0000000000000000000000000000000000000000' }),
    receipt: async (hash, wallet) => { expect(hash).toBe(transactionHash); expect(wallet).toBe(account.address.toLowerCase()); proofs++; return { address: token, amount: '100000000000000000000000', burned: '100000000000000000000000', confirmations: 3 }; },
  } });
  app = createMatchServer({ data: JSON.parse(readFileSync(new URL('../../game-assets/ready/dust2.json', import.meta.url))), manual: true, origins: ['http://127.0.0.1:5173'], wallets });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); api = `http://127.0.0.1:${app.server.address().port}`;
});
test.afterAll(async () => { await app.close(); });

test('BSC wallet sign-in requires a username, does not send funds, and a separately confirmed burn creates a verified permanent pass', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('signWalletTestMessage', value => account.signMessage({ message: hexToString(value) }));
  await page.addInitScript(({ accountAddress, transactionHash }) => {
    localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false');
    let chain = '0x61'; const events = {}; window.walletTestCalls = []; window.walletTestEvents = events;
    window.ethereum = { isMetaMask: true, on: (name, handler) => { events[name] = handler; }, request: async request => {
      window.walletTestCalls.push(request);
      if (['eth_requestAccounts', 'eth_accounts'].includes(request.method)) return [accountAddress];
      if (request.method === 'eth_chainId') return chain;
      if (request.method === 'wallet_switchEthereumChain') { chain = request.params[0].chainId; return null; }
      if (request.method === 'personal_sign') return window.signWalletTestMessage(request.params[0]);
      if (request.method === 'eth_call') return '0x';
      if (request.method === 'eth_sendTransaction') return transactionHash;
      throw Error(request.method);
    } };
  }, { accountAddress: account.address, transactionHash });
  await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.getByRole('button', { name: 'Wallet and rewards' }).click();
  await page.locator('#wallet-connect').click(); await expect(page.locator('#wallet-status')).toContainText('Choose a username');
  expect(await page.evaluate(() => window.walletTestCalls.length)).toBe(0);
  await page.locator('.wallet-server summary').click();
  await page.locator('#wallet-api').fill(api); await page.locator('#wallet-server-save').click();
  await expect(page.locator('#wallet-status')).toContainText('Server connected');
  await page.locator('#wallet-username').fill('BurnTester'); await page.locator('#wallet-connect').click();
  await expect(page.locator('#wallet-status')).toContainText('signature verified');
  expect(await page.evaluate(() => window.walletTestCalls.some(call => call.method === 'eth_sendTransaction'))).toBe(false);
  expect(await page.evaluate(() => window.walletTestCalls.find(call => call.method === 'wallet_switchEthereumChain').params[0].chainId)).toBe('0x38');
  await page.locator('#wallet-prepare').click(); await expect(page.locator('#wallet-burn-details')).toContainText('100,000 BHTEST');
  await expect(page.locator('#wallet-burn')).toBeDisabled();
  await page.locator('#wallet-consent').check(); await page.locator('#wallet-burn').click();
  await expect(page.locator('#wallet-status')).toContainText('Permanent project-token access verified'); expect(proofs).toBe(1);
  const sent = await page.evaluate(() => window.walletTestCalls.find(call => call.method === 'eth_sendTransaction').params[0]);
  expect(sent.to).toBe(token); expect(sent.value).toBe('0x0');
  const decoded = decodeFunctionData({ abi: [{ type: 'function', name: 'burn', inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }], data: sent.data });
  expect(decoded.args[0]).toBe(100000n * 10n ** 18n);
  await expect(page.locator('#wallet-access-status')).toContainText('Selling or moving remaining tokens does not revoke');
  await page.screenshot({ path: 'test-results/wallet-permanent-pass.png' });
  await page.getByRole('button', { name: 'Close wallet', exact: true }).click(); await page.locator('#mode-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.walletTestEvents.accountsChanged([]));
  await expect(page.locator('#menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('wallet dialog is usable on a phone and explains pending reward funding without a fake payout', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage();
  try {
    await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
    await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
    await page.getByRole('button', { name: 'Wallet and rewards' }).tap();
    await expect(page.locator('#wallet-dialog')).toBeVisible(); await expect(page.locator('.wallet-rewards')).toContainText('No live crypto crates or payouts');
    await expect(page.locator('#wallet-mobile')).toHaveAttribute('href', /metamask\.app\.link\/dapp\//);
    await expect(page.locator('#wallet-prepare')).toBeDisabled();
    const bounds = await page.locator('#wallet-dialog').boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  } finally { await context.close(); }
});
