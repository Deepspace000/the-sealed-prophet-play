// STAND-IN ART, drawn by code: the outer walls of the White Tower of Nut, and its stained glass. Each wall picture is 512 x 1024
// pixels for 16 m wide and 32 m tall of wall. One for each tier:
//   'eye'   a colossal weeping eye with a slit pupil, its dark tears running the height of the wall, over two jackal-headed gods
//           who face each other (the base);
//   'wings' a winged sun over one jackal-headed god two storeys high, striding, with a was-sceptre (the middle);
//   'nut'   the sky goddess arched over the wall, her fingers and toes on the ground, her belly full of stars, a weeping eye
//           under her (the top).
// White marble in big courses, a faint gilded lotus pattern over it, gold bands, recessed columns of signs at the sides.
// The gold is hammered: shaded across, flecked, and bevelled. (Reworked after a critic's notes: real Egyptian proportions, figures
// that fill the wall, gold that reads as gold, tears that frighten.)
import * as THREE from 'three';

const S = 512, SH = 1024;        // one picture: 16 m wide, 32 m tall
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const INK = '#2e1c08', LAPIS = '#1b3f7a', LAPIS_D = '#10285a', BLOOD = '#a3130a';

// ---- the stone ----
function stone(g, seed) {
  const rnd = rng(seed), img = g.createImageData(S, SH), d = img.data;
  const joints = new Uint8Array(S * SH);
  for (let y0 = 0; y0 < SH; y0 += 64) {                           // courses of big blocks, 2 m high, the joints cut deep
    let x = Math.floor(rnd() * 160);
    for (let i = 0; i < S; i++) { joints[y0 * S + i] = 1; if (y0 + 1 < SH) joints[(y0 + 1) * S + i] = 1; }
    while (x < S + 160) { const xx = x % S; for (let yy = y0; yy < Math.min(SH, y0 + 64); yy++) { joints[yy * S + xx] = 1; joints[yy * S + (xx + 1) % S] = 1; } x += 120 + Math.floor(rnd() * 120); }
  }
  const n1 = new Float32Array(64 * 64).map(rnd);
  const smooth = (x, y) => { const fx = x / 8, fy = y / 8, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const a = (i, j) => n1[((j & 63) * 64) + (i & 63)];
    return a(x0, y0) * (1 - u) * (1 - v) + a(x0 + 1, y0) * u * (1 - v) + a(x0, y0 + 1) * (1 - u) * v + a(x0 + 1, y0 + 1) * u * v; };
  for (let y = 0; y < SH; y++) for (let x = 0; x < S; x++) {
    let k = 0.92 + smooth(x, y) * 0.08 + (rnd() - 0.5) * 0.03;
    const vein = Math.abs(Math.sin((x * 0.013 + y * 0.004) + smooth(x * 3, y * 3) * 6));       // grey veins in the marble
    if (vein < 0.03) k *= 0.88;
    if (joints[y * S + x]) k *= 0.78;
    const warm = smooth(x * 0.5 + 300, y * 0.5) * 0.06;                 // a little warmer here and there
    const i = (y * S + x) * 4;
    d[i] = 226 * k * (1 + warm); d[i + 1] = 221 * k * (1 + warm * 0.6); d[i + 2] = 210 * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
// weathering: faint warm streaks running down the stone, darker toward the foot of each course of the panel
function weather(g, seed) {
  const rnd = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * SH, len = 80 + rnd() * 260, w = 2 + rnd() * 5;
    const grd = g.createLinearGradient(0, y, 0, y + len);
    grd.addColorStop(0, 'rgba(120,90,50,0.14)'); grd.addColorStop(1, 'rgba(120,90,50,0)');
    g.fillStyle = grd; g.fillRect(x, y, w, len);
  }
  const base = g.createLinearGradient(0, SH - 200, 0, SH);              // grime gathered at the foot
  base.addColorStop(0, 'rgba(60,45,30,0)'); base.addColorStop(1, 'rgba(60,45,30,0.35)');
  g.fillStyle = base; g.fillRect(0, SH - 200, S, 200);
}

// ---- gold leaf: shaded across, flecked, bevelled, with a fine dark outline ----
function gold(g, draw, x0 = 0, y0 = 0, x1 = S, y1 = SH, seed = 1) {
  const rnd = rng(seed * 977 + 3);
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, '#f6e3a0'); grd.addColorStop(0.35, '#d4a444'); grd.addColorStop(0.6, '#fbe9a8'); grd.addColorStop(1, '#9a6f26');
  g.save();                                                            // its shadow on the stone, so it stands off the wall
  g.shadowColor = 'rgba(74,48,16,0.35)'; g.shadowOffsetX = 3; g.shadowOffsetY = 3;
  g.beginPath(); draw(); g.fillStyle = grd; g.fill();
  g.restore();
  g.save();
  g.beginPath(); draw(); g.clip();
  const n = Math.min(900, Math.max(60, (x1 - x0) * (y1 - y0) / 160));
  for (let i = 0; i < n; i++) {                                         // hammered: light and dark flecks
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,242,184,0.8)' : 'rgba(122,85,22,0.7)';
    g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 1 + (rnd() < 0.3 ? 1 : 0), 1 + (rnd() < 0.3 ? 1 : 0));
  }
  g.lineJoin = 'round';
  g.translate(3, 3); g.beginPath(); draw(); g.lineWidth = 4; g.strokeStyle = '#fff6c8'; g.stroke();              // the lit upper-left edge
  g.translate(-6, -6); g.beginPath(); draw(); g.lineWidth = 5; g.strokeStyle = '#6e4612'; g.stroke();             // the shaded lower-right edge
  g.translate(3, 3); g.beginPath(); draw(); g.lineWidth = 12; g.strokeStyle = 'rgba(110,70,18,0.18)'; g.stroke(); // an inner shadow, inset from the edge
  g.restore();
  g.beginPath(); draw(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
}
// marble inside a gilded outline: for the bodies, so the white of the wall carries through them
function marble(g, draw, w = 5) {
  g.save(); g.shadowColor = 'rgba(74,48,16,0.3)'; g.shadowOffsetX = 3; g.shadowOffsetY = 3;
  g.beginPath(); draw(); g.fillStyle = '#f2ead6'; g.fill(); g.restore();
  goldLine(g, draw, w);
}
function goldLine(g, draw, w = 6) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); draw(); g.lineWidth = w + 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); draw(); g.lineWidth = w; g.strokeStyle = '#d4a444'; g.stroke();
  g.beginPath(); draw(); g.lineWidth = Math.max(1, w / 3); g.strokeStyle = '#fbe9a8'; g.stroke(); g.restore();
}
function lapis(g, draw) { g.beginPath(); draw(); g.fillStyle = LAPIS; g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke(); }

