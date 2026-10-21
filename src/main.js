import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './style.css';
import { BiohazardGame } from './game.js';
import { COURSES } from './campaign.js';
import { MultiplayerClient } from './multiplayer.js';
import { WalletUI } from './wallet.js';

const icons = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  cross: '<path d="m6 6 12 12M6 18 18 6"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z"/><path d="m8 11 3 3 5-6"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
  skull: '<path d="M5 15a9 9 0 1 1 14 0v4h-4v3H9v-3H5v-4Z"/><circle cx="8" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/><path d="m11 16 1-2 1 2"/>',
  bolt: '<path d="m14 2-10 12h7l-1 8 10-12h-7l1-8Z"/>',
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
  pin: '<path d="M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  pause: '<path d="M7 4v16M17 4v16"/>',
  gear: '<path d="m9 3-1 3-3 1 1 4-2 3 3 2 1 4 4-1 3 2 2-3 4-1-1-4 1-3-3-2-1-4-4 1-3-2Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.target}</svg>`;
const rifle = '<svg viewBox="0 0 160 48" fill="currentColor" aria-hidden="true"><path d="M4 21h30v-7h13v4h45v-4h5v4h20v4h31v-3h5v10h-5v-3h-46v6H78l5 13H67l-7-13H45l-4 12H30l2-15H10l-6 8H0V21Zm42-9h9v7h-9v-7Zm49-7h4v13h-4V5Z"/></svg>';

