// STAND-IN ART, drawn by code: the outer walls of the White Tower of Nut. White marble in big blocks, mostly bare, with a few
// great gilded figures on it: each picture is 16 m wide and 32 m tall, so it repeats seldom. One for each tier:
//   'eye'   a great narrow eye high up, weeping long dark tears, over two gaunt jackals that face each other (the base);
//   'wings' a winged sun over one jackal-headed figure two storeys high, with a red eye (the middle);
//   'nut'   the sky goddess arched over the wall, set with stars, and under her one eye that weeps (the top).
// Thin gold lines mark the edges, and narrow columns of gilded signs stand beside the figures.
import * as THREE from 'three';

const S = 512, SH = 1024;        // one picture: 16 m wide, 32 m tall
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function stone(g, seed) {
  const rnd = rng(seed), img = g.createImageData(S, SH), d = img.data;
  const rows = [], joints = new Uint8Array(S * SH);
  for (let y = 0; y < SH; y += 64) rows.push(y);                   // courses of big blocks, 2 m high
  for (const y0 of rows) {
    let x = Math.floor(rnd() * 160);
    for (let i = 0; i < S; i++) joints[y0 * S + i] = 1;
    while (x < S + 160) { const xx = x % S; for (let yy = y0; yy < Math.min(SH, y0 + 64); yy++) joints[yy * S + xx] = 1; x += 120 + Math.floor(rnd() * 120); }
  }
  const n1 = new Float32Array(64 * 64).map(rnd);
  const smooth = (x, y) => { const fx = x / 8, fy = y / 8, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const a = (i, j) => n1[((j & 63) * 64) + (i & 63)];
    return a(x0, y0) * (1 - u) * (1 - v) + a(x0 + 1, y0) * u * (1 - v) + a(x0, y0 + 1) * (1 - u) * v + a(x0 + 1, y0 + 1) * u * v; };
  for (let y = 0; y < SH; y++) for (let x = 0; x < S; x++) {
    let k = 0.94 + smooth(x, y) * 0.06 + (rnd() - 0.5) * 0.025;
    const vein = Math.abs(Math.sin((x * 0.013 + y * 0.004) + smooth(x * 3, y * 3) * 6));       // faint grey veins in the marble
    if (vein < 0.025) k *= 0.9;
    if (joints[y * S + x]) k *= 0.9;
    const i = (y * S + x) * 4;
    d[i] = 226 * k; d[i + 1] = 223 * k; d[i + 2] = 216 * k; d[i + 3] = 255;      // (a little under white: in full sun it still shows its veins)
  }
  g.putImageData(img, 0, 0);
}

// gold: a fill shaded from bright to deep, a dark outline, and a thin bright edge along the top
function gold(g, draw, y0 = 0, y1 = S) {
  const grd = g.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, '#f3dc94'); grd.addColorStop(0.45, '#c69a3e'); grd.addColorStop(0.7, '#e6c470'); grd.addColorStop(1, '#8d6522');
  g.save(); g.beginPath(); draw(); g.fillStyle = grd; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#4a3010'; g.stroke(); g.restore();
}
function goldLine(g, draw, w = 6) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); draw(); g.lineWidth = w + 3; g.strokeStyle = '#4a3010'; g.stroke();
  g.beginPath(); draw(); g.lineWidth = w; g.strokeStyle = '#d2a64e'; g.stroke();
  g.beginPath(); draw(); g.lineWidth = Math.max(1, w / 3); g.strokeStyle = '#fff0b0'; g.stroke(); g.restore();
}

