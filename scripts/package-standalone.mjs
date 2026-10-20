import { rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../releases/', import.meta.url));
await rename(`${output}index.html`, `${output}BIOHAZARD.html`);
await writeFile(`${output}README.txt`, 'BIOHAZARD — Browser Edition\n\nOpen BIOHAZARD.html in a modern browser (Chrome or Edge recommended).\nClick ENTER THE QUARANTINE to play. No installation or local server is required.\nBlack Mesa Lockdown is the main campaign (5 original Half-Life maps / 15 waves); Dust II is training.\nThe file includes every map, original weapon/monster media, fonts, and game code.\nWASD: move. Mouse: look/fire. R: reload. 1/2: switch. Shift: sprint. E: open military supply crate shop. F or HUD button: flashlight. Esc: pause (timer continues).\n\nStart with a USP and $600. Buy SMGs, rifles and heavy weapons with earned cash. No ammo or health recovery between waves. Campaign Scores ranks headshots, speed, damage and accuracy on this device. Points have no cash value.\nThe campaign works offline. Guest PvP requires an active WebSocket server address in Multiplayer. It does not run the original\nCounter-Strike multiplayer or native client/server engine.\n');
console.log(`Standalone game: releases/BIOHAZARD.html (${((await stat(`${output}BIOHAZARD.html`)).size / 1024 / 1024).toFixed(1)} MiB)`);
