import { mediaURL } from './media.js';

export class GameAudio {
  constructor() { this.enabled = true; this.context = null; this.lastGrowl = 0; this.sampleData = {}; this.samples = {}; }
  unlock() {
    try { this.context ??= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume(); this.decodeSamples(); } catch { /* Sound is optional. */ }
  }
  async loadSamples(paths) {
    const loaded = await Promise.all(Object.entries(paths).map(async ([name, path]) => {
      try { const response = await fetch(mediaURL(path)); if (response.ok) return [name, await response.arrayBuffer()]; } catch { /* Synthesized audio remains available. */ }
      return null;
    }));
    this.sampleData = Object.fromEntries(loaded.filter(Boolean)); this.decodeSamples();
  }
  decodeSamples() {
    if (!this.context) return;
    for (const [name, data] of Object.entries(this.sampleData)) {
      delete this.sampleData[name];
      this.context.decodeAudioData(data.slice(0)).then(buffer => { this.samples[name] = buffer; }).catch(() => {});
    }
  }
  sample(name, volume = 0.3) {
    if (!this.enabled || !this.context || !this.samples[name]) return false;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.samples[name]; gain.gain.value = volume; source.connect(gain).connect(this.context.destination); source.start(); return true;
  }
  tone(frequency, duration, volume = 0.06, type = 'sine', end = frequency) {
    if (!this.context || !this.enabled) return;
    const time = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time); oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), time + duration);
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.context.destination); oscillator.start(time); oscillator.stop(time + duration);
  }
  noise(duration, volume, cutoff = 1300) {
    if (!this.context || !this.enabled) return;
    const context = this.context, buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(context.destination); source.start();
  }
  fire(id) { if (this.sample(id, 0.35)) return; const pistol = id === 'usp'; this.noise(0.17, pistol ? 0.18 : 0.24, 2600); this.tone(pistol ? 160 : 110, 0.16, 0.14, 'triangle', 35); }
  reload() { if (this.sample('reload', 0.3)) return; this.noise(0.08, 0.08, 4500); this.tone(520, 0.055, 0.03, 'square', 260); }
  hit(kill) { this.tone(kill ? 850 : 460, 0.06, 0.04, 'triangle', kill ? 420 : 200); }
  hurt() { if (this.sample('hurt', 0.4)) return; this.noise(0.3, 0.14, 650); this.tone(65, 0.25, 0.13, 'sine', 30); }
  wave() { this.tone(220, 0.55, 0.045, 'triangle', 110); setTimeout(() => this.tone(330, 0.5, 0.04, 'triangle', 165), 200); }
  growl(distance, kind) { if (this.enabled && distance < 12 && performance.now() - this.lastGrowl > 3500) { this.lastGrowl = performance.now(); const name = kind === 'headcrab' ? 'crabIdle' : Math.random() < 0.5 ? 'zombie1' : 'zombie2'; if (this.sample(name, 0.2 * (1 - distance / 15))) return; this.tone(63, 0.8, 0.045 * (1 - distance / 15), 'sawtooth', 33); this.noise(0.7, 0.035, 170); } }
}