// ---- a faint gilded lotus pattern over the bare marble, so no wall is empty ----
function lotusField(g) {
  g.save(); g.globalAlpha = 0.16;
  for (let y = 56; y < SH; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < S + 32; x += 64) {
    g.strokeStyle = '#b8892e'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16);
    g.moveTo(x, y - 16); g.quadraticCurveTo(x - 12, y - 22, x - 9, y - 34); g.moveTo(x, y - 16); g.quadraticCurveTo(x + 12, y - 22, x + 9, y - 34);
    g.moveTo(x, y - 16); g.lineTo(x, y - 36); g.stroke();
  }
  g.restore();
}
// ---- a band of gold with lotus and lapis roundels, 40 px ----
function register(g, y, h = 24) {
  gold(g, () => g.rect(0, y, S, h), 0, y, S, y + h, y + 7);
  for (let x = 0; x < S; x += 64) {
    lapis(g, () => g.arc(x + 32, y + h / 2, h * 0.28, 0, 7));
    g.fillStyle = '#f6e3a0'; g.beginPath(); g.arc(x + 32, y + h / 2, h * 0.1, 0, 7); g.fill();
    g.fillStyle = INK; g.fillRect(x, y + 4, 2, h - 8);
    g.beginPath(); g.moveTo(x + 8, y + h - 6); g.quadraticCurveTo(x + 16, y + 6, x + 24, y + h - 6); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(x + 40, y + h - 6); g.quadraticCurveTo(x + 48, y + 6, x + 56, y + h - 6); g.stroke();
  }
}

