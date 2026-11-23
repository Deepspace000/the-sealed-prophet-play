// STAND-IN ART. Creature pictures drawn by code so fighting can be built and tested.
// Each kind gets five small frames: idle, step, windup, strike, dead. To be replaced by real painted sprites.
const INK = [20, 14, 10];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, v * k)) | 0);

class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  r(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.d[j * this.w + i] = c;
  }
  at(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? null : this.d[y * this.w + x]; }
  canvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let p = this.at(x, y);
      if (p) {                                             // simple shading: light from the left
        if (!this.at(x - 1, y)) p = shade(p, 1.18); else if (!this.at(x + 1, y) || !this.at(x, y + 1)) p = shade(p, 0.68);
      } else if (this.at(x - 1, y) || this.at(x + 1, y) || this.at(x, y - 1) || this.at(x, y + 1)) p = INK;   // a firm outline
      if (p) { g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(x, y, 1, 1); }
    }
    return c;
  }
}

// A figure standing upright, seen from the front. 32 x 48.
function biped(look, pose) {
  const p = new Pix(32, 48), c = hex(look.colour), dk = shade(c, 0.55), eye = hex(look.eyes || '#ffffff');
  const bones = look.detail === 'bones', stone = look.detail === 'stone', lw = bones ? 2 : stone ? 6 : 4, aw = bones ? 2 : stone ? 5 : 3, wood = [120, 84, 44], metal = [150, 170, 150];
  if (pose === 'dead') {
    p.r(4, 43, 22, 4, c); p.r(25, 41, 5, 5, c); p.r(26, 43, 1, 1, INK);
    if (bones) for (let x = 6; x < 24; x += 3) p.r(x, 43, 1, 4, null);
    if (look.weapon === 'spear') p.r(2, 46, 28, 1, wood);
    return p.canvas();
  }
  const big = pose === 'strike', step = pose === 'step', up = pose === 'windup';
  const lean = up ? -1 : big ? 1 : 0;
  // legs
  p.r(11 + (bones ? 1 : 0), 32, lw, step ? 13 : 15, c); p.r(17, 32, lw, 15, c);
  p.r(10, step ? 44 : 46, 5, 2, c); p.r(17, 46, 5, 2, c);
  // body
  if (bones) {
    p.r(15, 16 + lean, 2, 15, c);
    for (let y = 17; y < 28; y += 2) p.r(11, y + lean, 10, 1, c);
    p.r(11, 29, 10, 3, c);
  } else {
    p.r(10, 16 + lean, 12, 16, c); p.r(8, 16 + lean, 16, 4, c);
  }
  // head
  const hy = 5 + lean * 2;
  p.r(12, hy, 8, 9, c); p.r(14, hy + 9, 4, 2, c);
  if (bones) { p.r(13, hy + 3, 2, 3, INK); p.r(17, hy + 3, 2, 3, INK); p.r(13, hy + 7, 6, 1, INK); p.r(13, hy + 4, 1, 1, eye); p.r(18, hy + 4, 1, 1, eye); }
  else { p.r(13, hy + 3, 2, 2, eye); p.r(17, hy + 3, 2, 2, eye); }
  // arms
  if (big) {                                               // both hands reach out at you
    p.r(5, 20, aw + 1, 8, c); p.r(23, 20, aw + 1, 8, c);
    p.r(3, 26, 6, 6, c); p.r(23, 26, 6, 6, c);
  } else if (up) {                                         // one arm drawn back above the head
    p.r(7, 18, aw, 13, c);
    p.r(22, 6, aw, 13, c); p.r(22, 3, aw + 1, 4, c);
  } else {
    p.r(7 + (bones ? 1 : 0), 18 + (step ? 1 : 0), aw, 13, c); p.r(22, 18, aw, 13, c);
  }
  // wrappings: bands across everything
  if (look.detail === 'wraps') {
    for (let y = hy + 1; y < 46; y += 3) for (let x = 0; x < 32; x++) {
      const q = p.at(x, y);
      if (q === c) p.r(x, y, 1, 1, dk);
    }
  }
  // spear
  if (look.weapon === 'spear') {
    if (big) { p.r(14, 22, 4, 9, metal); p.r(15, 19, 2, 3, metal); p.r(15, 31, 2, 4, wood); }     // the point comes straight at you
    else if (up) { for (let i = 0; i < 26; i++) p.r(28 - i, 1 + (i >> 2), 1, 1, i < 4 ? metal : wood); }
    else { p.r(26, 6, 1, 41, wood); p.r(25, 2, 3, 5, metal); p.r(26, 0, 1, 2, metal); }
  }
  return p.canvas();
}

