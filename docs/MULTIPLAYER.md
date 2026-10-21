# USA West free-for-all server

The main mode is PvP deathmatch; the five-map solo campaign is secondary. Queue batches start at five-minute Unix-time
boundaries. Each instance has 2–10 players and lasts five minutes. More than ten
queued players are split into separate rooms; a lone remainder waits for the
next batch. Current instances accept no late joins. Up to eight rooms can run
in this initial server process.

The Node server owns movement, BSP collision, jumping, ammunition, reloads,
weapon unlocks/purchases, hits, health, respawns, frags, and match results. Clients
send inputs and aim; submitted positions, scores, targets, damage, and room IDs
do not control the simulation. Bullets use the original map point hull and
server-side player head/body boxes. Results stay within the assigned instance.

Start with USP + $600. SMGs unlock after one minute, rifles after two, heavy
weapons after four. The original supply crate is the purchase location. Kills
award $300 ($450 for a headshot). After a three-second respawn, paid weapons are
lost and the player gets the starter USP/ammo while retaining field cash. This
respawn rule is separate from campaign ammunition, which never refills between
waves or chapters. Deathmatch ranks frags first, then fewer deaths, then
headshots. Closing the browser or leaving the match removes that player; it
does not pause the match.

## Run locally

```sh
npm ci --cache /tmp/biohazard-npm-cache
npm run server:prepare
npm run server:start
```

The default bind address is `127.0.0.1:8080`. The WebSocket route is `/ws`, and
`GET /healthz` reports readiness and queue settings. In development the client
can use `ws://127.0.0.1:8080/ws`. The public HTTPS client requires `wss://`.
The service and client are separate processes; GitHub Pages cannot run Node.

## Deploy the prepared server on the VPS

Use a USA West Linux VPS with Docker Engine/Compose, a DNS hostname pointing at
it, and inbound TCP ports 80 and 443. A 2-vCPU / 2-GB machine is a reasonable
starting point; measure real tick time and bandwidth before increasing capacity.

```sh
git clone https://github.com/vibejedi/BIOHAZARD.git
cd BIOHAZARD
# Docker Engine with the Compose plugin must already be installed.
cp deploy/.env.example deploy/.env
# Edit GAME_HOST in deploy/.env to your actual hostname.
bash deploy/start.sh
```

`deploy/start.sh` fetches the curated Dust II collision data from `gh-pages`,
builds the container, validates that data and waits for server readiness. Git and
Docker/Compose are the only host prerequisites; host Node/npm and the original
game files are not needed on the VPS. For manual Node development,
`npm run server:prepare` remains available. The container excludes the installer, raw assets, and browser media.
Caddy terminates TLS and proxies WebSockets to the private game container.

Verify `https://YOUR_HOST/healthz` returns `status: ok`. In the game's Multiplayer
dialog, enter `wss://YOUR_HOST/ws` and a callsign, then join the queue. The address
is saved on that device. A default address can also be set at browser-build time
with `VITE_MULTIPLAYER_URL`.

`ALLOWED_ORIGINS` is a comma-separated list of allowed browser origins; the
deployment defaults to `https://vibejedi.github.io`. Set `HOST`, `PORT`, or
`BIOHAZARD_MAP_DATA` for a non-container setup. Keep host secrets out of Git and
the browser build. No player payment credentials are used by this release.

For Contabo setup, DNS, firewall checks, updates and account backups, follow
[the VPS deployment guide](VPS_DEPLOYMENT.md).

## Validation and current limits

`npm run server:test` tests real WebSocket connections, five-minute batching,
room isolation/capacity, rejected input/position tampering, server ammo and fire
rates, and server-side headshot/respawn behavior. Browser integration checks
connect two clients to the real local service and exercise matching/combat.
The non-root server container was also started and checked through HTTP readiness
and a real WebSocket queue connection. The cloud Docker network could not resolve
the npm registry, so that image check installed the same locked dependencies
from the already populated npm cache. The normal VPS Dockerfile uses npm ci
against the registry; Compose configuration was validated. Public DNS/TLS and
VPS latency still require deployment verification.

Guest play is available before the project-token launch. Wallet accounts and
permanent burn-pass verification are implemented; see
[wallet setup](WALLETS_AND_REWARDS.md). Reconnect identity, persistent global
rankings, server-side replay review, regional redundancy, and latency compensation
are not implemented. The authoritative
server is a foundation for fair PvP; it is not a complete anti-cheat system.
There are no entry fees or payouts. Actual public service readiness must be
verified after the VPS and DNS are configured; a locally passing service does
not establish a live USA West endpoint.
