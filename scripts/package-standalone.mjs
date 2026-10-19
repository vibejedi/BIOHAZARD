import { rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../releases/', import.meta.url));
await rename(`${output}index.html`, `${output}BIOHAZARD.html`);
await writeFile(`${output}README.txt`, 'BIOHAZARD — Browser Edition\n\nOpen BIOHAZARD.html in a modern browser (Chrome or Edge recommended).\nClick ENTER THE QUARANTINE to play. No installation or local server is required.\nThe file includes the Dust II map, original weapon/zombie media, fonts, and game code.\nWASD: move. Mouse: look/fire. R: reload. 1/2: switch. Shift: sprint. E: resupply. Esc: pause.\n\nThis is a custom single-player zombie-survival game. It does not run the original\nCounter-Strike multiplayer or native client/server engine.\n');
console.log(`Standalone game: releases/BIOHAZARD.html (${((await stat(`${output}BIOHAZARD.html`)).size / 1024 / 1024).toFixed(1)} MiB)`);
