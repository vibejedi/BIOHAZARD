# Deploy USA West PvP on Contabo

The selected VPS is **66.94.123.201**, with 6 CPU cores, 12 GB RAM and 200 GB
storage. Confirm its USA West location in the Contabo control panel; an IP alone
does not establish the region. The initial server has up to eight concurrent
2–10 player rooms. Measure tick performance and latency before expanding it.

The browser game stays at `https://vibejedi.github.io/BIOHAZARD/`. The VPS runs
the authoritative match service and wallet-account API. Caddy provides HTTPS
and secure WebSockets. This guide does not imply that the VPS is already live.

## 1. Open the server terminal

From macOS Terminal, using the account supplied by Contabo:

```sh
ssh root@66.94.123.201
cat /etc/os-release
```

Use your actual SSH username if it differs. Check a first-connection host-key
fingerprint against the provider console if available. Enter your credentials
in your terminal. The Contabo web console is another option, including from a
phone. Do not paste passwords, SSH private keys or wallet seed phrases into chat.

Confirm the distribution before installing Docker. Use the official Docker
Engine instructions for [Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
or [Debian](https://docs.docker.com/engine/install/debian/), as applicable. Install
Git and the Docker Compose plugin too. Commands below assume a root terminal;
otherwise use an account allowed to run Docker.

```sh
git --version
docker version
docker compose version
```

## 2. Point a hostname at the VPS

Choose a hostname you control, for example `play.yourdomain.com`, and create:

| DNS type | Name | Value |
| --- | --- | --- |
| A | play | 66.94.123.201 |

Use **DNS only** initially if the provider offers proxying. Remove an AAAA
record for this hostname unless its IPv6 address reaches this VPS. Wait until
DNS resolves correctly before relying on automatic TLS issuance. A stable
hostname gives browsers a public trusted certificate for `wss://`; the IP
address alone is not the endpoint used by this configuration.

Allow inbound **TCP 80 and 443** in any Contabo/network firewall and the host
firewall. Retain the existing SSH rule and its actual port. Do not expose 8080
or Docker's control socket to the Internet. Do not reset or enable a firewall
blindly over SSH; inspect existing rules first. Caddy needs ports 80/443 free.

## 3. Install this service

For a new checkout:

```sh
git clone --branch main https://github.com/vibejedi/BIOHAZARD.git
cd BIOHAZARD
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Set `GAME_HOST` to the real DNS hostname, with no scheme or path. Keep
`ALLOWED_ORIGINS=https://vibejedi.github.io` for the GitHub Pages game. Leave the
production access token blank and `BSC_ALLOW_TEST_BURN=false` for the initial
guest PvP launch. Save the file, then run:

```sh
bash deploy/start.sh
```

The script fetches only the curated map collision file from the published
branch, builds the nonroot match server, verifies collision data, and starts
the match and Caddy containers. Original game installers are not needed. Host
Node/npm are not needed. The first build requires network access to GitHub,
Docker Hub and the npm registry. Ports 80/443 and the account volume are the
only public-ingress/persistent-data requirements in the Compose configuration.

## 4. Verify before sharing

Replace the example hostname in these commands:

```sh
curl --fail --show-error https://play.yourdomain.com/healthz
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail 100 game caddy
curl --fail --show-error -H 'Origin: https://vibejedi.github.io' https://play.yourdomain.com/api/wallet/config
```

The health response must report `status: "ok"`, `capacity: 10` and
`queueIntervalMs: 300000`. The wallet configuration should report chain 56,
`burnEnabled: false` and no required pass before launch. Health alone does not
test multiplayer: use **two separate browsers/devices**, enter
`wss://play.yourdomain.com/ws` in the PvP dialog and join the queue. At the next
five-minute boundary, both should enter the same Dust II deathmatch. A lone
player waits for another player rather than starting a one-player match.

In **Wallet & Rewards → Rewards server connection**, use
`https://play.yourdomain.com` to test signed username registration. This field
expects HTTPS; the PvP field expects WSS. The backend checks the exact game
origin. A request without `Origin` to the wallet API intentionally returns 403.

Once the actual hostname works, set browser build variables
`VITE_MULTIPLAYER_URL=wss://play.yourdomain.com/ws` and
`VITE_WALLET_API_URL=https://play.yourdomain.com`, then rebuild/publish the Pages
game. These are public URLs, not credentials. Existing per-device saved server
addresses take precedence; update them if they point at an old server.

## Updates, restarts and account backups

Run updates during a quiet window: restarting the match server disconnects
active rooms and clears the queue. From the checkout:

```sh
git pull --ff-only origin main
bash deploy/start.sh
```

The ignored `deploy/.env` and named `biohazard_accounts` volume are retained.
For a simple consistent account backup, briefly stop only the game service,
copy SQLite plus its journal files, then start it again:

```sh
mkdir -p backups
chmod 700 backups
docker compose --env-file deploy/.env -f deploy/compose.yml stop game
docker compose --env-file deploy/.env -f deploy/compose.yml cp game:/app/data "backups/accounts-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose --env-file deploy/.env -f deploy/compose.yml start game
```

Copy backups to private storage outside the VPS. The SQLite database stores
usernames and permanent access passes. Do not run `docker compose down -v`,
which deletes named volumes. Caddy certificate data also persists in its
named volumes. Check available disk space and Docker logs periodically.

Burns and real-money/token rewards stay disabled during the guest PvP launch.
See [wallet and reward deployment requirements](WALLETS_AND_REWARDS.md) before
changing token settings; no treasury keys belong in the frontend or Git.
