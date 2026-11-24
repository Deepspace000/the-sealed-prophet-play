// The opening: a title card, then the journal, shown line by line over a moving scene
// (an aeroplane over the desert, the pyramids, a landing by a village), then the accident
// and a fade to black. The words are in data/intro.json.
// The scene is painted in the manner of an Egyptian urn: a clay ground, black figures in
// profile with fine detail, flat earth colours, and patterned bands above and below.
//
// STAND-IN ART AND MUSIC. The scene is drawn by code and the music is made by code,
// so the opening can be seen and timed. Both are to be replaced by real art and music.
import { MUTED } from './sound.js';

const W = 384, H = 216;                      // drawing units; the canvas is SHARP times finer
const SHARP = 3;
const TOP = 24, BOTTOM = 190;                // the picture sits between two patterned bands, like the frieze round an urn
const HORIZON = 136, GROUND = 172;
const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// The colours of painted pottery and tomb walls.
const INK = [26, 18, 12], CREAM = [236, 220, 180], ROSE = [226, 170, 122], OCHRE = [203, 146, 64], RED = [166, 70, 42],
  UMBER = [118, 58, 34], BLUE = [45, 95, 143], TURQ = [62, 160, 152], GOLD = [222, 186, 92], LAPIS = [30, 56, 108], DEEP = [12, 20, 48];