// ---- a column of signs: a recessed band, the signs gilded and large, a fixed phrase in cartouches ----
const PHRASE = ['ankh', 'wedjat', 'water', 'djed', 'sun', 'feather'];
function glyph(g, kind, cx, cy, s) {
  g.beginPath();
  if (kind === 'ankh') { g.ellipse(cx, cy - s * 0.25, s * 0.2, s * 0.24, 0, 0, 7); g.moveTo(cx, cy - s * 0.01); g.lineTo(cx, cy + s * 0.5); g.moveTo(cx - s * 0.3, cy + s * 0.12); g.lineTo(cx + s * 0.3, cy + s * 0.12); }
  else if (kind === 'wedjat') { g.moveTo(cx - s * 0.45, cy); g.quadraticCurveTo(cx, cy - s * 0.35, cx + s * 0.45, cy - s * 0.05); g.quadraticCurveTo(cx, cy + s * 0.25, cx - s * 0.45, cy); g.moveTo(cx - s * 0.1, cy + s * 0.12); g.lineTo(cx - s * 0.15, cy + s * 0.5); }
  else if (kind === 'water') { for (let i = 0; i < 3; i++) { const y = cy - s * 0.25 + i * s * 0.25; g.moveTo(cx - s * 0.45, y); for (let k = 1; k <= 6; k++) g.lineTo(cx - s * 0.45 + k * s * 0.15, y + (k % 2 ? -s * 0.08 : s * 0.08)); } }
  else if (kind === 'djed') { g.moveTo(cx, cy - s * 0.5); g.lineTo(cx, cy + s * 0.5); for (let i = 0; i < 4; i++) { g.moveTo(cx - s * 0.3, cy - s * 0.4 + i * s * 0.14); g.lineTo(cx + s * 0.3, cy - s * 0.4 + i * s * 0.14); } }
  else if (kind === 'sun') { g.arc(cx, cy, s * 0.28, 0, 7); g.moveTo(cx + s * 0.08, cy); g.arc(cx, cy, s * 0.08, 0, 7); }
  else { g.ellipse(cx, cy, s * 0.13, s * 0.48, 0.15, 0, 7); g.moveTo(cx - s * 0.06, cy + s * 0.48); g.lineTo(cx + s * 0.1, cy - s * 0.48); }
}
function column(g, x, y0, y1) {
  g.fillStyle = 'rgba(42,26,10,0.18)'; g.fillRect(x - 30, y0, 60, y1 - y0);          // the recess
  goldLine(g, () => { g.moveTo(x - 30, y0); g.lineTo(x - 30, y1); g.moveTo(x + 30, y0); g.lineTo(x + 30, y1); }, 3);
  let n = 0;
  for (let y = y0 + 34; y < y1 - 30; y += 48, n++) {
    const kind = PHRASE[n % PHRASE.length];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    glyph(g, kind, x, y, 38); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    glyph(g, kind, x, y, 38); g.lineWidth = 5; g.strokeStyle = '#d4a444'; g.stroke();
    g.restore();
    if (n % 4 === 3) {                                                 // every fourth sign closes a cartouche
      g.save(); g.lineWidth = 3; g.strokeStyle = '#d4a444'; g.beginPath();
      g.roundRect ? g.roundRect(x - 26, y - 4 * 48 + 8, 52, 4 * 48 - 8, 24) : g.rect(x - 26, y - 4 * 48 + 8, 52, 4 * 48 - 8);
      g.stroke(); g.fillStyle = '#d4a444'; g.fillRect(x - 28, y + 22, 56, 4); g.restore();
    }
  }
}

