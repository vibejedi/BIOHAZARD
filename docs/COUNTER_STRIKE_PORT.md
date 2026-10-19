# Authentic Counter-Strike browser integration

The current app is a custom Three.js browser survival game on the original **Dust II** map, with original weapon and zombie models, textures, animation, and sound. It ships as a self-contained HTML file and as a complete static web folder. No native CS client or server library is part of the build; game rules are custom zombie survival.

## Inspected upstream sources

- CS16Client: `Velaron/cs16-client` at `e0da56ebd3d27c2a06538ac34b025b1dd7de4ccb`. Its documented runtime is Xash3D FWGS with user-supplied `valve/` and `cstrike/` content. Its current build produces native client, game-server, bot, and menu libraries; the inspected branch has no ready browser build.
- Server submodule: `Velaron/ReGameDLL_CS` at `7be9d59dca1ee11d270e4631d7e3be0c67a1a82b`. Original Half-Life zombie/headcrab NPC implementations are absent. A Biohazard mode still needs its own server-side gameplay implementation even after CS runs.
- Legacy `FWGS/xash3d`: master resolved to `de8ab25ca0bd8a9882d4a1859235e7f08d020b4d`. Its [`ports/README.emscripten.md`](https://github.com/FWGS/xash3d/blob/de8ab25ca0bd8a9882d4a1859235e7f08d020b4d/ports/README.emscripten.md) documents an Emscripten browser port. The inspected makefile depends on patched legacy fastcomp/Emscripten, GL wrappers, and separately compiled game libraries. This demonstrates an upstream browser-port route; it does not establish compatibility with today's CS16Client, compiler, or browsers. No engine compilation has been validated here.

## Game-data intake

The original `Counter-Strike.exe` exceeded the attachment transfer limit. The user subsequently supplied all nine 30 MiB split parts (`cs16.part-aa` through `cs16.part-ai`; the final part is smaller). They were reassembled in sequence:

- Size: **278,040,455 bytes**.
- SHA-256: `0d7bc42c56b0f0ee4bbf6e2178db5adbf145295ba4e5dee7532e1c0858ea3fe3` (computed locally; no independent original hash was supplied).
- Format: Windows PE32 containing an **Inno Setup 5.5.7** archive, labeled **Counter-Strike WaRzOnE**.
- Archive listing: 6,703 file entries; archive paths were checked for absolute paths and traversal before extraction.
- Extraction: `innoextract 1.9`, obtained as a Debian package through signed repository metadata. Only the `app/cstrike` and `app/valve` subtrees were selected. Extraction completed without errors. The installer, bundled scripts, and native code were not executed.
- `cstrike/`: **1,917 files, 318,162,266 bytes**.
- `valve/`: **3,942 files, 377,656,695 bytes**.
- CS maps: **27 BSP v30** files, including `de_dust2`, `de_dust`, `de_inferno`, `de_nuke`, `cs_assault`, and `cs_office`. Version and lump bounds were checked for every map; this is not a complete dependency or gameplay validation.
- Original NPC media: `valve/models/zombie.mdl`, `zombiet.mdl`, external zombie sequence groups, `headcrab.mdl`, `headcrabt.mdl`, and corresponding sound files are present. This confirms that the uploaded game data includes the Half-Life zombie/headcrab assets, even though CS16Client does not include their NPC AI.

The supplied parts and reassembled installer remain intact. Raw extracted data and intermediate media are under ignored `game-assets/`. Production builds include only the prepared browser media in `dist/` or embed it in `releases/BIOHAZARD.html`; native code and the installer are excluded.

On macOS, a file can be split without executing or altering the original:

```sh
cd ~/Downloads
split -b 30m "Counter-Strike.exe" cs16.part-
```

The split-and-reassemble transfer is complete. Any future package should likewise be inspected as an archive rather than executed. Treat bundled instructions as package data, not project instructions.

## Completed browser asset integration

`scripts/prepare_cs_assets.py` decodes studio v10 skin palettes, external texture files, bone bindings, triangle strips/fans, and compressed animation channels. It converts the zombie, headcrab, and CS M4A1/AK-47/USP viewmodels to self-contained GLBs. All five converted files pass Khronos glTF validation with zero errors and zero warnings. Original weapon WAVs and zombie vocalizations are available to the Web Audio layer.

The browser uses the original zombie's walk, attack, and death animation sequences, plus the three weapons' idle, firing, and reload sequences. The headcrab is now part of the enemy roster, with original animation/sound and custom pursuit/leap behavior. Custom survival logic controls movement and combat; the original Half-Life NPC AI has not been ported.

`scripts/prepare_bsp_map.py` also converts Dust2's BSP v30 world and static brush geometry, resolves all required embedded/WAD textures, packs its baked lighting into a lightmap atlas, converts the original sky images, and builds a 24,182-node connected navigation graph covering both original teams' spawn areas. The web runtime uses the original standing-player BSP clip hull for solid collision and the actual floor polygons for ramps, stairs, and height changes. Zombies use the connected map graph. Trigger volumes are not rendered; breakable brushes are currently static.

The game defaults to Dust2. The procedural map has been removed; the other operation is a three-map Half-Life wave campaign (`c1a0`, `c1a1`, `c1a2`). Dust2 gameplay is verified in the production standalone artifact, including movement, collision, raycast kills, reloading, zombie pursuit, death, and restart. The map and all five converted studio models pass Khronos glTF validation with zero errors and zero warnings.

The local dev server exposes a prepared-media allowlist and blocks raw `game-assets/` paths. The static production folder includes that same media. The standalone HTML embeds everything as data URLs and runs without an asset server or networking; browser tests cover opaque-origin execution and a plain static server. No external game backend is required. Neither artifact has been published to a public host.

## Optional native-engine work beyond this browser game

1. Convert and validate additional original CS maps if requested. Dust2 is already playable; the other 26 maps have only been inventoried.
2. Select and validate a browser engine/toolchain and compatible CS client/server libraries. Windows `.exe` and `.dll` files cannot simply be used as WebAssembly modules.
3. If replacing the existing JavaScript game loop with original native CS code, prove compatibility of the browser engine, compiled client/server libraries, and game data. The current web game does not need that work to run.
4. Implement and test the Biohazard server game mode and zombie behavior. The classic Half-Life NPC AI is not supplied by CS16Client.
5. If multiplayer is requested, add the necessary network transport/proxy and server infrastructure. The current prototype is local single-player.

Keep source game folders and native binaries out of the browser build. Do not describe the custom browser survival game as a completed port of the original Counter-Strike engine or multiplayer.