// A four-legged animal coming toward you. 32 x 24.
function beast(look, pose) {
  const p = new Pix(32, 24), c = hex(look.colour), dk = shade(c, 0.6), eye = hex(look.eyes || '#ffe14a');
  if (pose === 'dead') { p.r(4, 19, 20, 4, c); p.r(23, 17, 6, 5, c); p.r(2, 20, 3, 1, c); p.r(26, 19, 1, 1, INK); return p.canvas(); }
  if (pose === 'strike') {                                 // the leap: open jaws, paws out
    p.r(10, 12, 12, 10, dk);
    p.r(7, 2, 18, 13, c); p.r(8, 0, 3, 4, c); p.r(21, 0, 3, 4, c);
    p.r(10, 5, 3, 2, eye); p.r(19, 5, 3, 2, eye);
    p.r(11, 9, 10, 5, [150, 30, 24]);
    for (let x = 11; x < 21; x += 2) { p.r(x, 9, 1, 1, [240, 236, 220]); p.r(x + 1, 13, 1, 1, [240, 236, 220]); }
    p.r(3, 15, 5, 5, c); p.r(24, 15, 5, 5, c);
    return p.canvas();
  }
  const low = pose === 'windup' ? 3 : 0, step = pose === 'step';
  p.r(9, 9 + low, 14, 9 - low, c);
  p.r(23, 10 + low, 5, 2, dk);
  p.r(10, 17, 3, step ? 5 : 7, c); p.r(19, 17, 3, 7, c);
  p.r(11, 3 + low, 10, 8, c);
  p.r(11, low ? 4 : 0, 2, low ? 2 : 4, c); p.r(19, low ? 4 : 0, 2, low ? 2 : 4, c);
  p.r(14, 8 + low, 4, 4, dk); p.r(15, 11 + low, 2, 1, INK);
  p.r(12, 5 + low, 2, 2, eye); p.r(18, 5 + low, 2, 2, eye);
  return p.canvas();
}

// A big beetle coming toward you, a domed shell and mandibles. 32 x 24.
function beetle(look, pose) {
  const p = new Pix(32, 24), c = hex(look.colour), dk = shade(c, 0.55), lt = shade(c, 1.35), eye = hex(look.eyes || '#ff5a2a');
  const dome = (cy, ry, rx, col) => { for (let y = cy - ry; y <= cy + ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2))); p.r(16 - w, y, w * 2, 1, col); } };
  if (pose === 'dead') {                                   // on its back, legs curled
    dome(17, 4, 12, dk); dome(16, 3, 9, c);
    for (const x of [5, 9, 13, 18, 22, 26]) p.r(x, 8 + (x % 3), 1, 7, c);
    return p.canvas();
  }
  const up = pose === 'windup', big = pose === 'strike', step = pose === 'step', lift = up ? 3 : 0;
  for (const side of [0, 1]) for (let i = 0; i < 3; i++) {                  // legs
    const x = side ? 25 + (step && i % 2 ? 1 : 0) : 2 - (step && i % 2 ? 1 : 0), y = 11 + i * 3 - lift;
    p.r(x, y, 5, 1, dk); p.r(side ? x + 4 : x - 1, y + 1, 1, 4, dk);
  }
  dome(11 - lift, 7, 13, c);                               // the shell
  p.r(15, 5 - lift, 2, 12, lt);                            // the seam
  dome(19 - (big ? 1 : 0), 3, 5, dk);                      // the head
  p.r(12, 18, 2, 2, eye); p.r(18, 18, 2, 2, eye);
  const open = big ? 4 : up ? 2 : 0;                       // mandibles
  p.r(10 - open, 20, 3, 3, [215, 205, 175]); p.r(19 + open, 20, 3, 3, [215, 205, 175]);
  return p.canvas();
}

const cache = {};
export function creatureFrames(def) {
  if (cache[def.id]) return cache[def.id];
  const look = def.look || { shape: 'biped', colour: '#999999' }, draw = look.shape === 'beast' ? beast : look.shape === 'beetle' ? beetle : biped, out = {};
  for (const pose of ['idle', 'step', 'windup', 'strike', 'dead']) out[pose] = draw(look, pose);
  return (cache[def.id] = out);
}