// ---- the colossal wedjat eye: heavy brow, gold-washed white, a black iris with a slit of blood for a pupil ----
function wedjat(g, cx, cy, w, seed) {
  const h = w * 0.24;
  gold(g, () => { g.moveTo(cx - w * 0.5, cy - h * 1.15); g.quadraticCurveTo(cx, cy - h * 2.3, cx + w * 0.56, cy - h * 1.35);      // the brow, a thick band
    g.lineTo(cx + w * 0.55, cy - h * 1.05); g.quadraticCurveTo(cx, cy - h * 1.85, cx - w * 0.48, cy - h * 0.88); g.closePath(); }, cx - w / 2, cy - h * 2.3, cx + w / 2, cy - h * 0.8, seed);
  const sc = g.createRadialGradient(cx, cy - h * 0.2, h * 0.2, cx, cy - h * 0.2, w * 0.5);                                     // the white of it, washed with gold
  sc.addColorStop(0, '#f7ecd0'); sc.addColorStop(1, '#c9a050');
  g.beginPath(); g.moveTo(cx - w / 2, cy); g.quadraticCurveTo(cx, cy - h * 1.45, cx + w / 2, cy - h * 0.15); g.quadraticCurveTo(cx, cy + h * 1.05, cx - w / 2, cy);
  g.fillStyle = sc; g.fill();
  g.save(); g.clip();
  g.beginPath(); g.arc(cx - w * 0.02, cy - h * 0.2, w * 0.19, 0, 7); g.fillStyle = 'rgba(30,12,6,0.55)'; g.fill();              // a dark socket
  g.beginPath(); g.arc(cx - w * 0.02, cy - h * 0.2, w * 0.13, 0, 7); g.fillStyle = '#0a0604'; g.fill();                         // the iris
  g.beginPath(); g.ellipse(cx - w * 0.02, cy - h * 0.2, w * 0.022, w * 0.105, 0, 0, 7); g.fillStyle = BLOOD; g.fill();         // a slit pupil, red
  g.beginPath(); g.arc(cx - w * 0.06, cy - h * 0.42, w * 0.016, 0, 7); g.fillStyle = 'rgba(255,240,200,0.8)'; g.fill();       // a cold glint
  g.restore();
  goldLine(g, () => { g.moveTo(cx - w / 2, cy); g.quadraticCurveTo(cx, cy - h * 1.45, cx + w / 2, cy - h * 0.15); g.lineTo(cx + w * 0.56, cy - h * 0.3);
    g.moveTo(cx + w / 2, cy - h * 0.15); g.quadraticCurveTo(cx, cy + h * 1.05, cx - w / 2, cy); }, 10);                                   // the lids and the long line
  gold(g, () => { g.moveTo(cx - w * 0.1, cy + h * 0.55); g.lineTo(cx - w * 0.03, cy + h * 0.6); g.lineTo(cx - w * 0.07, cy + h * 2.4);
    g.lineTo(cx - w * 0.14, cy + h * 2.4); g.closePath(); }, cx - w * 0.15, cy, cx, cy + h * 2.4, seed + 1);                               // the drop, a solid bar
  goldLine(g, () => { g.moveTo(cx + w * 0.04, cy + h * 0.6); g.quadraticCurveTo(cx + w * 0.2, cy + h * 1.5, cx + w * 0.36, cy + h * 1.7);
    g.arc(cx + w * 0.29, cy + h * 1.78, w * 0.07, 0, Math.PI * 1.5, true); }, 18);                                                         // the falcon's spiral
}
// ---- tears: wide dark bands that run down the wall from the eye and pool at the foot ----
function tears(g, xs, y0, y1, seed) {
  const rnd = rng(seed);
  for (const x of xs) {
    const w = 8 + rnd() * 6, len = y1 - y0;
    const grd = g.createLinearGradient(0, y0, 0, y0 + len);
    grd.addColorStop(0, 'rgba(20,6,4,0.9)'); grd.addColorStop(0.5, 'rgba(20,6,4,0.6)'); grd.addColorStop(1, 'rgba(20,6,4,0.05)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - w / 2, y0);
    for (let y = y0; y <= y0 + len; y += 16) g.lineTo(x - w / 2 + Math.sin(y * 0.02 + x) * 2, y);
    for (let y = y0 + len; y >= y0; y -= 16) g.lineTo(x + w / 2 + Math.sin(y * 0.02 + x + 1) * 2, y);
    g.closePath(); g.fill();
    for (let k = 0; k < 3; k++) {                                       // drops of gold falling with it
      const dy = y0 + 20 + k * (28 + rnd() * 24);
      gold(g, () => { g.moveTo(x, dy - 9); g.quadraticCurveTo(x + 6, dy + 2, x, dy + 7); g.quadraticCurveTo(x - 6, dy + 2, x, dy - 9); g.closePath(); }, x - 6, dy - 9, x + 6, dy + 7, x + k);
    }
  }
}

// ---- a jackal-headed god (Anubis): profile head, frontal broad shoulders, pleated kilt, striding legs, a was-sceptre ----
// facing 1: looking right. h: his height in pixels, top: where his ears end.
function anubis(g, cx, top, h, facing, seed) {
  g.save();
  if (facing < 0) { g.translate(cx * 2, 0); g.scale(-1, 1); }
  const u = h, y = v => top + v * u, X = v => cx + v * u;
  // the was-sceptre, behind him: a forked foot, a long shaft, a beast's head at the top, bent forward
  gold(g, () => { g.rect(X(0.27), y(0.1), u * 0.02, u * 0.9); }, X(0.26), y(0.1), X(0.3), y(1), seed + 9);
  gold(g, () => { g.moveTo(X(0.265), y(0.1)); g.quadraticCurveTo(X(0.27), y(0.05), X(0.31), y(0.055)); g.lineTo(X(0.35), y(0.075));
    g.lineTo(X(0.33), y(0.09)); g.lineTo(X(0.3), y(0.08)); g.lineTo(X(0.29), y(0.12)); g.closePath(); }, X(0.26), y(0.05), X(0.35), y(0.12), seed + 10);
  goldLine(g, () => { g.moveTo(X(0.28), y(1)); g.lineTo(X(0.255), y(1.0) + 6); g.moveTo(X(0.28), y(1)); g.lineTo(X(0.305), y(1.0) + 6); }, 4);
  // legs, striding, each with a knee: the far leg back, the near one forward
  const leg = (x0, dx) => () => { g.moveTo(X(x0), y(0.66)); g.lineTo(X(x0 + 0.075), y(0.66)); g.lineTo(X(x0 + 0.07 + dx * 0.5), y(0.82));
    g.lineTo(X(x0 + 0.062 + dx), y(0.97)); g.lineTo(X(x0 + 0.005 + dx), y(0.97)); g.lineTo(X(x0 + 0.01 + dx * 0.5), y(0.825)); g.closePath(); };
  marble(g, leg(-0.1, -0.04), 4); marble(g, leg(0.0, 0.06), 4);
  gold(g, () => { g.moveTo(X(-0.15), y(0.97)); g.lineTo(X(-0.06), y(0.97)); g.lineTo(X(-0.04), y(1)); g.lineTo(X(-0.15), y(1)); g.closePath(); }, X(-0.16), y(0.96), X(-0.03), y(1), seed + 3);   // sandals
  gold(g, () => { g.moveTo(X(0.06), y(0.97)); g.lineTo(X(0.15), y(0.97)); g.lineTo(X(0.18), y(1)); g.lineTo(X(0.06), y(1)); g.closePath(); }, X(0.05), y(0.96), X(0.19), y(1), seed + 4);
  // the kilt: gold, flared, pleated, from the waist to the knee
  gold(g, () => { g.moveTo(X(-0.095), y(0.47)); g.lineTo(X(0.095), y(0.47)); g.lineTo(X(0.15), y(0.68)); g.lineTo(X(-0.13), y(0.68)); g.closePath(); }, X(-0.13), y(0.47), X(0.15), y(0.68), seed + 5);
  g.strokeStyle = '#4a3010'; g.lineWidth = 2;
  for (let i = 1; i <= 6; i++) { const t = i / 7; g.beginPath(); g.moveTo(X(-0.095 + 0.19 * t), y(0.48)); g.lineTo(X(-0.13 + 0.28 * t), y(0.67)); g.stroke(); }
  lapis(g, () => g.rect(X(-0.1), y(0.455), u * 0.2, u * 0.025));                                                // the belt
  // the torso: rounded shoulders, a waist: white marble in a gold line
  marble(g, () => { g.moveTo(X(-0.15), y(0.25)); g.quadraticCurveTo(X(-0.155), y(0.21), X(-0.1), y(0.205)); g.lineTo(X(0.1), y(0.205));
    g.quadraticCurveTo(X(0.155), y(0.21), X(0.15), y(0.25)); g.lineTo(X(0.095), y(0.46)); g.lineTo(X(-0.095), y(0.46)); g.closePath(); });
  goldLine(g, () => { g.moveTo(X(-0.07), y(0.4)); g.quadraticCurveTo(cx, y(0.415), X(0.07), y(0.4)); }, 2);      // the line of the ribs
  // arms: the far one hangs at his side, the near one bends forward, its hand on the sceptre
  marble(g, () => { g.moveTo(X(-0.155), y(0.23)); g.lineTo(X(-0.11), y(0.24)); g.lineTo(X(-0.12), y(0.4)); g.lineTo(X(-0.13), y(0.55));
    g.lineTo(X(-0.17), y(0.55)); g.lineTo(X(-0.17), y(0.4)); g.closePath(); }, 4);
  marble(g, () => { g.moveTo(X(0.11), y(0.24)); g.lineTo(X(0.155), y(0.23)); g.lineTo(X(0.17), y(0.39)); g.lineTo(X(0.27), y(0.375));
    g.lineTo(X(0.275), y(0.41)); g.lineTo(X(0.14), y(0.425)); g.closePath(); }, 4);
  gold(g, () => { g.rect(X(0.255), y(0.37), u * 0.035, u * 0.045); }, X(0.25), y(0.37), X(0.29), y(0.415), seed + 12);      // the hand round the shaft
  for (const [yy, ww] of [[0.29, 0.03], [0.5, 0.02]]) gold(g, () => g.rect(X(-0.175), y(yy), u * 0.06, u * ww), X(-0.18), y(yy), X(-0.11), y(yy + ww), seed + 13);   // gold bands on the arm
  // the broad collar, rows of lapis and gold across the shoulders
  for (let r = 0; r < 3; r++) {
    g.beginPath(); g.ellipse(cx, y(0.205), u * (0.135 - r * 0.012), u * (0.05 - r * 0.008), 0, 0, Math.PI);
    g.lineWidth = u * 0.012; g.strokeStyle = r % 2 ? '#d4a444' : LAPIS; g.stroke();
  }
  // the head in profile: a lapis wig falling behind, a long muzzle, ears not too tall, a red eye lined with kohl
  lapis(g, () => { g.moveTo(X(-0.065), y(0.1)); g.lineTo(X(0.045), y(0.1)); g.lineTo(X(0.055), y(0.205)); g.lineTo(X(-0.075), y(0.21)); g.closePath(); });
  gold(g, () => {
    g.moveTo(X(-0.045), y(0.12)); g.lineTo(X(-0.04), y(0.05)); g.lineTo(X(-0.005), y(0.09));      // the back ear
    g.lineTo(X(0.015), y(0.03)); g.lineTo(X(0.045), y(0.095));                                     // the front ear
    g.lineTo(X(0.08), y(0.105)); g.lineTo(X(0.19), y(0.13)); g.lineTo(X(0.195), y(0.143));         // brow down the long muzzle to the nose
    g.lineTo(X(0.115), y(0.152)); g.lineTo(X(0.06), y(0.175)); g.lineTo(X(-0.03), y(0.17)); g.closePath();
  }, X(-0.05), y(0.03), X(0.2), y(0.18), seed + 11);
  g.fillStyle = BLOOD; g.beginPath(); g.ellipse(X(0.065), y(0.118), u * 0.014, u * 0.006, -0.2, 0, 7); g.fill();
  g.strokeStyle = '#0a0604'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0.05), y(0.12)); g.lineTo(X(0.05) - 12, y(0.124)); g.stroke();      // the kohl line behind the eye
  g.fillStyle = '#0a0604'; g.fillRect(X(0.185), y(0.133), u * 0.012, u * 0.01);                // the nose
  g.restore();
}

