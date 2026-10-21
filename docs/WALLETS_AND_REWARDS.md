# BSC accounts, permanent access, and reward crates

The selected access rule is **burn 100,000 tokens once for permanent access**.
There is no continuing minimum balance. Selling or moving the remaining tokens
will not revoke a verified pass. A wallet signature signs in; a separate wallet
transaction is required for a burn.

## What is implemented

- BNB Smart Chain mainnet (chain 56), injected EVM wallets and EIP-6963 wallet
  discovery. Mobile users can open the game in MetaMask's browser.
- Required 3–20 character usernames, unique without regard to case, registered
  against a wallet after a verified single-use, expiring sign-in challenge.
- Short-lived server sessions. The browser keeps session credentials in memory;
  a reload requires another wallet sign-in. Names and passes persist in SQLite.
  Pending transaction hashes are retained per wallet/token so a delayed response
  does not invite a duplicate burn; receipt verification can be resumed.
- A burn review that shows the contract and exact 100,000-token amount, requires
  acknowledgement, simulates the transaction, then opens the wallet's transaction
  confirmation. The game never requests a seed phrase, private key, token
  allowance, or automatic transaction signature.
- Server receipt verification: BSC chain ID, successful transaction, sender,
  configured token, Transfer-to-burn-address events, amount, three confirmations,
  and replay prevention. A pasted transaction hash alone cannot grant access.
- Permanent pass checks on the production PvP queue, including server-assigned
  usernames and one active queue/match per wallet. The production browser can be
  configured to require the pass before entering any mode.

The project token has **not launched**. The owner's temporary integration token
is `0xe49b8c748660a318d7d075a7a056a620712c7777` on **BSC mainnet**. Its burn interface
has not been verified in the cloud environment: the available BSC RPC request
was denied by network policy. It is configured as a test address, not selected
as the production access token. Test burns are disabled by default.

A mainnet test burn spends real tokens and BNB gas. A verified test-token burn
is stored separately and never becomes a pass for the future project token.
No transaction was broadcast as part of development or automated tests.

## Development and deployment configuration

Use Node 24 for the wallet backend (`node:sqlite`). The Codespaces setup starts
both servers and supplies `VITE_WALLET_API_URL` automatically. In a manual local
setup, start `npm run server:start`, then use the wallet dialog's **Rewards server
connection** field to connect to that backend. See `.devcontainer/README.md`.

The VPS uses `deploy/compose.yml` and persistent volume `biohazard_accounts` at
`/app/data`. Back up that volume; it contains registered names and permanent
passes. Sessions/challenges expire on restart, so players sign in again.

| Variable | Purpose |
| --- | --- |
| `ACCOUNTS_DB` | SQLite path; default ignored `game-assets/accounts/accounts.sqlite`; container `/app/data/accounts.sqlite` |
| `BSC_RPC_URL` | A working BSC mainnet RPC endpoint; keep any API credentials server-side |
| `BSC_ACCESS_TOKEN` | Future production token contract; unset until launch |
| `BSC_TEST_TOKEN` | Temporary test contract, defaulting to the owner's address above |
| `BSC_BURN_METHOD` | `burn` for a verified public `burn(uint256)` interface, or `transfer` |
| `BSC_BURN_ADDRESS` | With `transfer`, only the zero address or `0x000000000000000000000000000000000000dEaD` is accepted |
| `BSC_ALLOW_TEST_BURN` | Explicitly `true` to enable temporary mainnet test burns; default `false` |
| `VITE_WALLET_API_URL` | Public HTTPS wallet/match backend URL, set when building the browser |
| `VITE_REQUIRE_BURN_PASS` | Set `true` for a production token-gated browser build, including while the backend is unavailable |

Before enabling a burn, verify the token contract and supported method, configure
a working BSC RPC, and test the unsigned transaction simulation. The game obtains
ERC-20 decimals and symbol from the configured contract. No arbitrary non-burn
recipient is accepted. BSC testnet (97) is not accepted by this mainnet verifier.

A typical project-token launch sets the production token/RPC/burn method on the
backend, deploys it, and rebuilds the client with its HTTPS URL and
`VITE_REQUIRE_BURN_PASS=true`. The current unconfigured release remains practice
play without funded rewards. Wallet connection without a reachable backend
shows the username as pending verification, rather than claiming registration.

The base browser/standalone files are public and local game logic can be
modified. Frontend gating is an interface rule, not server authority over
campaign or survival. Protected multiplayer admission is checked on the server.

## Live RNG rewards: pending the owner's assets and rules

The owner selected live funded rewards and will supply the achievement targets
for survival, campaign and deathmatch, the BSC prize contracts, amounts, odds and
funding. This release does not issue crypto crates, roll a funded prize, hold
reward-wallet keys, pay tokens, or label local scores as verified achievements.
The in-game rewards panel reports that these features are awaiting configuration.

For live reward crates, award eligibility must come from verified game outcomes,
then be issued once per eligible achievement. Each opening must produce one
persistent, auditable result using secure randomness, published odds and the
funded allowlist. Settlement needs an idempotent on-chain claim/payout and treasury
accounting. Provably fair on-chain rewards should use a supported verifiable
randomness mechanism rather than browser randomness. Campaign and survival need
authoritative simulation or independently validated replay evidence before they
can award funded crates; their current local leaderboard is not suitable.

The access burn grants a pass, not a random reward or a guaranteed return. Reward
crates are a separate earned-achievement feature awaiting those rules.

## Validation

`npm test` covers signature recovery/replay/expiry, username uniqueness, session
expiry, persistent passes, test-vs-live separation, rejected false burn claims,
real JSON-RPC decoding of mocked receipts, failed transactions, wrong chains,
wrong contracts/senders, underpayment/confirmation checks, origin restrictions,
and protected PvP admission. Browser tests use a mock EVM provider and fake
transaction receipt to verify the complete review/confirmation/account flow;
they do not connect to or spend from a real wallet. Actual BSC contract behavior
and public VPS operation still need validation after configuration.
