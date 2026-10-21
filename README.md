# BIOHAZARD / Quarantine Protocol

A browser horror survival game using original Counter-Strike and Half-Life maps, CS weapons, and animated Half-Life monsters. The main mode is **USA West PvP deathmatch** on Dust II: up to ten players, five-minute matches, and queues every five minutes. **Black Mesa Lockdown**, the five-map wave campaign, is secondary, with Dust II survival training also available. The procedural Ashen map has been removed.

The standalone edition is **one HTML file** containing the game, map, models, textures, sound, and fonts. Choose Campaign for offline play without an installation, asset server or account; PvP requires an Internet connection to the match server. This is custom wave-survival and PvP gameplay in Three.js; it does not run the native Counter-Strike client/server libraries or original CS multiplayer rules.

## Play the browser edition

For online play, the complete static game is published on the `gh-pages` branch.
Enable **Settings → Pages → Deploy from a branch → gh-pages → / (root)** to serve
it at **https://vibejedi.github.io/BIOHAZARD/**. See [hosting instructions](docs/GITHUB_PAGES.md)
for initial activation and updates. The address becomes live after GitHub's deployment succeeds.

For the downloadable edition:

1. Download and extract `releases/BIOHAZARD-browser.zip`.
2. Open `BIOHAZARD.html` in a modern browser. Chrome or Edge is recommended on Mac and Windows.
3. Click **Enter the quarantine** to play.

The hosted build and standalone edition include all six playable maps. It includes the prepared media from the user's supplied game package. No Windows executable is needed to play. The standalone file also works when served from an ordinary static web host.

## Develop from mobile or anywhere