// ---- the winged sun: a red disc with two cobras, great feathered wings to both edges ----
function wingedSun(g, cx, cy, span, seed) {
  for (const s of [-1, 1]) for (let r = 0; r < 4; r++) {
    gold(g, () => { g.moveTo(cx + s * 36, cy - 12 + r * 14); g.quadraticCurveTo(cx + s * span * 0.3, cy - 48 + r * 16, cx + s * span / 2, cy - 30 + r * 22);
      g.lineTo(cx + s * span / 2 - s * 22, cy - 10 + r * 22); g.quadraticCurveTo(cx + s * span * 0.3, cy - 26 + r * 16, cx + s * 36, cy + 4 + r * 14); g.closePath(); },
      cx - span / 2, cy - 60, cx + span / 2, cy + 80, seed + r * 2 + (s > 0 ? 1 : 0));
    g.strokeStyle = '#4a3010'; g.lineWidth = 1.5;
    for (let f = 0.25; f < 1; f += 0.09) { const x = cx + s * (36 + (span / 2 - 36) * f); g.beginPath(); g.moveTo(x, cy - 30 + r * 16 * (1 - f) - 10 * f + r * 6 * f); g.lineTo(x + s * 6, cy - 14 + r * 18); g.stroke(); }
  }
  lapis(g, () => { g.rect(cx - 36, cy - 6, 72, 4); });
  gold(g, () => g.arc(cx, cy, 46, 0, 7), cx - 46, cy - 46, cx + 46, cy + 46, seed + 20);
  g.beginPath(); g.arc(cx, cy, 34, 0, 7); const red = g.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 34); red.addColorStop(0, '#e0402a'); red.addColorStop(1, '#7a1008'); g.fillStyle = red; g.fill();
  for (const s of [-1, 1]) goldLine(g, () => { g.moveTo(cx + s * 34, cy + 34); g.quadraticCurveTo(cx + s * 56, cy + 62, cx + s * 36, cy + 78); g.quadraticCurveTo(cx + s * 26, cy + 86, cx + s * 30, cy + 96); }, 9);
}

