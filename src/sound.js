// STAND-IN SOUND. Short noises made by code for fighting: swings, hits, blocks, growls.
// To be replaced by recorded sounds. play(name, far) - far is the distance in metres, for loudness.
let ac = null, noise = null;
function ctx() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate, d = (noise = ac.createBuffer(1, len, ac.sampleRate)).getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; }
  return ac;
}
// Browsers only allow sound after a key or a click.
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => { const a = ctx(); if (a && a.state === 'suspended') a.resume(); });

function hiss(vol, f0, f1, dur, q = 1, type = 'bandpass') {
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(vol, f0, f1, dur, type = 'sine', wobble = 0) {
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (wobble) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = wobble; lg.gain.value = f0 * 0.12; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  swing: v => hiss(0.22 * v, 500, 2200, 0.17, 1.2),
  hit: v => { tone(0.5 * v, 150, 55, 0.16); hiss(0.25 * v, 1800, 500, 0.07, 0.8); },
  chip: v => { tone(0.16 * v, 520, 380, 0.07, 'triangle'); hiss(0.12 * v, 1800, 900, 0.05, 2); },
  smash: v => { hiss(0.5 * v, 3200, 500, 0.32, 1.2); tone(0.3 * v, 240, 90, 0.16, 'triangle'); hiss(0.25 * v, 5200, 1800, 0.5, 3); },
  gasp: v => { hiss(0.3 * v, 500, 2400, 0.4, 1.2); },
  glance: v => { tone(0.16 * v, 1700, 1300, 0.04, 'triangle'); hiss(0.12 * v, 4200, 2500, 0.04, 2); },
  crack: v => { tone(0.34 * v, 260, 80, 0.13, 'square'); hiss(0.42 * v, 1900, 500, 0.15, 2); },
  bone: v => { tone(0.2 * v, 900, 500, 0.06, 'square'); hiss(0.3 * v, 2600, 900, 0.09, 2); },
  block: v => { tone(0.14 * v, 880, 820, 0.16, 'square'); tone(0.1 * v, 1370, 1300, 0.12, 'square'); },
  parry: v => { tone(0.16 * v, 1320, 1250, 0.22, 'square'); tone(0.12 * v, 1980, 1900, 0.18, 'triangle'); },
  hurt: v => { tone(0.4 * v, 190, 80, 0.26, 'sawtooth'); hiss(0.2 * v, 900, 300, 0.12); },
  dodge: v => hiss(0.12 * v, 300, 900, 0.2, 0.7),
  growl: v => tone(0.26 * v, 120, 74, 0.6, 'sawtooth', 26),
  groan: v => { hiss(0.3 * v, 240, 120, 0.9, 3, 'lowpass'); tone(0.12 * v, 82, 60, 0.9, 'sawtooth', 5); },
  rattle: v => { for (let i = 0; i < 5; i++) setTimeout(() => ac && tone(0.1 * v, 700 + Math.random() * 500, 400, 0.04, 'square'), i * 55); },
  bite: v => hiss(0.2 * v, 1400, 400, 0.1, 1),
  die: v => { tone(0.3 * v, 210, 42, 0.7, 'sawtooth', 9); hiss(0.2 * v, 600, 120, 0.5, 0.7, 'lowpass'); },
  death: v => { tone(0.4 * v, 110, 30, 1.6, 'sawtooth'); },
};

// Stone moving deep in a wall, then water running into a space behind it: used by the button in the tomb.
function rumble(v) {
  const t = ac.currentTime, dur = 3.4;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 140;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7 * v, t + 0.6); g.gain.setValueAtTime(0.7 * v, t + 2.2); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur + 0.05);
  const o = ac.createOscillator(), og = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = 38; l.frequency.value = 7; lg.gain.value = 6; l.connect(lg); lg.connect(o.frequency);
  og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.14 * v, t + 0.8); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(og); og.connect(ac.destination); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
}
function gurgle(v) {
  hiss(0.28 * v, 500, 300, 3.2, 0.8, 'lowpass');                       // the run of water
  for (let i = 0; i < 26; i++) {                                        // and bubbles in it
    const at = 150 + i * 105 + Math.random() * 80, f = 220 + Math.random() * 420;
    setTimeout(() => ac && tone(0.1 * v, f, f * (1.5 + Math.random()), 0.06 + Math.random() * 0.05, 'sine'), at);
  }
}
SOUNDS.rumble = rumble;
SOUNDS.gurgle = gurgle;

// MUTED FOR NOW: the game is silent unless the address has ?sound=1 (or &sound=1). Set this to false to turn sound back on for everyone.
export const MUTED = new URLSearchParams(location.search).get('sound') !== '1';

export function play(name, far = 0) {
  if (MUTED) return;
  if (!ctx() || ac.state !== 'running' || !SOUNDS[name]) return;
  const v = Math.max(0, 1 - far / 22);
  if (v > 0.03) SOUNDS[name](v);
}
