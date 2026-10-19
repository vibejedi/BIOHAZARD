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
  <div id="world" aria-label="3D quarantine yard"></div>
  <div class="cinema-grain" aria-hidden="true"></div>
  <div class="menu-shade" aria-hidden="true"></div>
  <header class="site-header">
    <a class="brand" href="#" aria-label="BIOHAZARD home"><span class="brand-mark">☣︎</span><span>BIOHAZARD<span class="brand-sub">QUARANTINE PROTOCOL</span></span></a>
    <nav aria-label="Main navigation"><button class="nav-item active" id="operations">OPERATIONS <span>01</span></button><button class="nav-item" id="manual">FIELD MANUAL ${icon('arrow')}</button></nav>
    <div class="header-status"><span class="status-dot"></span> LOCAL OPERATION <span class="build-label">BUILD 0.1</span></div>
  </header>

  <main id="menu" class="menu">
    <div class="eyebrow"><span class="little-line"></span> THE LAST LINE OF DEFENSE</div>
    <h1>DEAD CITY.<br>LIVE <span>AMMO.</span></h1>
    <p class="intro">The perimeter is gone. Your orders haven't changed.<br>Gear up. Hold your ground. Make every round count.</p>
    <div class="mission-card">
      <div class="mission-top"><span class="tag">SURVIVAL</span><select id="map-select" aria-label="Map"><option value="ashen">ASHEN YARD</option><option value="dust2" disabled>DUST II</option></select></div>
      <div class="mission-title"><span class="map-icon">${icon('pin')}</span><div><h2>ASHEN YARD</h2><p>Industrial district · Quarantine sector 07</p></div><span class="danger-bars"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="mission-meta"><span>${icon('skull')} 5 HOSTILE WAVES</span><span>${icon('shield')} SOLO OPERATION</span></div>
    </div>
    <div class="loadout-label"><span>01 / SELECT LOADOUT</span><span>+ USP SIDEARM</span></div>
    <div class="loadouts" role="group" aria-label="Primary weapon">
      <button class="loadout selected" data-weapon="m4" aria-pressed="true"><span class="weapon-number">01</span>${rifle}<span class="weapon-info"><strong>M4 CARBINE</strong><small>CONTROLLED. RELIABLE.</small></span><span class="select-dot"></span></button>
      <button class="loadout" data-weapon="ak" aria-pressed="false"><span class="weapon-number">02</span>${rifle}<span class="weapon-info"><strong>AK RIFLE</strong><small>HEAVY. UNFORGIVING.</small></span><span class="select-dot"></span></button>
    </div>
    <div class="difficulty-row"><label for="difficulty">THREAT LEVEL</label><div class="difficulty-select"><span class="status-dot"></span><select id="difficulty" aria-label="Threat level"><option value="recruit">RECRUIT</option><option value="operator" selected>OPERATOR</option><option value="veteran">VETERAN</option></select></div></div>
    <button class="deploy" id="deploy"><span>ENTER THE QUARANTINE</span>${icon('arrow')}</button>
    <div class="deploy-note" id="asset-status"><span class="status-dot"></span> NO DOWNLOAD. NO BACKUP. JUST YOU.</div>
  </main>

  <aside class="scene-label" aria-label="Map information"><span class="scene-cross">+</span><div><span class="scene-kicker">RECON FEED / 07</span><strong>ASHEN YARD</strong><span class="scene-coordinates">41°24′12.2″N &nbsp; 02°10′26.5″E</span></div><span class="live-label"><i></i> LIVE</span></aside>
  <div class="scene-bottom"><span>THEY DON'T STOP.<br><b>NEITHER DO YOU.</b></span><span class="vertical-rule"></span><span>CS-INSPIRED GUNPLAY<br><b>ORIGINAL WEB SURVIVAL</b></span></div>
  <footer class="site-footer"><span>INDEPENDENT PROTOTYPE <i>/</i> INSPIRED BY THE CLASSICS</span><div><button id="sound" class="icon-button" aria-label="Mute sound" title="Toggle sound">${icon('sound')}</button><button id="settings" class="icon-button" aria-label="Settings" title="Settings">${icon('gear')}</button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button></div><span class="footer-note">STAY SHARP. STAY ALIVE.</span></footer>

  <section id="hud" class="hud" aria-label="Game status" hidden>
    <div class="hud-top"><div class="radar-wrap"><canvas id="radar" width="160" height="160" aria-label="Tactical minimap"></canvas><span class="radar-label">ASHEN YARD <b>07</b></span></div><div class="wave-panel"><span>QUARANTINE PROTOCOL</span><strong>WAVE <b id="wave">01</b><em>/ 05</em></strong><small><i class="status-dot"></i> <span id="remaining">HOSTILES INBOUND</span></small></div><button id="pause" class="hud-pause icon-button" aria-label="Pause game">${icon('pause')}</button></div>
    <div class="compass"><span>W</span><i></i><span>NW</span><i></i><b id="heading">N</b><i></i><span>NE</span><i></i><span>E</span></div>
    <div id="killfeed" class="killfeed" aria-live="polite"></div>
    <div id="wave-banner" class="wave-banner"><span>STAY ALERT</span><strong>THEY'RE COMING.</strong></div>
    <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker" class="hitmarker">×</div>
    <div id="damage-vignette" class="damage-vignette"></div>
    <div id="interaction" class="interaction" hidden><kbd>E</kbd><span>RESUPPLY <b>$500</b></span></div>
    <div id="reload-indicator" class="reload-indicator" hidden><span>RELOADING</span><i></i></div>
    <div id="notification" class="notification" role="status"></div>
    <div class="hud-bottom"><div class="vitals"><div class="health-number">${icon('health')}<strong id="health">100</strong><span>HEALTH</span></div><div class="health-track"><i id="health-bar"></i></div><div class="stamina-track"><i id="stamina-bar"></i></div><div class="hud-cash"><span id="cash">$0</span><span id="kills">0 KILLS</span></div></div><div class="hud-controls"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>R</kbd> RELOAD</span><span><kbd>1 / 2</kbd> SWITCH</span></div><div class="ammo-panel"><div class="weapon-label" id="weapon-name">M4 CARBINE</div><div class="ammo-numbers"><strong id="ammo">30</strong><span>/</span><b id="reserve">180</b></div><div class="caliber" id="caliber">5.56 × 45 MM</div></div></div>
    <div class="touch-controls"><div id="joystick" class="joystick"><i></i></div><div class="touch-actions"><button id="touch-reload" aria-label="Reload">R</button><button id="touch-fire" aria-label="Fire">${icon('target')}</button><button id="touch-switch" aria-label="Switch weapon">1/2</button><button id="touch-supply" aria-label="Resupply">E</button></div></div>
  </section>

  <section id="pause-screen" class="overlay-screen" hidden><div class="overlay-card"><span class="eyebrow">OPERATION ON HOLD</span><h2>TAKE A<br><span>BREATHER.</span></h2><p>The yard will wait. Your next shot matters.</p><button class="deploy" id="resume">BACK TO THE FIGHT ${icon('arrow')}</button><button class="secondary-button" id="restart">RESTART OPERATION</button><button class="text-button" id="quit">RETURN TO BASE</button></div></section>
  <section id="result-screen" class="overlay-screen" hidden><div class="overlay-card"><span class="eyebrow" id="result-kicker">SIGNAL LOST</span><h2 id="result-title">OVERRUN.</h2><p id="result-description">You held the line. Until you couldn't.</p><div class="result-stats"><div><strong id="result-wave">01</strong><span>WAVE REACHED</span></div><div><strong id="result-kills">0</strong><span>HOSTILES DOWN</span></div><div><strong id="result-time">0:00</strong><span>TIME SURVIVED</span></div></div><p id="best-score" class="best-score"></p><button class="deploy" id="retry">ONE MORE ROUND ${icon('arrow')}</button><button class="text-button" id="result-quit">RETURN TO BASE</button></div></section>

  <dialog id="manual-dialog"><button class="close-dialog icon-button" aria-label="Close field manual">${icon('cross')}</button><span class="eyebrow">KNOW YOUR OPERATION</span><h2>FIELD MANUAL<span>.</span></h2><p>Survive five waves. Keep moving, aim for the head, and reload before the next wave hits.</p><div class="manual-grid"><div><kbd>W A S D</kbd><span>Move</span></div><div><kbd>MOUSE</kbd><span>Look around</span></div><div><kbd>LEFT CLICK</kbd><span>Fire weapon</span></div><div><kbd>RIGHT CLICK</kbd><span>Aim down sights</span></div><div><kbd>SHIFT</kbd><span>Sprint</span></div><div><kbd>SPACE</kbd><span>Jump</span></div><div><kbd>R</kbd><span>Reload</span></div><div><kbd>1 / 2</kbd><span>Rifle / pistol</span></div><div><kbd>E</kbd><span>Resupply near the green crate</span></div><div><kbd>ESC / P</kbd><span>Pause</span></div></div><div class="manual-tip">${icon('bolt')} Earn $100 per kill, or $150 for a headshot. Spend $500 at the field supply crate to refill ammunition and restore health.</div><p class="small-print">On touchscreens: use the left stick to move, drag the right side to look, and use the action buttons. This original web prototype is inspired by classic tactical shooters. It does not contain Counter-Strike game code or assets.</p></dialog>
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
  let weapon = 'm4';
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ } };
  document.querySelectorAll('[data-weapon]').forEach(button => button.addEventListener('click', () => {
    weapon = button.dataset.weapon;
    document.querySelectorAll('[data-weapon]').forEach(other => { const selected = other === button; other.classList.toggle('selected', selected); other.setAttribute('aria-pressed', selected); });
    game.audio.unlock(); game.audio.tone(440, 0.04, 0.025);
  }));
  const deploy = () => game.start(weapon, document.querySelector('#difficulty').value);
  document.querySelector('#deploy').addEventListener('click', deploy);
  document.querySelector('#retry').addEventListener('click', deploy);
  document.querySelector('#restart').addEventListener('click', deploy);
  document.querySelector('#pause').addEventListener('click', () => game.pause());
  document.querySelector('#resume').addEventListener('click', () => game.resume());
  document.querySelector('#quit').addEventListener('click', () => game.home());
  document.querySelector('#result-quit').addEventListener('click', () => game.home());
  document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); game.home(); });
  document.querySelector('#operations').addEventListener('click', () => { if (game.state !== 'home') game.home(); document.querySelector('#deploy').focus(); });
  for (const [button, dialog] of [['manual', 'manual-dialog'], ['settings', 'settings-dialog']]) document.querySelector(`#${button}`).addEventListener('click', () => document.querySelector(`#${dialog}`).showModal());
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
  document.querySelector('#map-select').addEventListener('change', event => game.selectMap(event.target.value));
  const assetStatus = document.querySelector('#asset-status'), deployButton = document.querySelector('#deploy');
  deployButton.disabled = true; game.assetsStatus = 'loading';
  game.loadClassicAssets().then(assets => {
    game.assetsStatus = assets ? 'ready' : 'absent';
    if (assets) {
      assetStatus.innerHTML = '<span class="status-dot"></span> CS WEAPONS + HALF-LIFE ZOMBIES · WEB EDITION';
      document.querySelector('#map-select option[value="dust2"]').disabled = !game.worlds.dust2;
      document.querySelector('#map-select').value = game.world.id;
      document.querySelector('#manual-dialog .small-print').textContent = 'On touchscreens: use the left stick to move, drag the right side to look, and use the action buttons. This browser survival game uses the original Dust II map, CS weapon models, and Half-Life zombie media with custom zombie-survival rules. Original Counter-Strike multiplayer and native game code are not included.';
    }
  }).catch(error => {
    game.assetsStatus = 'error';
    assetStatus.textContent = 'LOCAL ASSETS UNAVAILABLE · ORIGINAL MODELS ACTIVE';
    assetStatus.title = error.message;
    console.warn('Classic asset loading failed:', error);
  }).finally(() => { deployButton.disabled = false; });
  // Opt-in deterministic controls for browser integration tests; absent in normal play.
  if (new URLSearchParams(location.search).has('test')) window.__biohazard = game;
}