document.querySelector('#app').innerHTML = `
  <div id="world" aria-label="Counter-Strike Dust II game view"></div>
  <div class="cinema-grain" aria-hidden="true"></div>
  <div class="menu-shade" aria-hidden="true"></div>
  <header class="site-header">
    <a class="brand" href="#" aria-label="BIOHAZARD home"><span class="brand-mark">☣︎</span><span>BIOHAZARD<span class="brand-sub">QUARANTINE PROTOCOL</span></span></a>
    <nav aria-label="Main navigation"><button class="nav-item active" id="operations">OPERATIONS <span>01</span></button><button class="nav-item" id="manual">FIELD MANUAL ${icon('arrow')}</button></nav>
    <div class="header-status"><span class="status-dot"></span> PRACTICE TIME TRIAL <span class="build-label">BUILD 0.2</span></div>
  </header>

  <main id="menu" class="menu">
    <div class="eyebrow"><span class="little-line"></span> THE LAST LINE OF DEFENSE</div>
    <h1>BLACK MESA.<br>LAST <span>STAND.</span></h1>
    <p class="intro">Five maps. Fifteen waves. One pistol.<br>Earn your arsenal. Spend wisely. Survive the lockdown.</p>
    <div class="mode-tabs" role="group" aria-label="Game mode"><button id="mode-campaign" class="selected">01 CAMPAIGN</button><button id="mode-multiplayer" disabled>02 MULTIPLAYER</button></div><div class="mission-card">
      <div class="mission-top"><span class="tag">SPEED SURVIVAL</span><select id="map-select" aria-label="Map" disabled><option value="hl-campaign">BLACK MESA · CAMPAIGN</option><option value="dust2" disabled>DUST II · TRAINING</option></select></div>
      <div class="mission-title"><span class="map-icon">${icon('pin')}</span><div><h2>BLACK MESA LOCKDOWN</h2><p>Five maps · Fifteen waves · Earn your arsenal</p></div><span class="danger-bars"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="mission-meta"><span>${icon('skull')} 5 HOSTILE WAVES</span><span>${icon('shield')} SOLO OPERATION</span></div>
    </div>
    <div class="loadout-label"><span>WEAPON PROGRESSION</span><span>$600 STARTING CASH</span></div>
    <div class="progression-strip"><span class="active">USP / PISTOLS<small>START</small></span><i>→</i><span>SMGs<small>CHAPTER 2</small></span><i>→</i><span>RIFLES<small>CHAPTER 3</small></span><i>→</i><span>HEAVY<small>CHAPTER 5</small></span></div>
    <div class="difficulty-row"><label for="difficulty">THREAT LEVEL</label><div class="difficulty-select"><span class="status-dot"></span><select id="difficulty" aria-label="Threat level"><option value="recruit">RECRUIT</option><option value="operator" selected>OPERATOR</option><option value="veteran">VETERAN</option></select></div></div>
    <button class="deploy" id="deploy"><span>ENTER THE QUARANTINE</span>${icon('arrow')}</button>
    <div class="deploy-note" id="asset-status"><span class="status-dot"></span> LOADING COUNTER-STRIKE MAP + MODELS…</div>
    <button class="records-link" id="records-open">PERSONAL CAMPAIGN SCORES ${icon('arrow')}</button>
  </main>

  <aside class="scene-label" aria-label="Map information"><span class="scene-cross">+</span><div><span class="scene-kicker">RECON FEED / D2</span><strong>DUST II</strong><span class="scene-coordinates">DE_DUST2 · COUNTER-STRIKE 1.6</span></div><span class="live-label"><i></i> LIVE</span></aside>
  <div class="scene-bottom"><span>THEY DON'T STOP.<br><b>NEITHER DO YOU.</b></span><span class="vertical-rule"></span><span>CS-INSPIRED GUNPLAY<br><b>ORIGINAL WEB SURVIVAL</b></span></div>
  <footer class="site-footer"><span>INDEPENDENT PROTOTYPE <i>/</i> INSPIRED BY THE CLASSICS</span><div><button id="sound" class="icon-button" aria-label="Mute sound" title="Toggle sound">${icon('sound')}</button><button id="settings" class="icon-button" aria-label="Settings" title="Settings">${icon('gear')}</button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button></div><span class="footer-note">STAY SHARP. STAY ALIVE.</span></footer>

  <section id="hud" class="hud" aria-label="Game status" hidden>
    <div class="hud-top"><div class="radar-wrap"><canvas id="radar" width="160" height="160" aria-label="Tactical minimap"></canvas><span class="radar-label">DUST II <b>D2</b></span></div><div class="wave-panel"><span id="run-stage">BLACK MESA · CAMPAIGN</span><strong><span id="wave-mode">WAVE</span> <b id="wave">01</b><em id="wave-total">/ 15</em></strong><small><i class="status-dot"></i> <span id="remaining">HOSTILES INBOUND</span></small><div class="run-clock"><b id="run-time">0:00.00</b><span id="run-score">0 PTS</span><span id="run-headshots">0 HEADSHOTS</span></div><button id="flashlight-toggle" class="flashlight-toggle" aria-label="Turn flashlight off" aria-pressed="true">F · FLASHLIGHT ON</button></div><button id="pause" class="hud-pause icon-button" aria-label="Pause game">${icon('pause')}</button></div>
    <div class="compass"><span>W</span><i></i><span>NW</span><i></i><b id="heading">N</b><i></i><span>NE</span><i></i><span>E</span></div>
    <div id="killfeed" class="killfeed" aria-live="polite"></div>
    <div id="wave-banner" class="wave-banner"><span>STAY ALERT</span><strong>THEY'RE COMING.</strong></div>
    <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker" class="hitmarker">×</div><div id="hit-feedback" class="hit-feedback" aria-live="polite"></div>
    <div id="damage-vignette" class="damage-vignette"></div>
    <div id="interaction" class="interaction" hidden><kbd>E</kbd><span>SUPPLY CRATE <b>BUY / REFILL</b></span></div>
    <div id="reload-indicator" class="reload-indicator" hidden><span>RELOADING</span><i></i></div>
    <div id="notification" class="notification" role="status"></div><div id="wave-summary" class="wave-summary" hidden></div>
    <div class="hud-bottom"><div class="vitals"><div class="health-number">${icon('health')}<strong id="health">100</strong><span>HEALTH</span></div><div class="health-track"><i id="health-bar"></i></div><div class="stamina-track"><i id="stamina-bar"></i></div><div class="hud-cash"><span id="cash">0 CR</span><span id="kills">0 KILLS</span></div></div><div class="hud-controls"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>R</kbd> RELOAD</span><span><kbd>1 / 2</kbd> SWITCH</span></div><div class="ammo-panel"><div class="weapon-label" id="weapon-name">M4 CARBINE</div><div class="ammo-numbers"><strong id="ammo">30</strong><span>/</span><b id="reserve">180</b></div><div class="caliber" id="caliber">5.56 × 45 MM</div></div></div>
    <div class="touch-controls"><div id="joystick" class="joystick"><i></i></div><div class="touch-actions"><button id="touch-reload" aria-label="Reload">R</button><button id="touch-fire" aria-label="Fire">${icon('target')}</button><button id="touch-switch" aria-label="Switch weapon">1/2</button><button id="touch-supply" aria-label="Resupply">E</button></div></div>
  </section>

  <section id="pause-screen" class="overlay-screen" hidden><div class="overlay-card"><span class="eyebrow">OPERATION ON HOLD</span><h2>TAKE A<br><span>BREATHER.</span></h2><p id="pause-description">The run timer keeps going while paused. Your next shot matters.</p><button class="deploy" id="resume">BACK TO THE FIGHT ${icon('arrow')}</button><button class="secondary-button" id="restart">RESTART OPERATION</button><button class="text-button" id="quit">RETURN TO BASE</button></div></section>
  <section id="result-screen" class="overlay-screen" hidden><div class="overlay-card"><span class="eyebrow" id="result-kicker">SIGNAL LOST</span><h2 id="result-title">OVERRUN.</h2><p id="result-description">You held the line. Until you couldn't.</p><div class="result-stats"><div><strong id="result-wave">01</strong><span id="result-wave-label">WAVES REACHED</span></div><div><strong id="result-kills">0</strong><span id="result-kills-label">HOSTILES DOWN</span></div><div><strong id="result-time">0:00.00</strong><span id="result-time-label">RUN TIME</span></div><div><strong id="result-score">0</strong><span>POINTS</span></div><div><strong id="result-headshots">0</strong><span>HEADSHOTS</span></div><div><strong id="result-rank">—</strong><span id="result-rank-label">PERSONAL RANK</span></div></div><p id="result-record-note" class="record-note"></p><details class="wave-results"><summary id="result-table-label">WAVE PERFORMANCE</summary><div class="records-table-wrap"><table class="records-table"><thead id="result-breakdown-head"><tr><th>WAVE</th><th>TIME</th><th>HS</th><th>ACC</th><th>DMG</th><th>PTS</th></tr></thead><tbody id="result-breakdown-body"></tbody></table></div></details><p id="best-score" class="best-score"></p><button class="deploy" id="retry">ONE MORE ROUND ${icon('arrow')}</button><button class="text-button" id="result-quit">RETURN TO BASE</button></div></section>

  <dialog id="records-dialog"><button class="close-dialog icon-button" aria-label="Close personal records">${icon('cross')}</button><span class="eyebrow"><span id="records-course">DUST II</span> / <span id="records-difficulty">OPERATOR</span></span><h2>CAMPAIGN SCORES<span>.</span></h2><p>Clear every wave in your selected operation. Headshots, wave speed, damage taken, and accuracy determine your score. Highest score ranks first; total time breaks ties.</p><div class="records-table-wrap"><table class="records-table"><thead><tr><th>RANK</th><th>TIME</th><th>POINTS</th><th>HEADSHOTS</th></tr></thead><tbody id="records-body"></tbody></table></div><p id="records-empty">No completed runs yet. Complete your operation to set your first time.</p><p class="small-print">Personal practice records saved on this device, separated by difficulty. Points and field cash have no cash value. Online prize competitions and payouts are not active.</p></dialog>

  <dialog id="armory-dialog" class="armory"><button class="close-dialog icon-button" aria-label="Close supply crate">${icon('cross')}</button><span class="eyebrow">MILITARY SUPPLY STATION</span><h2>FIELD ARMORY<span>.</span></h2><div class="armory-balance"><span>FIELD CASH</span><b id="armory-cash">$600</b></div><p id="armory-unlocks" class="small-print"></p><div id="armory-weapons" class="armory-weapons"></div><div class="armory-supplies"><button id="buy-ammo" class="secondary-button">REFILL HELD WEAPON</button><button id="buy-health" class="secondary-button">RESTORE HEALTH</button></div><p id="armory-message" role="status"></p><p class="small-print">Purchases require the crate. Ammunition never replenishes at wave or chapter changes. Enemies keep moving while you shop.</p></dialog>
  <dialog id="multiplayer-dialog"><button class="close-dialog icon-button" aria-label="Close multiplayer">${icon('cross')}</button><span class="eyebrow">USA WEST / INSTANCED FFA</span><h2>FREE FOR ALL<span>.</span></h2><p>Up to 10 players per match. A new queue batch starts every five minutes. Five-minute deathmatches use server-verified movement, combat, and purchases.</p><label class="setting-row" for="mp-name">CALLSIGN</label><input id="mp-name" maxlength="20" value="Operator" autocomplete="nickname"/><label class="setting-row" for="mp-endpoint">MATCH SERVER</label><input id="mp-endpoint" type="url" placeholder="wss://your-server.example/ws"/><p id="mp-status" role="status">Server not connected. Add the USA West server address when available.</p><div class="mp-queue"><b id="mp-queue-count">— / 10</b><span id="mp-countdown">NEXT BATCH: —</span></div><button id="mp-join" class="deploy">JOIN QUEUE ${icon('arrow')}</button><button id="mp-leave" class="secondary-button" disabled>LEAVE QUEUE</button><p class="small-print">An active match server is required. Players join at the next five-minute boundary; at least two players are needed. Queued players beyond the first 10 get a separate match.</p></dialog>
  <dialog id="manual-dialog"><button class="close-dialog icon-button" aria-label="Close field manual">${icon('cross')}</button><span class="eyebrow">KNOW YOUR OPERATION</span><h2>FIELD MANUAL<span>.</span></h2><p>Clear the five-map campaign. Start with a USP, earn field cash, and buy better weapons at supply crates. No free ammunition between waves.</p><div class="manual-grid"><div><kbd>W A S D</kbd><span>Move</span></div><div><kbd>MOUSE</kbd><span>Look around</span></div><div><kbd>LEFT CLICK</kbd><span>Fire weapon</span></div><div><kbd>RIGHT CLICK</kbd><span>Aim down sights</span></div><div><kbd>SHIFT</kbd><span>Sprint</span></div><div><kbd>SPACE</kbd><span>Jump</span></div><div><kbd>F</kbd><span>Toggle flashlight</span></div><div><kbd>R</kbd><span>Reload</span></div><div><kbd>1 / 2</kbd><span>Primary / sidearm</span></div><div><kbd>E</kbd><span>Open supply crate shop</span></div><div><kbd>ESC / P</kbd><span>Pause</span></div></div><div class="manual-tip">${icon('bolt')} Earn $100 per kill, $150 per headshot kill, and $300 per completed wave. Buy weapons, ammo or health at the military crate.</div><p class="small-print">On touchscreens: use the left stick to move, drag the right side to look, and use the action buttons. This original web prototype is inspired by classic tactical shooters. It does not contain Counter-Strike game code or assets.</p></dialog>
  <dialog id="settings-dialog"><button class="close-dialog icon-button" aria-label="Close settings">${icon('cross')}</button><span class="eyebrow">OPERATOR PREFERENCES</span><h2>SETTINGS<span>.</span></h2><label class="setting-row" for="sensitivity"><span>Mouse sensitivity</span><output id="sensitivity-value">1.0</output></label><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value="1"/><label class="setting-row" for="quality"><span>Render quality</span><select id="quality"><option value="high">HIGH</option><option value="low">PERFORMANCE</option></select></label><p class="small-print">Preferences are saved on this device. Performance mode reduces shadow quality and render resolution.</p></dialog>
`;