// ---------------------------------------------------------------- the moving scene
class Scene {
  constructor(canvas) {
    canvas.width = W * SHARP; canvas.height = H * SHARP;
    this.g = canvas.getContext('2d');
    this.t = 0; this.scroll = 0; this.speed = 60;
    this.mode = 'flight';
    this.land = 0;            // 0 in the air .. 1 stopped on the ground
    this.landT = -1; this.villageX = null;
    this.dusk = 0; this.night = 0; this.dark = 0; this.shake = 0; this.cut = 0; this.dust = [];
  }
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== 'flight' && this.landT < 0) {       // begin the landing: the village will be at 325 when we stop
      this.landT = 0;
      this.villageX = this.scroll + 270 + 325;
    }
  }
  caveIn() {
    this.shake = 1; this.cut = 1.2;
    for (let i = 0; i < 110; i++) this.dust.push([Math.random() * W, -Math.random() * 140, 26 + Math.random() * 80, 0.6 + Math.random() * 1.4]);
  }
  update(dt) {
    if (this.mode !== 'dark') this.t += dt;          // on the last page everything holds still
    if (this.landT >= 0) {
      this.landT += dt;
      this.speed = Math.max(0, 60 * (1 - this.landT / 9));
      this.land = clamp01(this.landT / 9);
    }
    this.scroll += this.speed * dt;
    const toward = (v, want, rate) => v + Math.sign(want - v) * Math.min(Math.abs(want - v), dt * rate);
    this.dusk = toward(this.dusk, this.mode === 'landing' ? 1 : 0, 1 / 6);
    this.night = toward(this.night, this.mode === 'night' || this.mode === 'dark' ? 1 : 0, 1 / 7);
    if (this.mode === 'dark') this.dark = Math.min(1, this.dark + dt / 6);
    this.shake = Math.max(0, this.shake - dt / 3);
    this.cut = Math.max(0, this.cut - dt);
    for (const d of this.dust) d[1] += d[2] * dt;
  }

  // ---- small drawing helpers
  poly(pts, x, y, s = 1, flip = 1) {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](x + p[0] * s * flip, y + p[1] * s));
    g.closePath(); g.fill();
    if (this.rim > 0.02) { g.save(); g.strokeStyle = css(GOLD, this.rim * 0.8); g.lineWidth = 0.5; g.stroke(); g.restore(); }
  }
  line(pts, colour, w = 0.6) {
    const g = this.g;
    g.strokeStyle = colour; g.lineWidth = w; g.beginPath();
    pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
    g.stroke();
  }
  hillY(x, base, a, l1, b, l2, off) { return base - a * Math.sin((x + off) / l1) - b * Math.sin((x + off) / l2 + 1); }
  hills(base, a, l1, b, l2, off, fill, speck) {
    const g = this.g;
    g.fillStyle = fill; g.beginPath(); g.moveTo(-4, H);
    for (let x = -4; x <= W + 4; x += 3) g.lineTo(x, this.hillY(x, base, a, l1, b, l2, off));
    g.lineTo(W + 4, H); g.closePath(); g.fill();
    g.strokeStyle = css(INK, 0.75); g.lineWidth = 0.6; g.beginPath();
    for (let x = -4; x <= W + 4; x += 3) g[x < 0 ? 'moveTo' : 'lineTo'](x, this.hillY(x, base, a, l1, b, l2, off));
    g.stroke();
    g.fillStyle = speck;                               // the dotted ground that means "desert" in Egyptian painting
    for (let i = 0; i < 70; i++) {
      const x = (((i * 41.3 - off) % (W + 16)) + W + 16) % (W + 16) - 8;
      g.fillRect(x, this.hillY(x, base, a, l1, b, l2, off) + 3 + (i * 7 % 13), 0.7, 0.7);
    }
  }

  draw() {
    const g = this.g, n = this.night, u = this.dusk * (1 - n);
    g.setTransform(SHARP, 0, 0, SHARP, 0, 0);
    if (this.cut > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
    this.rim = n;                                       // at night the figures are picked out in gold
    g.save();
    if (this.shake) g.translate((Math.random() - 0.5) * 9 * this.shake, (Math.random() - 0.5) * 7 * this.shake);

    // the ground of the pot: cream by day, rose at dusk, lapis at night
    g.fillStyle = css(mix(mix(CREAM, ROSE, u), LAPIS, n)); g.fillRect(-10, -10, W + 20, H + 20);

    // night: gold five-rayed stars in rows, as on a tomb ceiling
    if (n > 0.3) {
      const a = clamp01((n - 0.3) / 0.7);
      for (let row = 0; row < 6; row++) for (let col = 0; col < 13; col++) {
        const x = col * 31 + (row % 2) * 15.5 + 6, y = TOP + 10 + row * 17;
        if (y > HORIZON - 6) continue;
        const tw = 0.55 + 0.45 * Math.sin(this.t * 0.6 + col * 1.7 + row * 2.3);
        g.strokeStyle = css(GOLD, a * tw); g.lineWidth = 0.5; g.beginPath();
        for (let k = 0; k < 5; k++) {
          const an = -Math.PI / 2 + k * Math.PI * 2 / 5;
          g.moveTo(x, y); g.lineTo(x + Math.cos(an) * 2.6, y + Math.sin(an) * 2.6);
        }
        g.stroke();
      }
    }

    this.sun(300, 62, n);

    // far hills, with the pyramids standing on them
    const fs = this.scroll * 0.3;
    const farC = mix(mix(OCHRE, [196, 120, 70], u), [50, 82, 138], n);
    this.hills(HORIZON, 5, 74, 3, 26, fs, css(farC), css(RED, 0.45 * (1 - n)));
    const gx = ((560 - fs) % 900 + 900) % 900 - 170;
    this.river(gx, n);
    for (const [dx, size] of [[-46, 34], [46, 30], [0, 56]]) this.pyramid(gx + dx, HORIZON + 3, size, n, u);
    if (this.land < 0.5 && n < 0.5) this.ibises(1 - this.land * 2);
    this.hills(HORIZON + 14, 6, 58, 3, 19, this.scroll * 0.6, css(mix(mix(RED, [150, 70, 50], u), [36, 62, 116], n)), css(INK, 0.3));

    // the door in the rock: it is only seen once night has come
    if (n > 0.05) this.tombDoor(252, HORIZON + 12, n);

    this.hills(GROUND, 3, 44, 1, 13, this.scroll, css(mix(mix(UMBER, [96, 46, 34], u), [18, 34, 76], n)), css(CREAM, 0.25));

    if (this.villageX != null) {
      const A = this.villageX - this.scroll;
      if (A > -180 && A < W + 180) this.village(A, n);
    }

    // the aeroplane and its shadow
    const air = 1 - ease(clamp01(this.land / 0.78));               // 1 high up .. 0 wheels on the ground
    const px = lerp(180, 226, air) + Math.sin(this.t * 0.3) * 6 * air;
    const py = lerp(GROUND - 11, 88, air) + Math.sin(this.t * 1.1) * 2.2 * air;
    g.fillStyle = css(INK, 0.25 * (1 - n * 0.6));
    g.beginPath(); g.ellipse(px + 14 * air, GROUND + 4, 24 - 12 * air, 2.4 - 1.2 * air, 0, 0, 7); g.fill();
    this.plane(px, py, air > 0.02 ? -0.03 + 0.12 * (1 - air) * air * 4 : 0);

    g.fillStyle = css(CREAM, 0.75);
    for (const d of this.dust) if (d[1] > TOP && d[1] < BOTTOM) g.fillRect(d[0], d[1], d[3], d[3]);
    g.restore();

    // the last page: the dark closes in like an iris round the door
    if (this.dark > 0) {
      const r = lerp(330, 16, ease(this.dark));
      const gr = g.createRadialGradient(252, HORIZON + 4, r * 0.55, 252, HORIZON + 4, r);
      gr.addColorStop(0, 'rgba(8,3,2,0)'); gr.addColorStop(1, 'rgba(8,3,2,0.97)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // the curve of the pot: the sides fall away into shadow
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(40,18,6,0.5)'); side.addColorStop(0.2, 'rgba(40,18,6,0)');
    side.addColorStop(0.8, 'rgba(40,18,6,0)'); side.addColorStop(1, 'rgba(40,18,6,0.5)');
    g.fillStyle = side; g.fillRect(0, 0, W, H);

    this.bands(n);
  }

  // The winged sun, with thin rays that end in small hands.
  sun(x, y, n) {
    const g = this.g, a = 1 - n;
    if (a > 0.02) {
      for (let i = 0; i < 11; i++) {
        const an = Math.PI * (0.14 + i * 0.072) + Math.sin(this.t * 0.25 + i) * 0.012, len = 60 + (i % 3) * 16;
        const ex = x + Math.cos(an) * len, ey = y + Math.sin(an) * len;
        g.strokeStyle = css(OCHRE, 0.55 * a); g.lineWidth = 0.45;
        g.beginPath(); g.moveTo(x + Math.cos(an) * 12, y + Math.sin(an) * 12); g.lineTo(ex, ey);
        for (const s of [-0.5, 0, 0.5]) { g.moveTo(ex, ey); g.lineTo(ex + Math.cos(an + s) * 2.6, ey + Math.sin(an + s) * 2.6); }
        g.stroke();
      }
      for (const flip of [1, -1]) {
        [[BLUE, 50], [TURQ, 42], [GOLD, 33]].forEach(([c, len], k) => {
          g.fillStyle = css(c, a); g.strokeStyle = css(INK, 0.8 * a); g.lineWidth = 0.4;
          g.beginPath();
          g.moveTo(x + flip * 10, y - 5 + k * 3.4);
          g.quadraticCurveTo(x + flip * 30, y - 9 + k * 3.4, x + flip * len, y - 8 + k * 2.6);
          g.lineTo(x + flip * (len - 3), y - 3 + k * 3.2);
          g.quadraticCurveTo(x + flip * 28, y - 3.5 + k * 4.4, x + flip * 10, y - 1 + k * 3.4);
          g.closePath(); g.fill(); g.stroke();
          for (let f = 14; f < len - 2; f += 4) {                  // feathers
            g.beginPath(); g.moveTo(x + flip * f, y - 6.6 + k * 3.3); g.lineTo(x + flip * (f - 1), y - 2.6 + k * 3.6); g.stroke();
          }
        });
      }
    }
    g.fillStyle = css(mix(RED, GOLD, n)); g.beginPath(); g.arc(x, y, lerp(10, 7, n), 0, 7); g.fill();
    g.strokeStyle = css(GOLD); g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, lerp(11.4, 8, n), 0, 7); g.stroke();
    g.strokeStyle = css(INK, 0.8); g.lineWidth = 0.4; g.beginPath(); g.arc(x, y, lerp(12.4, 9, n), 0, 7); g.stroke();
    if (n > 0.3) {                                        // by night the disc is the moon: a sliver is cut away
      g.fillStyle = css(mix(CREAM, LAPIS, n)); g.beginPath(); g.arc(x + 3.2, y - 1.4, 6.2, 0, 7); g.fill();
    }
  }

  pyramid(x, base, size, n, u) {
    const g = this.g, h = size * 0.72, lit = mix(mix([232, 196, 120], [220, 160, 110], u), [86, 116, 170], n);
    g.fillStyle = css(lit); this.rim = 0;
    this.poly([[-size / 2, 0], [0, -h], [size * 0.14, 0]], x, base);
    g.fillStyle = css(mix(lit, INK, 0.38)); this.poly([[size * 0.14, 0], [0, -h], [size / 2, 0]], x, base);
    g.strokeStyle = css(INK, 0.28); g.lineWidth = 0.35;
    for (let k = 1; k < 7; k++) {                         // courses of stone
      const t = k / 7; g.beginPath(); g.moveTo(x - size / 2 * (1 - t), base - h * t); g.lineTo(x + size / 2 * (1 - t), base - h * t); g.stroke();
    }
    this.line([[x - size / 2, base], [x, base - h], [x + size / 2, base]], css(INK, 0.85), 0.6);
    this.line([[x, base - h], [x + size * 0.14, base]], css(INK, 0.5), 0.4);
    g.fillStyle = css(GOLD); this.poly([[-2.2, 0], [0, -3.2], [2.2, 0]], x, base - h + 3.2);       // the gilded tip
    this.rim = n;
  }

  // The river: a thin green thread beside the pyramids, drawn with the zigzag that means water.
  river(gx, n) {
    const g = this.g, y = x => HORIZON + 9 + 2.2 * Math.sin((x - gx) / 34), x0 = gx - 190, x1 = gx + 190;
    if (x1 < -10 || x0 > W + 10) return;
    const wide = x => 2.6 * Math.sin(Math.PI * (x - x0) / (x1 - x0));
    g.fillStyle = css(mix([58, 132, 96], [24, 60, 110], n));
    g.beginPath();
    for (let x = x0; x <= x1; x += 6) g[x === x0 ? 'moveTo' : 'lineTo'](x, y(x) - wide(x) - 1.2);
    for (let x = x1; x >= x0; x -= 6) g.lineTo(x, y(x) + wide(x) + 1.2);
    g.closePath(); g.fill();
    g.strokeStyle = css(mix(TURQ, GOLD, n), 0.95); g.lineWidth = 0.7; g.beginPath();
    for (let x = x0 + 8, i = 0; x <= x1 - 8; x += 3, i++) g[i ? 'lineTo' : 'moveTo'](x, y(x) + (i % 2 ? -1 : 1) * Math.min(1, wide(x) * 0.5));
    g.stroke();
  }

  // Three ibises crossing, long necks out in front, as they are painted in the marsh scenes.
  ibises(a) {
    const g = this.g, bx = W + 50 - ((this.t * 11) % (W + 220)), by = 112 + Math.sin(this.t * 0.4) * 4;
    g.strokeStyle = css(INK, 0.85 * a); g.fillStyle = css(INK, 0.85 * a); g.lineWidth = 0.7; g.lineCap = 'round';
    [[0, 0], [15, -6], [17, 7]].forEach(([dx, dy], i) => {
      const x = bx + dx, y = by + dy, flap = Math.sin(this.t * 5 + i * 1.3) * 3.4;
      g.beginPath(); g.ellipse(x, y, 3.4, 1.1, 0, 0, 7); g.fill();
      g.beginPath();
      g.moveTo(x - 3, y); g.lineTo(x - 8, y - 1.2); g.quadraticCurveTo(x - 10.4, y - 1.2, x - 11.2, y + 0.8);     // neck and curved beak
      g.moveTo(x + 3, y); g.lineTo(x + 7.4, y + 0.8);                                                             // legs trailing
      g.moveTo(x - 0.5, y - 0.6); g.quadraticCurveTo(x + 1, y - 3 - flap, x + 4.6, y - 4 - flap * 1.5);           // wing
      g.stroke();
    });
    g.lineCap = 'butt';
  }

  // A rock face with a door of nested frames, and a cold light breathing in it.
  tombDoor(x, y, n) {
    const g = this.g, a = clamp01(n * 1.4);
    g.save(); g.globalAlpha = a; this.rim = 0;
    g.fillStyle = css([20, 30, 66]);
    this.poly([[-30, 0], [-22, -24], [-10, -30], [12, -30], [24, -22], [31, 0]], x, y);
    this.line([[x - 30, y], [x - 22, y - 24], [x - 10, y - 30], [x + 12, y - 30], [x + 24, y - 22], [x + 31, y]], css(INK, 0.9), 0.6);
    const breath = 0.35 + 0.3 * Math.sin(this.t * 1.05);
    const halo = g.createRadialGradient(x, y - 9, 1, x, y - 9, 26);
    halo.addColorStop(0, css(TURQ, 0.3 * breath)); halo.addColorStop(1, css(TURQ, 0));
    g.fillStyle = halo; g.fillRect(x - 28, y - 36, 56, 40);
    for (const [w, h, c] of [[15, 21, GOLD], [11, 18, INK], [7, 15, [34, 46, 86]], [3.4, 12, INK]]) {
      g.fillStyle = css(c); g.fillRect(x - w / 2, y - h, w, h);
    }
    g.fillStyle = css(TURQ, breath); g.fillRect(x - 0.7, y - 11, 1.4, 11);
    g.restore(); this.rim = n;
  }

  village(A, n) {
    const g = this.g, y = GROUND - 1;
    const wall = mix(CREAM, [70, 92, 140], n), door = mix(BLUE, GOLD, clamp01(n * 1.5));
    for (const [hx, hw, hh] of [[-8, 34, 27], [32, 26, 20], [62, 24, 16]]) {
      g.fillStyle = css(wall); g.fillRect(A + hx, y - hh, hw, hh);
      g.strokeStyle = css(INK, 0.85); g.lineWidth = 0.6; g.strokeRect(A + hx, y - hh, hw, hh);
      g.fillStyle = css(RED); g.fillRect(A + hx - 1.5, y - hh - 2.2, hw + 3, 2.2);
      g.fillStyle = css(door); g.fillRect(A + hx + hw * 0.36, y - hh * 0.46, hw * 0.2, hh * 0.46);
      g.fillStyle = css(mix(INK, GOLD, n)); g.fillRect(A + hx + hw * 0.68, y - hh * 0.78, 3, 3.6);
    }
    for (const [px, h] of [[-32, 44], [96, 38]]) this.palm(A + px, y, h);

    const camel = [[2, -8], [3, -12], [6, -13], [8, -16], [11, -13], [14, -13], [16, -15], [17, -20], [21, -21], [22, -19], [19, -17],
      [18, -12], [17, -8], [17, 0], [15.5, 0], [15, -7], [7, -7], [6.5, 0], [5, 0], [4.5, -7]];
    for (const [cx, s] of [[-64, 1.25], [-87, 1.1], [-110, 1.2]]) {
      g.fillStyle = css(INK); this.poly(camel, A + cx, y, s);
      g.fillStyle = css(CREAM); g.fillRect(A + cx + 6 * s, y - 13.4 * s, 7 * s, 4.4 * s);          // saddle cloth
      g.fillStyle = css(RED); g.fillRect(A + cx + 6 * s, y - 12.2 * s, 7 * s, 0.9 * s);
      g.fillStyle = css(BLUE); g.fillRect(A + cx + 6 * s, y - 10.6 * s, 7 * s, 0.9 * s);
      g.fillStyle = css(CREAM); g.fillRect(A + cx + 20 * s, y - 20 * s, 0.7, 0.7);                  // eye
    }
    this.guide(A - 44, y, 1.05, 1, 'hail');
    this.guide(A - 118, y, 1.0, -1, 'staff');
    this.guide(A - 20, y, 1.1, n > 0.5 ? -1 : 1, 'staff');     // at night he turns to look toward the door
    this.guide(A + 26, y, 0.95, -1, 'hail');
  }

  palm(x, y, h) {
    const g = this.g, ty = y - h;
    g.strokeStyle = css(INK); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, ty); g.stroke();
    g.strokeStyle = css(CREAM, 0.5); g.lineWidth = 0.4;
    for (let k = 4; k < h - 4; k += 4) { g.beginPath(); g.moveTo(x - 1, y - k); g.lineTo(x + 1, y - k - 1); g.stroke(); }
    g.strokeStyle = css(INK); g.lineWidth = 1.3;
    for (let k = 0; k < 9; k++) {                               // an even fan of fronds, as the Egyptians drew it
      const a = Math.PI * (0.06 + k * 0.11);
      g.beginPath(); g.moveTo(x, ty);
      g.quadraticCurveTo(x - Math.cos(a) * 10, ty - Math.sin(a) * 12 - 2, x - Math.cos(a) * 17, ty - Math.sin(a) * 7 + 6); g.stroke();
    }
    g.fillStyle = css(RED);
    for (const [dx, dy] of [[-2.4, 3], [2.4, 3], [-1.2, 5], [1.2, 5], [0, 7]]) { g.beginPath(); g.arc(x + dx, ty + dy, 1.1, 0, 7); g.fill(); }
  }

  // A figure in the Egyptian manner: shoulders square to us, head and feet in profile.
  guide(x, y, s, face, pose) {
    const g = this.g;
    g.fillStyle = css(INK);
    this.poly([[-2.6, 0], [2.6, 0], [1.5, -7], [-1.5, -7]], x, y, s);                  // the long robe
    this.poly([[-2.6, -12], [2.6, -12], [1.5, -7], [-1.5, -7]], x, y, s);              // shoulders
    g.beginPath(); g.arc(x + face * 0.4 * s, y - 14.2 * s, 1.8 * s, 0, 7); g.fill();
    this.poly([[-1.9, -15.4], [-2.6, -11.6], [-0.6, -12.2]], x, y, s, face);           // head cloth
    g.strokeStyle = css(INK); g.lineWidth = 0.9 * s; g.beginPath();
    if (pose === 'hail') { g.moveTo(x + face * 2.3 * s, y - 11.4 * s); g.lineTo(x + face * 5 * s, y - 9.4 * s); g.lineTo(x + face * 6.4 * s, y - 14 * s); }
    else { g.moveTo(x + face * 2.3 * s, y - 11.4 * s); g.lineTo(x + face * 4.6 * s, y - 8 * s); g.moveTo(x + face * 4.6 * s, y); g.lineTo(x + face * 4.6 * s, y - 17 * s); }
    g.stroke();
    g.fillStyle = css(CREAM); g.fillRect(x - 1.5 * s, y - 7.5 * s, 3 * s, 0.8 * s);                 // sash
    g.fillRect(x + face * 1.1 * s, y - 14.6 * s, 0.6, 0.6);                                          // eye
  }

  plane(x, y, tilt) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(-tilt);
    g.fillStyle = css(INK); g.strokeStyle = css(INK); g.lineWidth = 1.1;
    this.poly([[-26, -1], [-24, -4], [-6, -5], [8, -5], [16, -3], [20, 0], [16, 3], [-4, 4], [-20, 2]], 0, 0);
    this.poly([[-26, -1], [-31, -11], [-25, -11], [-19, -4]], 0, 0);
    this.poly([[-32, -3], [-21, -3], [-21, -1], [-32, -1]], 0, 0);
    this.poly([[-10, -14.5], [16, -14.5], [17, -12], [-11, -12]], 0, 0);
    this.poly([[-8, 2], [16, 2], [15, 4.6], [-7, 4.6]], 0, 0);
    for (const [ax, ay, bx, by] of [[-4, -12, -2, 3], [11, -12, 11, 3], [2, 4, 5, 9], [8, 4, 5, 9], [-20, 2, -22, 6]]) {
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    g.beginPath(); g.arc(5, 9, 2.6, 0, 7); g.fill();
    // fine painted detail, as a potter would add it: a band along the body, feathers on the wing, a striped tail
    g.strokeStyle = css(CREAM, 0.9); g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(-18, -1); g.lineTo(14, -1.6); g.stroke();
    for (let f = -8; f <= 14; f += 2.4) { g.beginPath(); g.moveTo(f, -14); g.lineTo(f - 0.6, -12.4); g.stroke(); }
    g.fillStyle = css(RED); this.rim = 0; this.poly([[-29.4, -9.4], [-25, -9.4], [-23.6, -7.4], [-28.4, -7.4]], 0, 0);
    g.fillStyle = css(TURQ); this.poly([[-28, -6.6], [-23, -6.6], [-21.6, -4.8], [-27, -4.8]], 0, 0); this.rim = this.night;
    g.fillStyle = css(GOLD); g.beginPath(); g.arc(3, -1.4, 1.5, 0, 7); g.fill();
    const spin = this.land < 1 ? 1 : Math.max(0, 1 - (this.landT - 9) / 3);              // the propeller runs down after landing
    g.strokeStyle = css(INK, 0.8); g.lineWidth = 0.9;
    const ph = spin > 0.05 ? 10 * Math.abs(Math.sin(this.t * 40 * spin)) + 2 : 10;
    g.beginPath(); g.moveTo(21, -ph); g.lineTo(21, ph); g.stroke();
    g.restore();
  }

  // The patterned bands above and below: lotus and bud, the eye, and the zigzag that means water.
  bands(n) {
    const g = this.g, bg = mix(RED, DEEP, n), fine = mix(CREAM, GOLD, n);
    g.fillStyle = css(bg); g.fillRect(0, 0, W, TOP); g.fillRect(0, BOTTOM, W, H - BOTTOM);
    for (const y of [1.6, TOP - 1.6, BOTTOM + 1.6, H - 1.6]) this.line([[0, y], [W, y]], css(GOLD), 0.8);
    this.line([[0, TOP - 3.4], [W, TOP - 3.4]], css(INK, 0.6), 0.4);
    for (let i = 0, x = 8; x < W; x += 12, i++) {
      if (Math.abs(x - W / 2) < 22) continue;                    // room for the eye
      const by = TOP - 4.4;
      if (i % 2) {                                               // bud
        g.fillStyle = css(TURQ); g.beginPath(); g.ellipse(x, by - 5.4, 1.6, 4.6, 0, 0, 7); g.fill();
      } else {                                                   // open lotus
        [[-0.95, BLUE], [-0.48, fine], [0, BLUE], [0.48, fine], [0.95, BLUE]].forEach(([an, c]) => {
          g.fillStyle = css(c); g.beginPath(); g.moveTo(x - 0.9, by); g.lineTo(x + Math.sin(an) * 11.5, by - Math.cos(an) * 11.5 * 1.1);
          g.lineTo(x + 0.9, by); g.closePath(); g.fill();
        });
      }
      g.strokeStyle = css(fine, 0.8); g.lineWidth = 0.4;
      g.beginPath(); g.arc(x + 6, by, 6, 0, Math.PI); g.stroke();   // looping stems
    }
    this.eye(W / 2, TOP / 2 + 0.5, n);
    for (let k = 0; k < 3; k++) {                                // water
      g.strokeStyle = css(k === 1 ? TURQ : mix(BLUE, fine, n), 0.95); g.lineWidth = 0.9; g.beginPath();
      const drift = this.t * 2.2;
      for (let x = -8; x <= W + 8; x += 4) {
        const yy = BOTTOM + 6.5 + k * 4.2 + (((x + 800) / 4 | 0) % 2 ? -1.7 : 1.7);
        g[x === -8 ? 'moveTo' : 'lineTo'](x - (drift % 8), yy);
      }
      g.stroke();
    }
    for (let x = 0, i = 0; x < W; x += 3.6, i++) { g.fillStyle = css(i % 2 ? fine : INK); g.fillRect(x, H - 6.2, 3.6, 3.2); }
  }

  // The eye of Horus. It is faint by day and wakes as the night comes on.
  eye(x, y, n) {
    const g = this.g, a = 0.42 + 0.58 * n;
    g.fillStyle = css(mix(RED, DEEP, n)); g.fillRect(x - 21, 2.6, 42, TOP - 5.2);
    g.strokeStyle = css(mix(CREAM, TURQ, n), a); g.lineWidth = 0.9; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 9, y); g.quadraticCurveTo(x, y - 6.4, x + 9, y); g.quadraticCurveTo(x, y + 4.6, x - 9, y);          // the eye
    g.moveTo(x - 11, y - 4.6); g.quadraticCurveTo(x, y - 10, x + 13, y - 4);                                         // the brow
    g.moveTo(x + 9, y); g.lineTo(x + 15, y + 1.2);                                                                    // the outer line
    g.moveTo(x - 1, y + 3.4); g.lineTo(x - 2.6, y + 8);                                                               // the tear
    g.moveTo(x + 1.6, y + 3.2); g.quadraticCurveTo(x + 7, y + 9.6, x + 12, y + 6.4); g.quadraticCurveTo(x + 13.6, y + 4.6, x + 11.6, y + 4.6);   // the curl
    g.stroke();
    g.fillStyle = css(mix(CREAM, TURQ, n), a); g.beginPath(); g.arc(x, y - 0.5, 2.3, 0, 7); g.fill();
    g.lineCap = 'butt';
  }
}