// ---- Nut, the sky: a woman whose body arches over the world, her arms down one side and her legs down the other ----
function nut(g, seed) {
  // her belly, the night: a band of lapis inside the arch, set with gold stars
  g.beginPath(); g.moveTo(72, 1000); g.lineTo(72, 210); g.quadraticCurveTo(76, 112, 170, 112); g.lineTo(342, 112); g.quadraticCurveTo(436, 112, 440, 210); g.lineTo(440, 1000);
  g.lineTo(412, 1000); g.lineTo(412, 214); g.quadraticCurveTo(410, 144, 342, 142); g.lineTo(170, 142); g.quadraticCurveTo(102, 144, 100, 214); g.lineTo(100, 1000); g.closePath();
  g.fillStyle = LAPIS_D; g.fill();
  const star = (x, y, r) => gold(g, () => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); }, x - r, y - r, x + r, y + r, x + y);
  for (let x = 140; x <= 372; x += 29) star(x, 127, 9);
  for (let y = 240; y < 990; y += 44) { star(86, y, 8); star(426, y + 22, 8); }
  // her body: the arch, and her arms and legs as columns to the ground
  gold(g, () => { g.moveTo(30, 1012); g.lineTo(30, 210); g.quadraticCurveTo(32, 60, 170, 58); g.lineTo(342, 58); g.quadraticCurveTo(480, 60, 482, 210); g.lineTo(482, 1012);
    g.lineTo(440, 1012); g.lineTo(440, 210); g.quadraticCurveTo(436, 112, 342, 112); g.lineTo(170, 112); g.quadraticCurveTo(76, 112, 72, 210); g.lineTo(72, 1012); g.closePath(); }, 30, 58, 482, 1012, seed);
  // her hands, fingers spread on the ground (left) and her feet (right)
  for (let i = 0; i < 4; i++) goldLine(g, () => { g.moveTo(36 + i * 10, 1000); g.lineTo(32 + i * 11, 1018); }, 4);
  gold(g, () => { g.moveTo(440, 996); g.lineTo(500, 1006); g.lineTo(500, 1018); g.lineTo(440, 1018); g.closePath(); }, 440, 996, 500, 1018, seed + 3);
  // a breast, and a bend at her hips and shoulders, so she reads as a body
  gold(g, () => { g.moveTo(250, 112); g.quadraticCurveTo(262, 136, 280, 112); g.closePath(); }, 250, 112, 280, 136, seed + 4);
  // her head, at the left end, looking down at the earth: a lapis wig, a face in profile
  lapis(g, () => { g.moveTo(10, 150); g.quadraticCurveTo(10, 96, 66, 92); g.lineTo(74, 200); g.lineTo(20, 240); g.closePath(); });
  gold(g, () => { g.moveTo(34, 160); g.quadraticCurveTo(26, 196, 44, 218); g.lineTo(52, 232); g.lineTo(66, 226); g.lineTo(70, 196); g.lineTo(60, 160); g.closePath(); }, 26, 160, 70, 232, seed + 5);
  g.fillStyle = '#0a0604'; g.beginPath(); g.ellipse(52, 190, 6, 2.5, 1.2, 0, 7); g.fill();
  // feathers hanging under her arch: she is the sky, and the sky is a wing
  for (let x = 116; x <= 396; x += 10) gold(g, () => { g.moveTo(x - 6, 144); g.lineTo(x + 6, 144); g.lineTo(x + 5, 190); g.lineTo(x, 206); g.lineTo(x - 5, 190); g.closePath(); }, x - 6, 144, x + 6, 206, seed + x);
}