let game;
try {
  game = new BiohazardGame(document.querySelector('#world'), {
    icon,
    onState: state => {
      document.body.dataset.state = state;
      document.querySelector('#hud').hidden = !['playing', 'paused'].includes(state);
      document.querySelector('#pause-screen').hidden = state !== 'paused';
      document.querySelector('#result-screen').hidden = !['dead', 'won'].includes(state);
    },
  });
} catch (error) {
  console.error(error);
  document.querySelector('#deploy').disabled = true;
  document.querySelector('.intro').textContent = 'The renderer could not start. Enable WebGL / hardware acceleration and reload to enter the quarantine.';
}

if (game) {
  const wallet = new WalletUI(game);
  const multiplayer = new MultiplayerClient(game, wallet);
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ } };
  const deploy = () => { if (!wallet.canPlay()) return; if (game.networkSession) { game.home(); document.querySelector('#multiplayer-dialog').showModal(); return; } game.start('usp', document.querySelector('#difficulty').value); };
  document.querySelector('#deploy').addEventListener('click', deploy);
  document.querySelector('#retry').addEventListener('click', deploy);
  document.querySelector('#restart').addEventListener('click', deploy);
  document.querySelector('#pause').addEventListener('click', () => game.pause());
  document.querySelector('#resume').addEventListener('click', () => game.resume());
  document.querySelector('#quit').addEventListener('click', () => game.home());
  document.querySelector('#result-quit').addEventListener('click', () => game.home());
  document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); game.home(); });
  document.querySelector('#operations').addEventListener('click', () => { if (game.state !== 'home') game.home(); document.querySelector('#deploy').focus(); });
  for (const [button, dialog] of [['manual', 'manual-dialog'], ['settings', 'settings-dialog'], ['records-open', 'records-dialog']]) document.querySelector(`#${button}`).addEventListener('click', () => { if (button === 'records-open') game.renderRecords(); document.querySelector(`#${dialog}`).showModal(); });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } });
  });
  const sound = document.querySelector('#sound');
  const setSound = enabled => { game.audio.enabled = enabled; sound.innerHTML = icon(enabled ? 'sound' : 'muted'); sound.setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound'); save('bh-sound', String(enabled)); };
  setSound(read('bh-sound', 'true') === 'true');
  sound.addEventListener('click', () => { game.audio.unlock(); setSound(!game.audio.enabled); });
  document.querySelector('#fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { document.querySelector('#fullscreen').title = 'Fullscreen unavailable in this browser'; }
  });
  const sensitivity = document.querySelector('#sensitivity'); sensitivity.value = read('bh-sensitivity', '1');
  const updateSensitivity = () => { game.sensitivity = Number(sensitivity.value); document.querySelector('#sensitivity-value').textContent = game.sensitivity.toFixed(1); save('bh-sensitivity', sensitivity.value); };
  sensitivity.addEventListener('input', updateSensitivity); updateSensitivity();
  const quality = document.querySelector('#quality'); quality.value = read('bh-quality', 'high');
  const updateQuality = () => { game.setQuality(quality.value); save('bh-quality', quality.value); };
  quality.addEventListener('change', updateQuality); updateQuality();
  document.querySelector('#map-select').addEventListener('change', event => game.selectCourse(event.target.value));
  document.querySelector('#mode-campaign').addEventListener('click', () => { game.home(); game.selectCourse('hl-campaign'); });
  document.querySelector('#armory-weapons').addEventListener('click', event => { const button = event.target.closest('[data-buy]'); if (button) game.buy(button.dataset.buy, button.dataset.id); });
  document.querySelector('#buy-ammo').addEventListener('click', () => game.buy('ammo'));
  document.querySelector('#buy-health').addEventListener('click', () => game.buy('medkit'));
  document.querySelector('#armory-dialog').addEventListener('close', () => { game.shopping = false; game.keys.clear(); if (game.state === 'playing') game.requestPointer(); });
  const assetStatus = document.querySelector('#asset-status'), deployButton = document.querySelector('#deploy');
  deployButton.disabled = true; game.assetsStatus = 'loading';
  game.loadClassicAssets().then(assets => {
    game.assetsStatus = assets && game.world.id ? 'ready' : 'absent';
    if (assets && game.world.id) {
      assetStatus.innerHTML = '<span class="status-dot"></span> CS WEAPONS + HALF-LIFE ZOMBIES · WEB EDITION';
      for (const option of document.querySelectorAll('#map-select option')) option.disabled = !COURSES[option.value].stages.every(stage => game.worlds[stage.map]);
      document.querySelector('#map-select').value = game.courseId;
      document.querySelector('#map-select').disabled = false;
      document.querySelector('#manual-dialog .manual-tip').textContent = 'Start with a USP and $600. E opens the original military supply crate: buy weapons, refill the held gun, or buy health. No automatic ammo or health refill between waves. The 5-map campaign unlocks SMGs at wave 4, rifles at wave 7, and heavy weapons at wave 13. Every completed wave scores headshots, speed, damage taken, and accuracy. F toggles the flashlight.';
      document.querySelector('#manual-dialog .small-print').textContent = 'On touchscreens: use the left stick to move, drag the right side to look, and use the action buttons. This browser survival game uses original Counter-Strike and Half-Life maps, CS weapons, and Half-Life zombies. Black Mesa Lockdown is a custom wave campaign; original Half-Life story scripts, puzzles, and moving machinery are not included. Original Counter-Strike multiplayer and native game code are not included.';
    } else { assetStatus.textContent = 'COUNTER-STRIKE ASSETS MISSING · GAME UNAVAILABLE'; }
  }).catch(error => {
    game.assetsStatus = 'error';
    assetStatus.textContent = 'COUNTER-STRIKE ASSETS COULD NOT LOAD · RELOAD TO RETRY';
    assetStatus.title = error.message;
    console.warn('Classic asset loading failed:', error);
  }).finally(() => { deployButton.disabled = game.assetsStatus !== 'ready'; document.querySelector('#mode-multiplayer').disabled = deployButton.disabled; });
  // Opt-in deterministic controls for browser integration tests; absent in normal play.
  if (new URLSearchParams(location.search).has('test')) window.__biohazard = game;
}
