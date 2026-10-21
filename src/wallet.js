import { encodeFunctionData, parseUnits, isAddress, getAddress, erc20Abi, zeroAddress, stringToHex } from 'viem';

const $ = id => document.getElementById(id);
const burnAbi = [{ type: 'function', name: 'burn', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] }];
const short = address => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'CONNECT WALLET';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export class WalletUI {
  constructor(game) {
    this.game = game; this.providers = new Map(); this.address = null; this.profile = null; this.token = null; this.config = null; this.prepared = null; this.pendingHash = null; this.busy = false;
    document.querySelector('.header-status').innerHTML = '<button class="wallet-open wallet-button" type="button">CONNECT WALLET</button>';
    const footer = document.createElement('button'); footer.className = 'wallet-open icon-button'; footer.type = 'button'; footer.setAttribute('aria-label', 'Wallet and rewards'); footer.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 5h17v15H3V5Zm0 0 14-3v3m-1 5h6v6h-6v-6Z"/></svg>';
    document.querySelector('.site-footer > div').prepend(footer);
    document.querySelector('#app').insertAdjacentHTML('beforeend', `<dialog id="wallet-dialog" class="wallet-dialog"><button class="close-dialog icon-button" aria-label="Close wallet" type="button">×</button><span class="eyebrow">BNB SMART CHAIN / PLAYER ACCOUNT</span><h2>WALLET &amp; REWARDS<span>.</span></h2><p>Choose a username and connect your BSC wallet. Sign-in is free. A separate, confirmed burn of 100,000 project tokens will grant permanent access once the project token is configured.</p><label for="wallet-username">USERNAME</label><input id="wallet-username" maxlength="20" autocomplete="nickname" placeholder="Your callsign" required/><label for="wallet-provider">WALLET</label><select id="wallet-provider" aria-label="Wallet provider"></select><button id="wallet-connect" class="deploy" type="button">CONNECT &amp; SIGN IN</button><a id="wallet-mobile" class="wallet-mobile" target="_blank" rel="noopener noreferrer">OPEN IN METAMASK MOBILE BROWSER</a><p id="wallet-status" role="status">Wallet not connected.</p><div id="wallet-profile" class="wallet-profile" hidden></div><details class="wallet-server"><summary>Rewards server connection</summary><label for="wallet-api">SERVER URL</label><input id="wallet-api" type="url" placeholder="https://your-server.example"/><button id="wallet-server-save" class="secondary-button" type="button">CONNECT REWARDS SERVER</button><p>The project server verifies usernames and burn receipts. This address is separate from your wallet RPC.</p></details><section class="wallet-access"><h3>PERMANENT ACCESS PASS</h3><p id="wallet-access-status">Project token not launched. Practice gameplay remains available; funded rewards are not enabled.</p><p id="wallet-token-address"></p><button id="wallet-prepare" class="secondary-button" type="button" disabled>REVIEW 100,000-TOKEN BURN</button><div id="wallet-burn-review" hidden><p id="wallet-burn-details"></p><label class="wallet-consent"><input id="wallet-consent" type="checkbox"/> I understand this permanently destroys 100,000 tokens and spends BNB gas. It grants access, not a paid reward crate.</label><button id="wallet-burn" class="deploy" type="button" disabled>CONFIRM BURN IN MY WALLET</button></div><details><summary>Already burned? Verify your receipt</summary><input id="wallet-tx" placeholder="0x… transaction hash" aria-label="Burn transaction hash"/><button id="wallet-verify" class="secondary-button" type="button">VERIFY BURN RECEIPT</button></details></section><section class="wallet-rewards"><h3>REWARD CRATES</h3><p>Achievement targets, prize assets, odds and funding are awaiting configuration. No live crypto crates or payouts are enabled. Campaign practice scores are stored on this device and cannot prove reward eligibility.</p></section><button id="wallet-disconnect" class="text-button" type="button" hidden>DISCONNECT ACCOUNT</button></dialog>`);
    try { $('wallet-username').value = localStorage.getItem('bh-wallet-username') || ''; $('wallet-api').value = localStorage.getItem('bh-wallet-api') || import.meta.env.VITE_WALLET_API_URL || ''; } catch { /* Optional preferences. */ }
    this.api = this.validApi($('wallet-api').value, false);
    $('wallet-mobile').href = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
    for (const button of document.querySelectorAll('.wallet-open')) button.addEventListener('click', () => this.open());
    $('wallet-dialog').querySelector('.close-dialog').addEventListener('click', () => $('wallet-dialog').close());
    $('wallet-connect').addEventListener('click', () => this.run(() => this.connect()));
    $('wallet-disconnect').addEventListener('click', () => this.disconnect());
    $('wallet-server-save').addEventListener('click', () => this.run(async () => { this.api = this.validApi($('wallet-api').value); this.token = null; this.profile = null; try { localStorage.setItem('bh-wallet-api', this.api); } catch { /* Optional preferences. */ } await this.loadConfig(); this.status('Server connected. Sign in to verify your username.'); }));
    $('wallet-prepare').addEventListener('click', () => this.run(() => this.prepareBurn()));
    $('wallet-consent').addEventListener('change', () => { $('wallet-burn').disabled = !this.prepared || !$('wallet-consent').checked || this.busy; });
    $('wallet-burn').addEventListener('click', () => this.run(() => this.burn()));
    $('wallet-verify').addEventListener('click', () => this.run(() => this.confirmReceipt($('wallet-tx').value.trim(), false)));
    window.addEventListener('eip6963:announceProvider', event => {
      const detail = event.detail;
      if (!detail?.provider?.request || typeof detail.info?.uuid !== 'string') return;
      this.providers.set(detail.info.uuid, { provider: detail.provider, name: String(detail.info.name).slice(0, 40) }); this.renderProviders();
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (window.ethereum?.request) { this.providers.set('injected', { provider: window.ethereum, name: window.ethereum.isMetaMask ? 'MetaMask / browser wallet' : 'Browser EVM wallet' }); }
    this.renderProviders(); this.render();
    if (this.api) this.loadConfig().catch(() => this.status('Rewards server unavailable. Wallet funds are unchanged.'));
  }
  validApi(value, required = true) {
    if (!value && !required) return '';
    try { const url = new URL(value); if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error(); return url.origin; }
    catch { if (!required) return ''; throw new Error('Use an HTTPS rewards-server URL, or a local development HTTP address.'); }
  }
  renderProviders() {
    const previous = $('wallet-provider').value; $('wallet-provider').replaceChildren();
    if (!this.providers.size) { const option = document.createElement('option'); option.textContent = 'Open in an EVM wallet browser or install a wallet'; $('wallet-provider').appendChild(option); }
    for (const [id, entry] of this.providers) { const option = document.createElement('option'); option.value = id; option.textContent = entry.name; $('wallet-provider').appendChild(option); }
    if (this.providers.has(previous)) $('wallet-provider').value = previous;
  }
  open() { if (this.game.state === 'playing') this.game.pause(); $('wallet-dialog').showModal(); }
  status(message) { $('wallet-status').textContent = message; }
  async run(action) {
    if (this.busy) return; this.busy = true; this.render();
    try { await action(); } catch (error) { this.status(this.pendingHash ? `Transaction ${short(this.pendingHash)} was already submitted. Verify its receipt before burning again. ${error.message || ''}` : error.code === 4001 ? 'Wallet request declined. No access was granted.' : error.message || 'Wallet request failed.'); }
    finally { this.busy = false; this.render(); }
  }
  async request(path, body) {
    if (!this.api) throw new Error('Connect the rewards server to verify your username and burn receipt.');
    const response = await fetch(`${this.api}/api/wallet/${path}`, { credentials: 'include', method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) { this.token = null; this.profile = null; } throw Object.assign(new Error(data.error || 'Rewards request failed.'), { status: response.status }); }
    return data;
  }
  async loadConfig() { this.config = await this.request('config'); if (this.config.chainId !== 56) throw new Error('This game requires BNB Smart Chain (56).'); this.render(); }
  async chain() {
    const id = await this.provider.request({ method: 'eth_chainId' });
    if (Number(id) === 56) return;
    try { await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] }); }
    catch (error) {
      if (error.code !== 4902) throw error;
      await this.provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.bnbchain.org'], blockExplorerUrls: ['https://bscscan.com'] }] });
      await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
    }
    if (Number(await this.provider.request({ method: 'eth_chainId' })) !== 56) throw new Error('Switch your wallet to BNB Smart Chain.');
  }
  async connect() {
    const username = $('wallet-username').value.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(username)) throw new Error('Choose a username: 3–20 characters, starting with a letter; use letters, numbers or underscore.');
    const provider = this.providers.get($('wallet-provider').value)?.provider;
    if (!provider) throw new Error('Use your wallet’s mobile browser, or enable an EVM wallet extension on desktop.');
    this.provider = provider;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!isAddress(accounts?.[0])) throw new Error('The wallet did not return a valid account.');
    this.address = getAddress(accounts[0]); await this.chain();
    if (!this.observed?.has(provider)) {
      this.observed ||= new WeakSet(); this.observed.add(provider);
      provider.on?.('accountsChanged', accounts => { if (this.provider !== provider || accounts[0]?.toLowerCase() === this.address?.toLowerCase()) return; this.disconnect(); this.status('Wallet account changed. Connect and sign in with the account you want to use.'); });
      provider.on?.('chainChanged', id => { if (this.provider === provider && Number(id) !== 56) { this.disconnect(); this.status('Network changed. Switch back to BNB Smart Chain and sign in again.'); } });
    }
    try { localStorage.setItem('bh-wallet-username', username); } catch { /* Optional preferences. */ }
    if (!this.api) { this.status('Wallet connected. Your username is pending server verification; connect the rewards server to finish signing in.'); return; }
    await this.loadConfig();
    const challenge = await this.request('challenge', { address: this.address, username });
    const signature = await provider.request({ method: 'personal_sign', params: [stringToHex(challenge.message), this.address] });
    const profile = await this.request('verify', { id: challenge.id, signature });
    if (profile.wallet.toLowerCase() !== this.address.toLowerCase()) throw new Error('The verified account did not match your wallet.');
    this.token = profile.sessionToken; this.profile = profile; $('wallet-username').value = profile.username;
    try {
      localStorage.setItem('bh-wallet-username', profile.username);
      this.pendingHash = localStorage.getItem(this.pendingKey());
      if (this.pendingHash) $('wallet-tx').value = this.pendingHash;
    } catch { /* Optional receipt recovery. */ }
    this.status('Wallet signature verified. Username registered. Signing in did not transfer or burn any tokens.');
    $('mp-name').value = profile.username;
  }
  disconnect() {
    if (this.token) this.request('logout', {}).catch(() => {});
    if (this.game.networkSession || (this.config?.requirePass && this.game.state !== 'home')) this.game.home();
    this.pendingHash = null; this.token = null; this.profile = null; this.address = null; this.prepared = null;
    $('wallet-burn-review').hidden = true; $('wallet-consent').checked = false;
    this.status('Account disconnected. Reconnect your wallet to sign in again.'); this.render();
  }
  pendingKey() { return `bh-pending-burn-${this.address?.toLowerCase()}-${(this.config?.token || this.config?.testToken)?.toLowerCase()}`; }
  async prepareBurn() {
    if (this.pendingHash) throw new Error('Verify the previously submitted receipt before attempting another burn.');
    if (!this.profile || !this.token) throw new Error('Connect and verify your username first.');
    await this.chain(); const prepared = await this.request('burn/prepare', {});
    const expected = this.config.token || this.config.testToken;
    if (prepared.chainId !== 56 || prepared.tokens !== '100000' || prepared.address.toLowerCase() !== expected.toLowerCase() || !Number.isInteger(prepared.decimals) || prepared.decimals < 0 || prepared.decimals > 24 || prepared.amount !== parseUnits('100000', prepared.decimals).toString() || !['burn', 'transfer'].includes(prepared.method)) throw new Error('Unexpected burn instructions. Stop and check the server configuration.');
    if (prepared.method === 'transfer' && !/^0x(?:0{40}|0{36}dead)$/i.test(prepared.destination)) throw new Error('The destination is not a configured burn address.');
    if (prepared.method === 'burn' && prepared.destination !== zeroAddress) throw new Error('Invalid burn destination.');
    this.prepared = prepared; $('wallet-consent').checked = false; $('wallet-burn-review').hidden = false;
    $('wallet-burn-details').textContent = `${prepared.mode === 'test' ? 'TEMPORARY MAINNET TEST TOKEN — ' : ''}Burn exactly 100,000 ${prepared.symbol}. Contract: ${prepared.address}. This is irreversible and costs BNB gas. ${prepared.mode === 'test' ? 'A test burn does not grant access under the future project token.' : 'The access pass is permanent; remaining wallet balance is not monitored.'}`;
    this.status('Review the token address and amount. The wallet will ask for a separate transaction confirmation.');
  }
  async burn() {
    const prepared = this.prepared;
    if (!prepared || !$('wallet-consent').checked || !this.profile || !this.token) throw new Error('Review and acknowledge the irreversible burn first.');
    await this.chain(); const accounts = await this.provider.request({ method: 'eth_accounts' });
    if (accounts[0]?.toLowerCase() !== this.profile.wallet.toLowerCase()) throw new Error('The connected wallet changed. Sign in again.');
    const data = prepared.method === 'burn' ? encodeFunctionData({ abi: burnAbi, functionName: 'burn', args: [BigInt(prepared.amount)] }) : encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [prepared.destination, BigInt(prepared.amount)] });
    const transaction = { from: this.profile.wallet, to: prepared.address, data, value: '0x0' };
    const simulated = await this.provider.request({ method: 'eth_call', params: [transaction, 'latest'] });
    if (prepared.method === 'transfer' && simulated !== '0x' && BigInt(simulated) === 0n) throw new Error('The token refused the simulated burn transfer.');
    const transactionHash = await this.provider.request({ method: 'eth_sendTransaction', params: [transaction] });
    this.pendingHash = transactionHash;
    try { localStorage.setItem(this.pendingKey(), transactionHash); } catch { /* The receipt remains visible for recovery. */ }
    $('wallet-tx').value = transactionHash; this.prepared = null; $('wallet-burn-review').hidden = true;
    this.status('Transaction submitted. Waiting for server verification and three chain confirmations.');
    await this.confirmReceipt(transactionHash, true);
  }
  async confirmReceipt(transactionHash, wait) {
    if (!this.profile || !this.token) throw new Error('Sign in to verify the receipt for your wallet.');
    if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error('Paste a valid burn transaction hash.');
    const account = this.address;
    for (let attempt = 0; attempt < (wait ? 40 : 1); attempt++) {
      if (this.address !== account) return;
      try { this.profile = { ...this.profile, ...(await this.request('burn/confirm', { transactionHash })) }; this.pendingHash = null; try { localStorage.removeItem(this.pendingKey()); } catch { /* Optional receipt recovery. */ } this.status(this.profile.hasPass ? 'Permanent project-token access verified.' : 'Mainnet test burn verified. This test pass is separate from future project-token access.'); return; }
      catch (error) { if (!wait || error.status !== 409) throw error; await delay(3000); }
    }
    this.status('Confirmation is still pending. Use “Verify burn receipt” with the saved hash; do not burn again.');
  }
  canPlay() {
    const required = this.config?.requirePass || import.meta.env.VITE_REQUIRE_BURN_PASS === 'true';
    if (!required || (this.token && this.profile?.hasPass && this.profile.expiresAt > Date.now())) return true;
    this.open(); this.status('A verified username, wallet and permanent project-token burn pass are required.'); return false;
  }
  render() {
    for (const button of document.querySelectorAll('.wallet-button')) button.textContent = this.profile?.username || short(this.address);
    $('wallet-profile').hidden = !this.address; $('wallet-profile').textContent = this.address ? `${this.profile?.username || 'Username pending verification'} · ${this.address}` : '';
    $('wallet-disconnect').hidden = !this.address; $('wallet-connect').disabled = this.busy;
    $('wallet-prepare').disabled = this.busy || Boolean(this.pendingHash) || !this.token || !this.config?.burnEnabled || Boolean(this.profile?.hasPass || (this.config?.mode === 'test' && this.profile?.testPass));
    $('wallet-verify').disabled = this.busy || !this.token; $('wallet-burn').disabled = this.busy || !this.prepared || !$('wallet-consent').checked;
    $('wallet-token-address').textContent = this.config ? `${this.config.token ? 'PROJECT TOKEN' : 'TEMPORARY MAINNET TEST TOKEN'}: ${this.config.token || this.config.testToken}` : '';
    $('wallet-access-status').textContent = this.profile?.hasPass ? 'Permanent access granted. Selling or moving remaining tokens does not revoke this pass.' : this.profile?.testPass ? 'Test burn verified. The project token is not configured, so this does not grant a future project-token pass.' : this.config?.requirePass ? 'A confirmed one-time burn of 100,000 project tokens grants permanent access.' : 'Project token not launched. Practice gameplay remains available; funded rewards are not enabled.';
  }
}