// ---------------------------------------------------------------- the music
// D with the flattened second and raised third: the scale the ear hears as "Egypt".
const SCALE = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33];
const TUNE = [[4, 3], [5, 1], [4, 2], [3, 2], [2, 3], [1, 1], [2, 2], [0, 2], [null, 2], [0, 1], [1, 1], [2, 2], [3, 2], [4, 6], [null, 2],
  [7, 3], [6, 1], [5, 2], [4, 2], [5, 3], [4, 1], [3, 2], [2, 2], [1, 2], [2, 2], [1, 2], [0, 2], [0, 6], [null, 2]];

class Music {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = this.ac = new AC();
    this.master = ac.createGain(); this.master.gain.value = 0; this.master.connect(ac.destination);
    const delay = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
    delay.delayTime.value = 0.42; fb.gain.value = 0.4; wet.gain.value = 0.32;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.bus = ac.createGain(); this.bus.connect(this.master); this.bus.connect(delay);
    this.master.gain.linearRampToValueAtTime(MUTED ? 0 : 0.85, ac.currentTime + 3);

    // a low drone, and a glassy pad above it that swells slowly
    this.droneFilter = ac.createBiquadFilter(); this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 420;
    this.droneGain = ac.createGain(); this.droneGain.gain.value = 0.5;
    this.droneFilter.connect(this.droneGain); this.droneGain.connect(this.bus);
    for (const [f, d] of [[73.42, -4], [73.42, 5], [110, -3], [110, 4]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; og.gain.value = 0.11;
      o.connect(og); og.connect(this.droneFilter); o.start();
    }
    this.pad = ac.createGain(); this.pad.gain.value = 0; this.pad.connect(this.bus);
    this.pad.gain.linearRampToValueAtTime(0.5, ac.currentTime + 8);
    [293.66, 440, 587.33, 880].forEach((f, i) => {
      const o = ac.createOscillator(), og = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      o.frequency.value = f; og.gain.value = 0.03; l.frequency.value = 0.07 + i * 0.03; lg.gain.value = 0.025;
      l.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(this.pad); o.start(); l.start();
    });
    this.grim = ac.createGain(); this.grim.gain.value = 0; this.grim.connect(this.bus);       // the wrong note, for the last page
    for (const f of [77.78, 38.89]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ac.createBiquadFilter(); lp.frequency.value = 200; o.connect(lp); lp.connect(this.grim); o.start(); }

    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.tune = [];
    for (const [deg, n] of TUNE) { this.tune.push([deg, n]); for (let i = 1; i < n; i++) this.tune.push(null); }
    this.mood = 'flight'; this.step = 0; this.eighth = 0.36; this.next = ac.currentTime + 1.2;
    this.timer = setInterval(() => this.schedule(), 80);
  }
  schedule() {
    while (this.next < this.ac.currentTime + 0.3) { this.tick(this.step++, this.next); this.next += this.eighth; }
  }
  tick(i, t) {
    if (this.mood === 'dark') {                       // only a slow heartbeat is left
      if (i % 6 === 0) this.drum(t, 0.3); else if (i % 6 === 1) this.drum(t, 0.17);
      return;
    }
    if (this.mood !== 'night') {
      const hit = 'DT.TD.T.'[i % 8];
      if (hit === 'D') this.drum(t, 0.3); else if (hit === 'T') this.tap(t);
    } else if (i % 8 === 0) this.drum(t, 0.16);
    const note = this.tune[i % this.tune.length];
    if (note && note[0] != null) this.pipe(t, SCALE[note[0]] * (this.mood === 'night' ? 0.5 : 1), note[1] * this.eighth);
  }
  pipe(t, f, dur) {                                   // a reed pipe: soft start, a little wobble
    const ac = this.ac, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.005;
    l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.3);
    l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.09);
    g.gain.setValueAtTime(0.13, t + Math.max(0.1, dur - 0.08)); g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus);
    for (const x of [o, o2, l]) { x.start(t); x.stop(t + dur + 0.4); }
  }
  drum(t, vol) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.16);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.4);
  }
  tap(t) {
    const ac = this.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2;
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + 0.08);
  }
  scratch() {                                         // one stroke of the pen
    const ac = this.ac, t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    const dur = 0.035 + Math.random() * 0.05;
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(2400 + Math.random() * 2600, t);
    f.frequency.linearRampToValueAtTime(2000 + Math.random() * 3000, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.008);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  rustle() {                                          // a page turning
    const ac = this.ac, t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3800, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.55);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.12);
    g.gain.linearRampToValueAtTime(0.05, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.6);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.65);
  }
  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const t = this.ac.currentTime;
    if (mood === 'dark') {                            // the tune stops; the drone sours and sinks
      this.pad.gain.linearRampToValueAtTime(0, t + 4);
      this.droneFilter.frequency.linearRampToValueAtTime(150, t + 5);
      this.grim.gain.linearRampToValueAtTime(0.28, t + 6);
    }
  }
  caveIn() {
    const ac = this.ac, t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise; s.loop = true; f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(70, t + 3.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.6, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 4.2);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 4.4);
    for (const d of [0.05, 0.5, 0.9, 1.6, 2.5]) this.drum(t + d, 0.7);
    this.grim.gain.linearRampToValueAtTime(0, t + 6);
    this.droneGain.gain.linearRampToValueAtTime(0.15, t + 6);
  }
  stop(sec) {
    clearInterval(this.timer);
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + sec);
    setTimeout(() => this.ac.close(), sec * 1000 + 300);
  }
}