function frieze(g, y, h) {                                         // a band of gold with lotus buds, its pattern repeating every 64 px
  gold(g, () => g.rect(0, y, S, h), y, y + h);
  if (h < 20) return;                                              // (a thin one is a plain line)
  g.fillStyle = '#3d2406';
  for (let x = 0; x < S; x += 64) {
    g.beginPath(); g.moveTo(x + 32, y + 5); g.quadraticCurveTo(x + 46, y + h / 2, x + 32, y + h - 5); g.quadraticCurveTo(x + 18, y + h / 2, x + 32, y + 5); g.fill();
    g.fillRect(x, y + h / 2 - 1, 64, 2);
  }
  g.fillStyle = '#1d5a8e';
  for (let x = 0; x < S; x += 64) { g.beginPath(); g.arc(x, y + h / 2, 5, 0, 7); g.fill(); }
}
function column(g, x, seed, y0 = 40, y1 = SH - 40) {               // a narrow column of signs, carved and gilded
  const rnd = rng(seed);
  goldLine(g, () => { g.moveTo(x - 22, y0); g.lineTo(x - 22, y1); g.moveTo(x + 22, y0); g.lineTo(x + 22, y1); }, 3);
  g.strokeStyle = g.fillStyle = '#b58a35'; g.lineWidth = 3; g.lineCap = 'round';
  for (let y = y0 + 26; y < y1 - 30; y += 46) {
    const k = Math.floor(rnd() * 5), cx = x, cy = y;
    g.beginPath();
    if (k === 0) { g.arc(cx, cy, 9, 0, 7); g.moveTo(cx, cy + 9); g.lineTo(cx, cy + 20); g.moveTo(cx - 9, cy + 14); g.lineTo(cx + 9, cy + 14); g.stroke(); }       // ankh
    else if (k === 1) { g.ellipse(cx, cy + 6, 12, 6, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy + 6, 3, 0, 7); g.fill(); }                               // eye
    else if (k === 2) { for (let i = 0; i < 3; i++) { g.moveTo(cx - 12, cy + i * 7); g.lineTo(cx - 6, cy + i * 7 - 3); g.lineTo(cx, cy + i * 7); g.lineTo(cx + 6, cy + i * 7 - 3); g.lineTo(cx + 12, cy + i * 7); } g.stroke(); }   // water
    else if (k === 3) { g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 22); for (let i = 0; i < 4; i++) { g.moveTo(cx - 9, cy + i * 5); g.lineTo(cx + 9, cy + i * 5); } g.stroke(); }    // djed
    else { g.arc(cx, cy + 8, 8, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 14, cy); g.quadraticCurveTo(cx, cy - 12, cx + 14, cy); g.stroke(); }                 // sun and horns
  }
}
function tears(g, x, y, len, seed) {                               // dark streaks running down from under an eye
  const rnd = rng(seed);
  for (let i = 0; i < 9; i++) {
    let px = x + (rnd() - 0.5) * 70, py = y;
    const l = len * (0.4 + rnd() * 0.6), w = 2 + rnd() * 4;
    g.fillStyle = `rgba(${70 + rnd() * 30},${18 + rnd() * 12},${10},${0.35 + rnd() * 0.35})`;
    for (let s = 0; s < l; s += 2) { px += (rnd() - 0.5) * 1.2; g.fillRect(px - w / 2, py + s, w, 3); }
    g.beginPath(); g.arc(px, py + l, w * 0.8, 0, 7); g.fill();
  }
}
function eyeOfHorus(g, cx, cy, w) {      // a narrow almond eye: white stone inside gold lids, a small dark iris with a red point; it stares
  const h = w * 0.26;
  goldLine(g, () => { g.moveTo(cx - w * 0.58, cy - h * 1.2); g.quadraticCurveTo(cx, cy - h * 2.1, cx + w * 0.6, cy - h * 1.3); }, 7);     // the brow
  goldLine(g, () => { g.moveTo(cx - w / 2, cy); g.quadraticCurveTo(cx, cy - h * 1.5, cx + w / 2, cy - h * 0.15); g.lineTo(cx + w * 0.78, cy - h * 0.3);
    g.moveTo(cx + w / 2, cy - h * 0.15); g.quadraticCurveTo(cx, cy + h * 1.1, cx - w / 2, cy); }, 6);                                          // the lids, and the long line out from the corner
  g.beginPath(); g.arc(cx - w * 0.02, cy - h * 0.18, h * 0.5, 0, 7); g.fillStyle = '#0d0703'; g.fill();                                     // a dark iris
  g.beginPath(); g.arc(cx - w * 0.02, cy - h * 0.18, h * 0.5, 0, 7); g.lineWidth = 3; g.strokeStyle = '#c69a3e'; g.stroke();
  g.beginPath(); g.arc(cx - w * 0.02, cy - h * 0.18, h * 0.12, 0, 7); g.fillStyle = '#a3130a'; g.fill();                                    // and a red point in it
  goldLine(g, () => { g.moveTo(cx - w * 0.1, cy + h * 0.55); g.lineTo(cx - w * 0.14, cy + h * 2.2); }, 6);                                    // the drop
  goldLine(g, () => { g.moveTo(cx + w * 0.06, cy + h * 0.55); g.quadraticCurveTo(cx + w * 0.22, cy + h * 1.4, cx + w * 0.38, cy + h * 1.6);
    g.arc(cx + w * 0.31, cy + h * 1.66, w * 0.07, 0, Math.PI * 1.5, true); }, 5);                                                             // the spiral
}
function jackal(g, cx, top, h) {                                   // a tall standing figure with a jackal's head, gilded, its eyes red
  const w = h * 0.16;
  gold(g, () => {
    g.moveTo(cx - w * 0.45, top + h * 0.2); g.lineTo(cx - w * 0.55, top + h * 0.02); g.lineTo(cx - w * 0.25, top + h * 0.12);            // an ear
    g.lineTo(cx + w * 0.05, top + h * 0.0); g.lineTo(cx + w * 0.1, top + h * 0.12);                                                         // the other
    g.lineTo(cx + w * 0.9, top + h * 0.17); g.lineTo(cx + w * 0.85, top + h * 0.22); g.lineTo(cx + w * 0.3, top + h * 0.24);               // the long snout
    g.lineTo(cx + w * 0.35, top + h * 0.3); g.lineTo(cx + w * 0.8, top + h * 0.34); g.lineTo(cx + w * 0.6, top + h * 0.62);               // shoulder, a forearm held out
    g.lineTo(cx + w * 0.42, top + h * 0.62); g.lineTo(cx + w * 0.4, top + h * 0.98); g.lineTo(cx + w * 0.1, top + h); g.lineTo(cx, top + h * 0.7);
    g.lineTo(cx - w * 0.15, top + h); g.lineTo(cx - w * 0.45, top + h * 0.98); g.lineTo(cx - w * 0.5, top + h * 0.33); g.closePath();
  }, top, top + h);
  g.beginPath(); g.ellipse(cx + w * 0.2, top + h * 0.16, w * 0.1, w * 0.045, -0.2, 0, 7); g.fillStyle = '#d01808'; g.fill();               // the eye, red
  g.fillStyle = '#1b3f7a'; g.fillRect(cx - w * 0.48, top + h * 0.42, w * 0.9, h * 0.05);                                                   // a blue belt
  g.fillStyle = '#3d2406'; g.fillRect(cx + w * 0.55, top + h * 0.3, 4, h * 0.6);                                                          // a staff
}
function wingedSun(g, cx, cy, span) {
  for (const s of [-1, 1]) for (let r = 0; r < 4; r++) {
    gold(g, () => { g.moveTo(cx + s * 30, cy - 8 + r * 12); g.quadraticCurveTo(cx + s * span * 0.3, cy - 40 + r * 14, cx + s * span / 2, cy - 26 + r * 18);
      g.lineTo(cx + s * span / 2 - s * 18, cy - 10 + r * 18); g.quadraticCurveTo(cx + s * span * 0.3, cy - 22 + r * 14, cx + s * 30, cy + 6 + r * 12); }, cy - 50, cy + 60);
  }
  gold(g, () => g.arc(cx, cy, 42, 0, 7), cy - 42, cy + 42);
  g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fillStyle = '#b8250e'; g.fill();
  for (const s of [-1, 1]) goldLine(g, () => { g.moveTo(cx + s * 30, cy + 30); g.quadraticCurveTo(cx + s * 50, cy + 60, cx + s * 30, cy + 70); }, 8);   // the cobras
}
function nutArch(g) {
  gold(g, () => { g.moveTo(26, 340); g.lineTo(46, 150); g.quadraticCurveTo(60, 70, 160, 64); g.lineTo(380, 64); g.quadraticCurveTo(452, 70, 470, 150);
    g.lineTo(488, 340); g.lineTo(462, 340); g.lineTo(446, 160); g.quadraticCurveTo(430, 96, 374, 96); g.lineTo(166, 96); g.quadraticCurveTo(82, 98, 72, 160);
    g.lineTo(54, 340); g.closePath(); }, 60, 340);
  g.fillStyle = '#123a74';                                         // stars on her body
  for (let x = 120; x < 420; x += 34) { const y = 80; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 4 : 10; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
  for (const [x, y] of [[59, 200], [59, 280], [458, 200], [458, 280]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  // her face, looking down, at the left end of the arch
  gold(g, () => { g.ellipse(104, 90, 30, 22, -0.3, 0, 7); }, 68, 112);
  g.beginPath(); g.ellipse(100, 96, 8, 4, -0.3, 0, 7); g.fillStyle = '#120a04'; g.fill();
}

function make(kind) {
  const c = document.createElement('canvas'); c.width = S; c.height = SH;
  const g = c.getContext('2d');
  stone(g, { eye: 101, wings: 202, nut: 303 }[kind]);
  frieze(g, 0, 10);                                                // a thin gold line along the panel's foot
  goldLine(g, () => { g.moveTo(4, 0); g.lineTo(4, SH); }, 3);      // a thin gilded pilaster at its edge
  if (kind === 'eye') {                                            // the base: one great eye high up, weeping long dark tears; under it two gaunt jackals facing each other
    eyeOfHorus(g, 256, 180, 240); tears(g, 250, 250, 330, 5);
    jackal(g, 150, 560, 420); g.save(); g.translate(512, 0); g.scale(-1, 1); jackal(g, 150, 560, 420); g.restore();
    column(g, 470, 7, 520, 1000);
  } else if (kind === 'wings') {                                   // the middle: a winged sun, and under it one gaunt jackal-headed figure two storeys high
    wingedSun(g, 256, 110, 420); tears(g, 256, 150, 120, 9);
    jackal(g, 236, 250, 740);
    column(g, 50, 11, 220, 1000); column(g, 462, 13, 220, 1000);
  } else {                                                         // the top: Nut arched over the panel, set with stars, and one eye under her that weeps
    g.save(); g.scale(1, 2.4); nutArch(g); g.restore();
    eyeOfHorus(g, 256, 420, 180); tears(g, 250, 470, 380, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.repeat.set(0.25, 0.125);                                       // the level's walls count one texture per 4 m; this one is 16 m wide and 32 m tall
  return t;
}

export function towerMaterials() {
  const lam = map => new THREE.MeshLambertMaterial({ map });
  return { towerEye: lam(make('eye')), towerWings: lam(make('wings')), towerNut: lam(make('nut')) };
}

// ---- stained glass: long windows of coloured panes in lead, for the tower's faces (see Windows in src/beams.js) ----
export function glassTexture(seed = 1) {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rng(seed);
  const deep = ['#0f2470', '#13306e', '#5a0b16', '#7a1020', '#0b4a4a', '#2a1258', '#1a0f40'];       // most of it dark: cobalt, crimson, teal, violet
  const fire = ['#c8861a', '#e0a52a', '#b84a10'];                                                    // and a little amber, like embers
  g.fillStyle = '#0c0805'; g.fillRect(0, 0, W, H);                                                   // the lead
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) {                                 // small diamond panes
    const set = rnd() < 0.14 ? fire : deep, col = set[Math.floor(rnd() * set.length)];
    g.fillStyle = col; g.beginPath(); g.moveTo(x + 8, y + 1); g.lineTo(x + 15, y + 8); g.lineTo(x + 8, y + 15); g.lineTo(x + 1, y + 8); g.closePath(); g.fill();
    g.fillStyle = deep[Math.floor(rnd() * deep.length)];
    for (const [cx, cy] of [[x + 1, y + 1], [x + 15, y + 1], [x + 1, y + 15], [x + 15, y + 15]]) {
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx > x + 8 ? -5 : 5), cy); g.lineTo(cx, cy + (cy > y + 8 ? -5 : 5)); g.fill();
    }
  }
  for (let y = 24; y < H; y += 64) {                                                                 // a narrow eye of glass every two metres, staring out
    g.fillStyle = '#0c0805'; g.beginPath(); g.ellipse(32, y, 22, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#d9b25a'; g.beginPath(); g.ellipse(32, y, 19, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#5a0b16'; g.beginPath(); g.arc(32, y, 6, 0, 7); g.fill();
    g.fillStyle = '#0c0805'; g.beginPath(); g.arc(32, y, 2.5, 0, 7); g.fill();
  }
  g.fillStyle = '#0c0805'; g.fillRect(31, 0, 2, H);                                                  // a lead bar up the middle
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 30; i++) g.fillRect(rnd() * W, rnd() * H, 1, 5);
  g.strokeStyle = '#b8892e'; g.lineWidth = 3; g.beginPath(); g.moveTo(1.5, 0); g.lineTo(1.5, H); g.moveTo(W - 1.5, 0); g.lineTo(W - 1.5, H); g.stroke();      // gilt sides
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