[Open in GitHub Codespaces](https://codespaces.new/vibejedi/BIOHAZARD?ref=main).
Setup restores the published browser media, installs locked dependencies, checks
and builds the game, then starts the game and development match/account servers.
Open forwarded port **5173** to preview, edit in the browser, and commit/push to
save changes. Resume the same Codespace from your phone or another computer.
Ports stay private by default. See [the mobile development guide](.devcontainer/README.md).

## Wallets and crypto rewards

The game now includes BSC wallet connection, signed username registration, and a
server-verified permanent 100,000-token burn-pass flow. The project token is not
launched. The owner's temporary mainnet test-token address is separate, with burns
disabled by default. Practice play remains available until production access is
configured. Live achievement crates, prize assets, odds and funding are awaiting
the owner's rules; no crypto payouts are enabled. See [wallet/rewards setup](docs/WALLETS_AND_REWARDS.md).

## Develop and build

Use Node.js 24 LTS for the complete development environment, including wallet accounts. From this checkout:

```sh
npm ci --cache /tmp/biohazard-npm-cache
npm run dev -- --port 5173
```

Open the address printed by Vite in a modern browser with WebGL enabled. Press **Enter the quarantine** to capture the mouse and start. Mouse capture requires a direct user gesture and a browser context that permits pointer lock. If capture is unavailable, drag the game view to look. On touch devices, use the left stick, drag the scene to look, and use the right-side action buttons.

Create a hosted production folder:

```sh
npm run build
npm run preview
```

`dist/` includes the JavaScript, fonts, and all prepared game media. It runs on a plain static web host, including under a subdirectory; no Vite middleware or backend is required. Serve this multi-file build over HTTP. For opening directly from disk, use the standalone HTML instead.

Create the standalone HTML and downloadable ZIP:

```sh
npm run package:web
```

Both builds include only the prepared browser media, not the installer or native game libraries. Local build outputs and original game data are ignored by Git. `npm run deploy:github` explicitly publishes the complete static build to the `gh-pages` branch. The original map/model media is required: missing or failed assets disable play and show a loading error. There is no procedural-map fallback.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Look |
| Left mouse | Fire; hold for automatic SMGs, rifles and heavy weapons |
| Right mouse | Aim |
| Shift | Sprint; consumes stamina |
| Space | Jump |
| R | Reload |
| 1 / 2 | Purchased primary / sidearm |
| E | Open original military supply crate shop |
| F / HUD flashlight button | Toggle flashlight |
| Escape / P | Pause |

Start with a USP, 12 loaded rounds, 36 reserve and $600. Buy pistols, SMGs,
rifles and finally heavy weapons using earned field cash. The seven original
weapon models include USP, Desert Eagle, MP5, P90, M4A1, AK-47 and M249. Normal
zombies take 3–4 body hits or one headshot. Animated bone hitboxes, muzzle flashes
and blood effects work with all seven guns.

Body kills earn $100, headshot kills $150, and each wave $300. Open the original
Dust II military crate with E to buy a weapon, refill the held gun, or restore
health. **No free ammunition or health between waves or chapters.** SMGs unlock
at wave 4, rifles at wave 7 and heavy weapons at wave 13. Cash and points have no
real-world value. See [prices and scoring](docs/COMPETITION.md).

## Operations and horror mode

- **Dust II:** original CS map, five waves, 50 enemies.
- **Black Mesa Lockdown (secondary mode):** original Half-Life `c1a0` → `c1a1` → `c1a2` → `c1a3` → `c1a4`: Anomalous Materials, Unforeseen Consequences, Office Complex, We've Got Hostiles and Blast Pit. Three waves per chapter, fifteen waves and 300 enemies. All inventory, health, cash and score carry between maps.

All maps use darker baked lighting, cool ambient light, fog, and a camera-mounted spotlight. Press **F**, or tap the flashlight button in the HUD, to toggle it. The flashlight starts on and has no battery limit. Map materials respond to the light; it is not a screen brightness overlay. Muzzle flashes follow the model's actual barrel attachment and remain visible through a 50 ms frame. Blood sprays are visible at normal shooting distances.

The roster includes original animated shamblers, faster runners using the zombie model, and original leaping headcrabs from wave two onward. Headcrabs have 50 health, take two body shots, and have no headshot bonus. Their original idle/attack sounds are included. Later difficulty increases come from movement, enemy mix, wave sizes, and damage; normal zombie health stays consistent.

This campaign provides custom wave objectives inside Half-Life maps. Original story triggers, puzzles, moving machinery, NPC dialogue, and scripted sequences are not implemented.

## Campaign scores and multiplayer

Wave scores combine headshot kills, completion speed, damage received and shot
accuracy. The wave summary and final results show each factor. Completed runs
rank by total score, then overall elapsed time, with ten personal records retained
per course/difficulty. These are local practice records, without payouts.

The second mode is **PvP free-for-all**. A separate Node/WebSocket service batches
queues every five minutes into independent rooms of 2–10 players. Matches last
five minutes and run on Dust II with original animated player models. The server
verifies movement/collision, hits, ammo, cash, purchases and respawns. Results rank
frags, fewer deaths, then headshots. Guest play is available before launch; wallet accounts and permanent access-pass verification are implemented. Persistent global rankings are not yet available.

The server and browser connection flow are implemented and locally tested. Public
multiplayer requires a USA West VPS, domain and TLS; GitHub Pages cannot run the
match service. The multiplayer menu accepts its `wss://…/ws` address and shows
actual connection/queue status. See [the Contabo deployment guide](docs/VPS_DEPLOYMENT.md) and [multiplayer rules](docs/MULTIPLAYER.md).

```sh
npm run server:prepare
npm run server:start
```

For local play enter `ws://127.0.0.1:8080/ws` in the multiplayer menu on the Vite
site. At least two players must queue before a batch starts. Campaign remains
playable without the server.

## Validation

```sh
npm test
npm run build
npm run package:web
npx playwright install chromium
npm run test:browser
```

To use an existing Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

The rule tests cover ammunition conservation, collision boundaries, obstacle routing, unreachable targets, wave sizes, animated hitboxes, headshot damage, campaign navigation, and comparable timed records. Dust2 checks verify the standing-player BSP hull, floor geometry, connected spawn routes, and movement through a real map route. Browser tests cover the interface and game loop, actual Dust2 and Half-Life map combat, real animated headshots and body-shot counts, rendered flash/blood pixels, flashlight illumination and controls, headcrab leaps, campaign progression and record persistence, plus movement/shooting/restart in the standalone release. They verify that the release requests no separate assets, plays offline in an opaque origin, and that `dist/` runs under a subdirectory on a plain static server.

Browser tests use controlled scenarios through an opt-in `?test=1` inspection hook, which is absent in normal play. Chromium is verified. The executor's managed browser blocks direct `file://` navigation, so standalone behavior is validated both as a single served HTML and with an opaque origin and networking disabled. macOS Safari and a complete human playthrough have not been verified. Automated campaign progression exercises all fifteen wave clears and chapter transitions through the test hook; it is not a human playthrough. The release tests require the supplied game data and both production artifacts to be built first.

## Source layout

- `src/main.js` — menu, HUD, settings, and screen transitions.
- `src/game.js` — game loop, first-person controls, combat, AI, waves, and interactions.
- `src/weapon-view.js` — weapon containers and visible flash / blood textures.
- `src/campaign.js` — survival and campaign chapter rules.
- `src/economy.js` / `src/scoring.js` — shared purchases, tier unlocks and per-wave scoring.
- `src/multiplayer.js` — real WebSocket queue/match client, reconciliation and remote avatars.
- `server/` — authoritative instanced PvP simulation and WebSocket/HTTP service.
- `deploy/` — VPS Docker Compose and Caddy TLS configuration.
- `src/runs.js` — local campaign score validation, formatting, and ranking.
- `src/bsp-world.js` — original map rendering, lightmaps, skyboxes, and military supply crates.
- `src/bsp-navigation.js` — BSP collision, floor lookup, connected navigation, and wave spawn routes.
- `src/rules.js` — weapon balance, difficulty, collision, and navigation.
- `src/audio.js` — original sound samples and synthesized fallbacks.
- `src/classic-assets.js` — original weapons, monsters, player/crate models, and shared resources.
- `src/media.js` — media resolution for hosted and embedded standalone builds.
- `src/style.css` — responsive interface and touch controls.
- `scripts/prepare_cs_assets.py` — data-only GoldSrc model conversion and map-format validation.
- `scripts/prepare_bsp_map.py` — original map geometry, WAD textures, lightmap, sky, and navigation conversion.

## Authentic Counter-Strike content

The user-supplied installer has been reassembled and extracted without executing Windows code. It contains 1,917 files in `cstrike/` and 3,942 in `valve/`, including 27 BSP v30 CS maps. Dust2 is converted and playable with its original textures, baked lighting, sky, collision hull, and a 17,912-node connected navigation graph covering both teams' spawn areas. The other maps remain inventoried. Original zombies, seven CS weapons, the military supply crate and Leet player model are converted for gameplay. The original headcrab is animated, collidable, and part of the enemy roster. Five original Half-Life story maps are also converted, with connected navigation and collision for each chapter.

Keep the original files in ignored `game-assets/`. The expected source layout is `game-assets/extracted/app/{cstrike,valve}/`. To rebuild prepared assets with Python 3.11+:

```sh
python3 -m venv game-assets/tools/python
game-assets/tools/python/bin/pip install -r scripts/requirements-assets.txt
game-assets/tools/python/bin/python scripts/prepare_cs_assets.py
npm run assets:validate
game-assets/tools/python/bin/python -m unittest discover -s tests/assets -p 'test_*.py'
```

`npm run assets:prepare` uses an existing Python installation with the pinned NumPy/Pillow dependencies available. Model palettes, skeletal animation, BSP geometry, WAD textures, and BSP collision are converted as data. No installer, native library, or bundled game script is executed. Conversion output is in ignored `game-assets/ready/`. The dev server allows only a fixed set of prepared media through `/local-game-assets/` and blocks the raw installer/extracted folders. Production builds copy or embed that same prepared media.

Original CS multiplayer and native client/server behavior would require additional engine integration. They are not required for the playable browser survival game. See [the port investigation](docs/COUNTER_STRIKE_PORT.md) for the verified package contents and the distinction between the web game and a native engine port.