// ---------------------------------------------------------------- running it
// Shows the title card. Resolves with true if the opening was played, false if it was skipped.
export async function runIntro() {
  const root = $('intro'), black = $('black');
  const pages = (await (await fetch('data/intro.json')).json()).pages;
  const scene = new Scene($('introBg'));
  root.style.display = 'block';

  let music = null, running = true, page = -1, shown = 0, lineT = 0, lineWait = 0, done = null, lastTime = performance.now();
  let pen = null;                    // the line being written: { text, n, acc, vis, rest, cue }
  let padWas = false;
  const linesEl = $('journalLines'), dateEl = $('journalDate'), moreEl = $('journalMore'), quill = $('quill');

  const pageDone = () => page >= 0 && !pen && shown >= pages[page].lines.length;
  // Start the next line. It is written out letter by letter by write(), below.
  function showLine() {
    const ln = pages[page].lines[shown++], text = typeof ln === 'string' ? ln : ln.text;
    const p = document.createElement('p');
    linesEl.appendChild(p);
    if (!text) { p.className = 'gap'; lineT = 0; lineWait = 2.6; return; }
    const vis = document.createTextNode(''), wet = document.createElement('span'), rest = document.createElement('span');
    wet.className = 'wet';                                          // the last few letters, where the ink has not dried
    rest.className = 'unwritten'; rest.textContent = text;         // keeps its place, so the words do not jump about
    p.append(vis, wet, rest);
    pen = { text, n: 0, acc: 0, vis, wet, rest, cue: ln.cue };
  }
  function write(dt, all) {
    if (!pen) return;
    pen.acc += dt * 27;
    while ((all || pen.acc >= 1) && pen.n < pen.text.length) {
      const ch = pen.text[pen.n++];
      pen.acc -= ch === ' ' ? 1.4 : '.,'.includes(ch) ? 7 : 1;       // the pen lifts between words and rests at a stop
      if (!all && ch !== ' ' && music) music.scratch();
    }
    const dry = all ? pen.n : Math.max(0, pen.n - 5);
    pen.vis.nodeValue = pen.text.slice(0, dry);
    pen.wet.textContent = pen.text.slice(dry, pen.n);
    pen.rest.textContent = pen.text.slice(pen.n);
    if (!all) {                                      // the quill stands where the last letter was made
      const box = pen.rest.getClientRects()[0] || pen.wet.getBoundingClientRect(), paper = quill.parentElement.getBoundingClientRect();
      const z = +getComputedStyle(document.documentElement).getPropertyValue('--z') || 1;      // the page is drawn smaller on a low screen
      const fs = parseFloat(getComputedStyle(pen.rest.parentElement || linesEl).fontSize) || 26;      // the hand's letters hang low in their box: the tip goes up to the writing
      quill.style.left = ((box.left - paper.left) / z) + 'px'; quill.style.top = ((box.bottom - paper.top) / z - 4 - fs * 0.35) + 'px';
      quill.style.transform = `translate(-50%, -100%) rotate(${26 + Math.sin(pen.n * 1.9) * 5}deg)`;
      quill.style.opacity = 1;
    }
    if (pen.n >= pen.text.length) {
      if (pen.cue === 'cavein') { scene.caveIn(); if (music) music.caveIn(); }
      const dried = pen;
      setTimeout(() => { dried.vis.nodeValue = dried.text; dried.wet.textContent = ''; }, 500);
      pen = null; lineT = 0; lineWait = 0.9;
      quill.style.opacity = 0;
      moreEl.style.opacity = pageDone() ? 1 : 0;
    }
  }
  function nextPage() {
    page++;
    if (page >= pages.length) return finish(true);
    linesEl.innerHTML = ''; shown = 0; pen = null; lineT = 0; lineWait = 1.2;
    quill.style.opacity = 0;
    if (page > 0) {                                  // the page turns
      if (music) music.rustle();
      const paper = quill.parentElement;
      paper.classList.remove('turn'); void paper.offsetWidth; paper.classList.add('turn');
    }
    dateEl.textContent = pages[page].date;
    $('journal').dataset.page = page;
    const head = $('journalHead');                   // the rule under the date draws itself again
    head.classList.remove('draw'); void head.offsetWidth; head.classList.add('draw');
    scene.setMode(pages[page].scene);
    if (music) music.setMood(pages[page].scene);
    moreEl.style.opacity = 0;
  }
  function advance() {               // a click, tap, key or button: finish the page, or turn it
    if (page < 0 || !running) return;
    if (!pageDone()) {
      write(0, true);
      while (shown < pages[page].lines.length) { showLine(); write(0, true); }
      moreEl.style.opacity = 1; quill.style.opacity = 0;
    } else nextPage();
  }
  function finish(played) {
    if (!running) return;
    running = false;
    removeEventListener('keydown', onKey);
    if (music) music.stop(played ? 3 : 0.6);
    if (played) $('journal').classList.add('gone');   // the page gutters out, then the dark comes
    black.style.transition = played ? 'opacity 3s 1.3s' : 'opacity 0.5s'; black.style.opacity = 1;
    setTimeout(() => { root.style.display = 'none'; done(played); }, played ? 4900 : 600);
  }
  const onKey = e => {
    if (e.code === 'Escape') finish(false);
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); page < 0 ? begin() : advance(); }
  };
  function begin() {
    if (page >= 0) return;
    try { music = new Music(); } catch (err) { music = null; }
    $('titleCard').style.display = 'none';
    $('journal').style.display = 'block'; $('introSkip').classList.add('on');
    nextPage();
  }
  addEventListener('keydown', onKey);
  $('beginBtn').onclick = e => { e.stopPropagation(); begin(); };
  $('skipBtn').onclick = e => { e.stopPropagation(); finish(false); };
  $('introSkip').onclick = e => { e.stopPropagation(); finish(false); };
  root.addEventListener('pointerdown', e => { if (!e.target.closest('button')) advance(); });

  function tick(dt) {
    scene.update(dt); scene.draw();
    if (running && page >= 0) {
      if (pen) write(dt);
      else if (shown < pages[page].lines.length) { lineT += dt; if (lineT >= lineWait) showLine(); }
    }
  }
  function frame(now) {
    if (!running && root.style.display === 'none') return;
    const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
    lastTime = now;
    tick(dt);
    const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
    const padNow = !!(pad && pad.buttons[0] && pad.buttons[0].pressed);
    if (padNow && !padWas) page < 0 ? begin() : advance();
    padWas = padNow;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.intro = { scene, advance, begin, finish, tick, get page() { return page; } };       // for testing
  return new Promise(res => { done = res; });
}