function make(kind) {
  const c = document.createElement('canvas'); c.width = S; c.height = SH;
  const g = c.getContext('2d');
  stone(g, { eye: 101, wings: 202, nut: 303 }[kind]);
  lotusField(g);
  if (kind === 'eye') {
    register(g, 0);
    column(g, 32, 44, 1020); column(g, 480, 44, 1020);
    wedjat(g, 256, 260, 430, 11);
    tears(g, [214, 244, 286], 360, 1024, 5);
    anubis(g, 150, 560, 440, 1, 21); anubis(g, 362, 560, 440, -1, 31);
  } else if (kind === 'wings') {
    register(g, 0);
    wingedSun(g, 256, 120, 470, 41);
    tears(g, [240, 272], 216, 520, 9);
    column(g, 32, 220, 1020); column(g, 480, 220, 1020);
    anubis(g, 230, 250, 760, 1, 51);
  } else {
    register(g, 0, 28);
    nut(g, 61);
    wedjat(g, 256, 420, 250, 71);
    tears(g, [228, 258, 284], 480, 1024, 3);
  }
  weather(g, { eye: 7, wings: 8, nut: 9 }[kind]);
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

// ---- stained glass: bands of coloured light in heavy lead, each with an Egyptian figure, glowing at the middle ----
export function glassTexture(seed = 1) {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rng(seed * 31 + 7);
  const deep = ['#0e3a5a', '#5a0b16', '#2a1258', '#0b4a4a', '#13306e', '#3a0a2a'];
  for (let i = 0; i < 16; i++) {                                        // small panes of deep colour, now and then amber
    const y = i * 16;
    for (let j = 0; j < 2; j++) {
      g.fillStyle = rnd() < 0.16 ? '#d08a1a' : deep[Math.floor(rnd() * deep.length)];
      g.fillRect(j * 32, y, 32, 16);
    }
  }
  const glow = g.createRadialGradient(32, H / 2, 4, 32, H / 2, 90);     // the middle glows, as if the sun stood behind it
  glow.addColorStop(0, 'rgba(255,208,112,0.55)'); glow.addColorStop(1, 'rgba(255,208,112,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const fig = (kind, cy) => {                                           // a figure, leaded, with a lighter stripe down it, a halo behind
    const halo = g.createRadialGradient(32, cy, 2, 32, cy, 30); halo.addColorStop(0, 'rgba(255,224,150,0.6)'); halo.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = halo; g.fillRect(0, cy - 32, W, 64);
    const shape = () => {
      g.beginPath();
      if (kind === 0) { g.ellipse(32, cy - 12, 9, 11, 0, 0, 7); g.moveTo(29, cy - 2); g.rect(29, cy - 2, 6, 26); g.rect(18, cy + 3, 28, 6); }          // ankh
      else if (kind === 1) { g.ellipse(32, cy + 3, 13, 17, 0, 0, 7); g.moveTo(40, cy - 18); g.arc(32, cy - 18, 8, 0, 7); }                            // scarab
      else if (kind === 2) { g.arc(32, cy, 17, 0, 7); }                                                                                              // sun disc
      else { g.rect(29, cy - 26, 6, 52); for (let k = 0; k < 4; k++) g.rect(19, cy - 20 + k * 8, 26, 4); }                                           // djed
    };
    shape(); g.fillStyle = ['#c8901e', '#1e3c8a', '#a0180e', '#c8901e'][kind]; g.fill('evenodd');
    g.save(); shape(); g.clip(); g.fillStyle = 'rgba(255,240,200,0.35)'; g.fillRect(28, cy - 30, 4, 60); g.restore();       // the lighter stripe
    shape(); g.lineWidth = 3; g.strokeStyle = '#0a0604'; g.stroke();                                                         // its lead
  };
  for (let i = 0; i < 4; i++) fig((i + seed) % 4, 32 + i * 64);
  g.strokeStyle = '#0a0604'; g.lineWidth = 3;                           // the lead of the panes
  for (let y = 0; y <= H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (const x of [1.5, 32, W - 1.5]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
