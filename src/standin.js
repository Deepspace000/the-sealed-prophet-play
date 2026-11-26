// The stone of the levels. The dungeons' walls, floor, ceiling and walls of hieroglyphs are painted pictures (art/walls,
// made with Gemini, see tools/make_walls.py): Mirko found the drawn bricks too simple once the picture got finer.
// The rest here is still drawn by code (stand-in art), and so is any of those five whose picture is missing.
import * as THREE from 'three';
import { art } from './art.js';

function painted(im, repeat = true) {
  const t = new THREE.Texture(im);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;              // chunky pixels up close, like everything else
  t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;      // (smoothed far off and edge on, or it shimmers)
  t.needsUpdate = true;
  return t;
}

// A material of one kind of stone: its painted pictures if there are any (512 pixels for four metres), or else the drawn one.
// (Mirko: make lots of variants, so it does not look cut and pasted.) A kind has several pictures, <name>, <name>_2, _3 ...,
// which all share the same rim, so any of them fits next to any other. Each four-metre square of wall (one repeat of the
// picture) shows one of them, picked by where it is, and never the same one as the square beside it or above it.
// The pictures go to the graphics card as one stack (a texture array), made the first time the stone is drawn.
function stone(name, drawn) {
  const ims = [];
  for (let n = 1; ; n++) { const im = art.walls[n === 1 ? name : `${name}_${n}`]; if (!im) break; ims.push(im); }
  if (!ims.length) return new THREE.MeshLambertMaterial({ map: drawn() });
  const m = new THREE.MeshLambertMaterial({ map: painted(ims[0]) });
  if (ims.length < 2) return m;
  let stack = null;
  const S = ims[0].width, N = ims.length;
  const pile = { n: N, get tex() {
    if (stack) return stack;
    const data = new Uint8Array(S * S * 4 * N), c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.translate(0, S); g.scale(1, -1);                      // (upside down: the first row of a stack is the bottom of the picture)
    ims.forEach((im, i) => { g.drawImage(im, 0, 0, S, S); data.set(g.getImageData(0, 0, S, S).data, i * S * S * 4); });
    stack = new THREE.DataArrayTexture(data, S, S, N);
    stack.format = THREE.RGBAFormat; stack.type = THREE.UnsignedByteType; stack.colorSpace = THREE.SRGBColorSpace;
    stack.wrapS = stack.wrapT = THREE.RepeatWrapping;
    stack.magFilter = THREE.NearestFilter; stack.minFilter = THREE.LinearMipmapLinearFilter;
    stack.generateMipmaps = true; stack.anisotropy = 8; stack.needsUpdate = true;
    return stack;
  } };
  return vary(m, pile);
}
// Makes a material show the variants in "pile". A copy of the material (m.clone()) shows them too. Something that gives the
// material its own onBeforeCompile afterwards must call the one that is there first (as main.js does for the stone under the ground).
function vary(m, pile) {
  m.onBeforeCompile = sh => {
    sh.uniforms.variants = { value: pile.tex };
    sh.fragmentShader = 'precision highp sampler2DArray;\nuniform sampler2DArray variants;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec2 vTile = floor(vMapUv);
  float vPick = mod(2.0 * vTile.x + 2.0 * vTile.y + floor(2.0 * fract(sin(dot(vTile, vec2(127.1, 311.7))) * 43758.5453)), ${pile.n.toFixed(1)});
  diffuseColor *= texture(variants, vec3(vMapUv, vPick));
#endif`);
  };
  m.customProgramCacheKey = () => 'vary' + pile.n;
  m.clone = function () { return vary(THREE.MeshLambertMaterial.prototype.clone.call(this), pile); };
  return m;
}

function tex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;              // chunky pixels up close
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Smooth random pattern that repeats at the edges of the texture. Returns values 0..1.
function noiseMap(S, cells, rnd) {
  const g = Array.from({ length: cells * cells }, rnd);
  const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / S * cells, fy = y / S * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const u = sm(fx - x0), v = sm(fy - y0);
    const p = at(x0, y0), q = at(x0 + 1, y0), r = at(x0, y0 + 1), t = at(x0 + 1, y0 + 1);
    return p + (q - p) * u + (r - p) * v + (p - q - r + t) * u * v;
  };
}

// Ancient stonework, 128 pixels square covering 4 metres: uneven blocks, chipped joints,
// cracks, stains and streaks, drifted sand, flakes of old paint.
//   rows: block-row heights in pixels (must add up to 128); minW/maxW: block widths
//   paint: a faded painted band; sand: drifts of sand over the stone; dark: soot
function oldStone(o) {
  const S = 128;
  return tex(S, g => {
    const rnd = rng(o.seed);
    const big = noiseMap(S, 4, rnd), mid = noiseMap(S, 10, rnd), fine = noiseMap(S, 32, rnd), col = noiseMap(S, 18, rnd);
    const id = new Int16Array(S * S), joint = new Uint8Array(S * S), crack = new Uint8Array(S * S), tones = [];
    const ix = (x, y) => ((y + S) % S) * S + ((x + S) % S);

    let y0 = 0;
    for (const h of o.rows) {
      let start = Math.floor(rnd() * o.maxW), pos = 0;
      while (pos < S) {
        let w = o.minW + Math.floor(rnd() * (o.maxW - o.minW));
        if (S - pos - w < o.minW) w = S - pos;
        tones.push(o.clean ? 0.93 + rnd() * 0.1 : 0.68 + rnd() * 0.42);
        for (let yy = y0; yy < y0 + h; yy++) for (let i = 0; i < w; i++) {
          id[ix(start + i, yy)] = tones.length - 1;
          if (i === 0 || yy === y0) joint[ix(start + i, yy)] = 1;
        }
        start += w; pos += w;
      }
      y0 += h;
    }
    for (let n = 0; n < (o.cracks ?? 5); n++) {
      let x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), drift = rnd() < 0.5 ? -1 : 1;
      for (let i = 0, len = 18 + rnd() * 50; i < len; i++) {
        crack[ix(x, y)] = 1;
        const r = rnd();
        if (r < 0.45) x += drift; else if (r < 0.55) x -= drift;
        if (rnd() < 0.8) y++;
        if (rnd() < 0.04) drift = -drift;
      }
    }

    const img = g.createImageData(S, S), d = img.data;
    const mix = (c, to, t) => { for (let i = 0; i < 3; i++) c[i] += (to[i] - c[i]) * t; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ix(x, y), B = big(x, y), M = mid(x, y);
      let nearJoint = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (joint[ix(x + ox, y + oy)]) nearJoint = 1;
      const chipped = !joint[i] && nearJoint && M > 0.52;            // edges of blocks broken away
      let k = o.clean ? tones[id[i]] * (0.9 + B * 0.12) * (0.95 + fine(x, y) * 0.08)           // clean: bright, even, sun-bleached
        : tones[id[i]] * (0.72 + B * 0.56) * (0.88 + fine(x, y) * 0.24);
      const streak = Math.max(0, col(x, y * 0.15) - 0.58) / 0.42;     // dark runs down the wall
      k *= 1 - 0.38 * (o.clean ? 0.35 : 1) * streak * (0.4 + 0.6 * M);
      if (joint[i]) k *= o.clean ? 0.72 : 0.36; else if (chipped) k *= o.clean ? 0.85 : 0.56;
      if (crack[i]) k *= 0.34; else if (crack[ix(x - 1, y)]) k *= 1.14;
      if (rnd() < 0.035) k *= o.clean ? 0.88 : 0.62;                  // pits
      k += (rnd() - 0.5) * (o.clean ? 0.04 : 0.1);
      const c = [o.rgb[0] * k, o.rgb[1] * k, o.rgb[2] * k];
      if (B < 0.4) mix(c, [52, 56, 44], (0.4 - B) * (o.dark ? 2.2 : o.clean ? 0.35 : 1.5));   // damp and soot (clean: sun-bleached stone, hardly any)
      const solid = !joint[i] && !chipped && !crack[i];
      if (o.paint && solid) {
        for (const [py, ph, prgb] of o.paint) {
          if (y >= py && y < py + ph && M + fine(x, y) * 0.4 > 0.72) mix(c, prgb, 0.5);   // what is left of a painted band
        }
      }
      if (o.sand && B + fine(x, y) * 0.25 > 0.68) mix(c, [190, 162, 112], Math.min(0.75, (B + fine(x, y) * 0.25 - 0.68) * 5));
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

// Hieroglyphs: the same old stone with rows of carved and painted signs across it (eyes, ankhs, birds, scarabs, water, reeds, feathers).
// The stone is 128 pixels for four metres; this one is drawn twice as fine so the signs read up close.
function glyph(g, kind, cx, cy, s) {
  g.beginPath();
  switch (kind) {
    case 0: g.ellipse(cx, cy, s * 0.5, s * 0.24, 0, 0, 7); g.moveTo(cx - s * 0.5, cy - s * 0.32); g.lineTo(cx + s * 0.5, cy - s * 0.32); g.moveTo(cx - s * 0.1, cy + s * 0.24); g.lineTo(cx - s * 0.25, cy + s * 0.6); g.stroke();
      g.beginPath(); g.arc(cx, cy, s * 0.1, 0, 7); g.fill(); break;                                                 // the eye
    case 1: g.ellipse(cx, cy - s * 0.3, s * 0.2, s * 0.26, 0, 0, 7); g.moveTo(cx, cy - s * 0.04); g.lineTo(cx, cy + s * 0.6); g.moveTo(cx - s * 0.28, cy + s * 0.14); g.lineTo(cx + s * 0.28, cy + s * 0.14); g.stroke(); break;     // ankh
    case 2: g.moveTo(cx, cy - s * 0.55); g.lineTo(cx, cy + s * 0.5); g.moveTo(cx, cy + s * 0.5); g.lineTo(cx - s * 0.18, cy + s * 0.62); g.moveTo(cx, cy + s * 0.5); g.lineTo(cx + s * 0.18, cy + s * 0.62); g.stroke();
      g.beginPath(); g.arc(cx, cy - s * 0.55, s * 0.12, 0, 7); g.fill(); break;                                     // the was sceptre
    case 3: for (let i = 0; i < 3; i++) { const y = cy - s * 0.3 + i * s * 0.3; g.moveTo(cx - s * 0.5, y); for (let k = 1; k <= 4; k++) g.lineTo(cx - s * 0.5 + k * s * 0.25, y + (k % 2 ? -s * 0.1 : s * 0.1)); } g.stroke(); break;    // water
    case 4: g.ellipse(cx, cy + s * 0.05, s * 0.3, s * 0.2, 0, 0, 7); g.fill(); g.beginPath(); g.arc(cx + s * 0.28, cy - s * 0.25, s * 0.12, 0, 7); g.fill();
      g.beginPath(); g.moveTo(cx + s * 0.38, cy - s * 0.25); g.lineTo(cx + s * 0.56, cy - s * 0.12); g.moveTo(cx - s * 0.1, cy + s * 0.25); g.lineTo(cx - s * 0.1, cy + s * 0.6); g.moveTo(cx + s * 0.08, cy + s * 0.25); g.lineTo(cx + s * 0.08, cy + s * 0.6); g.stroke(); break;   // a bird
    case 5: g.ellipse(cx, cy, s * 0.3, s * 0.36, 0, 0, 7); g.fill(); for (const d of [-1, 1]) for (let i = 0; i < 3; i++) { g.moveTo(cx + d * s * 0.28, cy - s * 0.2 + i * s * 0.2); g.lineTo(cx + d * s * 0.52, cy - s * 0.3 + i * s * 0.28); } g.stroke(); break;   // scarab
    case 6: g.ellipse(cx, cy, s * 0.14, s * 0.5, 0, 0, 7); g.moveTo(cx, cy - s * 0.5); g.lineTo(cx, cy + s * 0.62); g.stroke(); break;            // a feather
    case 7: g.moveTo(cx, cy - s * 0.55); g.lineTo(cx, cy + s * 0.55); for (let i = 0; i < 4; i++) { g.moveTo(cx - s * 0.26, cy - s * 0.42 + i * s * 0.2); g.lineTo(cx + s * 0.26, cy - s * 0.42 + i * s * 0.2); } g.stroke(); break;     // djed pillar
    case 8: g.arc(cx, cy + s * 0.1, s * 0.2, 0, 7); g.moveTo(cx - s * 0.42, cy - s * 0.2); g.quadraticCurveTo(cx, cy - s * 0.7, cx + s * 0.42, cy - s * 0.2); g.stroke(); g.beginPath(); g.arc(cx, cy + s * 0.1, s * 0.1, 0, 7); g.fill(); break;   // sun disc and horns
    case 9: g.arc(cx, cy - s * 0.38, s * 0.13, 0, 7); g.fill(); g.beginPath(); g.rect(cx - s * 0.16, cy - s * 0.22, s * 0.32, s * 0.5); g.fill();
      g.beginPath(); g.moveTo(cx + s * 0.16, cy - s * 0.1); g.lineTo(cx + s * 0.5, cy - s * 0.1); g.moveTo(cx - s * 0.1, cy + s * 0.28); g.lineTo(cx - s * 0.1, cy + s * 0.6); g.moveTo(cx + s * 0.1, cy + s * 0.28); g.lineTo(cx + s * 0.1, cy + s * 0.6); g.stroke(); break;    // a seated figure
    default: g.moveTo(cx, cy + s * 0.55); g.bezierCurveTo(cx - s * 0.5, cy + s * 0.2, cx + s * 0.5, cy - s * 0.1, cx, cy - s * 0.3); g.stroke(); g.beginPath(); g.ellipse(cx, cy - s * 0.4, s * 0.16, s * 0.2, 0, 0, 7); g.fill(); break;   // a cobra
  }
}
function hieroStone(o) {
  const base = oldStone(o), S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), rnd = rng(o.seed + 99);
  g.imageSmoothingEnabled = false; g.drawImage(base.image, 0, 0, S, S);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const paint = o.signs || ['#2b5a8e', '#a8432a', '#c9a43c'];
  for (const y0 of o.regs || [18, 142]) {
    g.lineWidth = 2; g.strokeStyle = o.clean ? 'rgba(40,90,120,.45)' : 'rgba(30,18,8,.55)';      // the lines that bound a register
    g.beginPath(); g.moveTo(0, y0 - 6); g.lineTo(S, y0 - 6); g.moveTo(0, y0 + 56); g.lineTo(S, y0 + 56); g.stroke();
    for (let x = 18; x < S - 8; x += 36) {
      if (rnd() < 0.12) continue;                                     // a gap, where the paint has flaked away
      const kind = Math.floor(rnd() * 11), col = paint[Math.floor(rnd() * paint.length)];
      for (const [ox, oy, style, a] of [[1.5, 1.5, 'rgb(22,14,8)', o.clean ? 0.3 : 0.75], [0, 0, col, 0.9]]) {
        g.save(); g.globalAlpha = a; g.strokeStyle = g.fillStyle = style; g.lineWidth = 3;
        glyph(g, kind, x + ox, y0 + 25 + oy, 28);
        g.restore();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

// Desert sand, 128 pixels for four metres: soft dunes of light and shade with wind ripples across them.
function sand(o) {
  return tex(128, (g, S) => {
    const rnd = rng(o.seed), big = noiseMap(S, 3, rnd), mid = noiseMap(S, 8, rnd), fine = noiseMap(S, 32, rnd);
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ripple = Math.sin((y + mid(x, y) * 14) / S * Math.PI * 2 * 10) * 0.5 + 0.5;
      let k = 0.86 + big(x, y) * 0.16 + ripple * 0.06 + fine(x, y) * 0.07 + (rnd() - 0.5) * 0.05;
      const i = (y * S + x) * 4;
      d[i] = o.rgb[0] * k; d[i + 1] = o.rgb[1] * k; d[i + 2] = o.rgb[2] * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

export function standinMaterials() {
  return {
    wall: stone('wall', () => oldStone({ seed: 11, rgb: [176, 146, 100], rows: [22, 18, 26, 16, 24, 22], minW: 22, maxW: 46, cracks: 6,
      paint: [[40, 5, [52, 82, 120]], [46, 2, [150, 74, 44]]] })),
    floor: stone('floor', () => oldStone({ seed: 23, rgb: [138, 116, 80], rows: [32, 32, 32, 32], minW: 26, maxW: 40, cracks: 4, sand: true })),
    ceil: stone('ceil', () => oldStone({ seed: 37, rgb: [98, 84, 64], rows: [42, 43, 43], minW: 40, maxW: 64, cracks: 3, dark: true })),
    hiero: stone('hiero', () => hieroStone({ seed: 41, rgb: [168, 138, 96], rows: [22, 18, 26, 16, 24, 22], regs: [18, 142], minW: 22, maxW: 46, cracks: 5 })),
    hiero2: stone('hiero2', () => hieroStone({ seed: 53, rgb: [150, 124, 92], rows: [32, 32, 32, 32], regs: [72], signs: ['#8a1d14', '#c9a43c', '#2b5a8e'], minW: 26, maxW: 40, cracks: 4 })),
    // The White Tower (of Horus): pale limestone, the walls carved and painted with signs in blue, turquoise, red and gold
    white: stone('white', () => hieroStone({ seed: 61, rgb: [246, 242, 230], rows: [22, 18, 26, 16, 24, 22], regs: [18, 142], minW: 22, maxW: 46, cracks: 2, clean: true,
      signs: ['#2b5a8e', '#1f9c96', '#a8432a', '#c9a43c'] })),
    whiteplain: stone('whiteplain', () => oldStone({ seed: 67, rgb: [244, 240, 228], rows: [32, 32, 32, 32], minW: 26, maxW: 40, cracks: 1, clean: true })),
    sand: stone('sand', () => sand({ seed: 71, rgb: [222, 190, 134] })),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000 }),      // the far sides of a void: black, whatever light falls on them
    water: new THREE.MeshLambertMaterial({
      color: 0x2a8c96, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
    }),
  };
}

// A false door: frames set one inside another. Open ones are black in the middle. Painted if there is a picture of it
// (art/walls/door.jpg, door_open.jpg; door_2 is a second one: "which" picks between them), or else drawn.
export function standinDoor(open, which = 0) {
  const name = (which % 2 && art.walls.door_2 ? 'door_2' : 'door') + (open ? '_open' : '');
  if (art.walls[name]) return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.44), new THREE.MeshLambertMaterial({ map: painted(art.walls[name], false) }));
  const t = tex(32, g => {
    g.canvas.height = 52;
    const frames = [['#6b5433', 0], ['#c9a44c', 2], ['#3a2a18', 4], ['#2f5f8f', 6], ['#3a2a18', 8], ['#c9a44c', 10]];
    for (const [c, i] of frames) { g.fillStyle = c; g.fillRect(i, i, 32 - i * 2, 52 - i); }
    g.fillStyle = open ? '#000000' : '#8a7350'; g.fillRect(12, 12, 8, 40);
    if (!open) { g.fillStyle = '#3a2a18'; g.fillRect(15.5, 12, 1, 40); }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.44), new THREE.MeshLambertMaterial({ map: t }));
}

// A flame picture: a teardrop made of layers, hot white in the middle, drawn once for each colour of fire.
const flameTextures = {};
function flameTexture(colour, core) {
  const key = colour + '/' + core;
  if (flameTextures[key]) return flameTextures[key];
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(colour), white = new THREE.Color(0xffffff);
  const shade = k => { const s = base.clone().lerp(white, k); return `rgb(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)})`; };
  const drop = (s, lean) => {
    const w = 23 * s, h = 120 * s, cy = 126 - w;
    g.beginPath();
    g.moveTo(32 + lean * s, 126 - h);
    g.bezierCurveTo(32 + w * 0.35, cy - (h - w) * 0.5, 32 + w, cy - w * 0.35, 32 + w, cy);
    g.arc(32, cy, w, 0, Math.PI, false);
    g.bezierCurveTo(32 - w, cy - w * 0.35, 32 - w * 0.35, cy - (h - w) * 0.5, 32 + lean * s, 126 - h);
    g.fill();
  };
  const layers = [[1, 0.0, 0.28, 0.5], [0.84, 0.0, 0.45, 0.75], [0.66, 0, 0.7, 0.9], [0.44, 0, core, 1]];
  for (const [s, lean, k, a] of layers) { g.fillStyle = shade(k); g.globalAlpha = a; drop(s, lean * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (flameTextures[key] = t);
}
const flameSprite = (tex, w, h, y, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity }));
  s.center.set(0.5, 0.04); s.scale.set(w, h, 1); s.position.y = y;
  return s;
};

// A wall torch of the Egyptian kind: a gilded ankh fixed to the wall, a bronze cup on its crossbar, and a burning head of twisted linen
// in a cage of bronze bars. (Real ones: a gilded bronze lamp in the form of an ankh whose arms held a tubular torch holder with a torch
// of twisted linen in it.) Its local +z points into the room, the wall is at z = -0.16, and the middle of the flame is at the origin.
export function egyptianTorch(colour = 0xffb040) {
  const g = new THREE.Group(), model = new THREE.Group(), body = new THREE.Group();
  const lam = (color, emissive) => new THREE.MeshLambertMaterial({ color, emissive });
  const gold = lam(0xd9aa30, 0x7a5c14), bronze = lam(0x9a6430, 0x4a2a10), dark = lam(0x4a3420, 0x20160c);
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  // the ankh on the wall: loop, stem and arms
  const ankh = new THREE.Group();
  ankh.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 6, 14), gold), 0, 0.17, 0));
  ankh.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.04), gold), 0, -0.06, 0));
  ankh.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.04), gold), 0, 0.02, 0));
  ankh.position.set(0, -0.5, -0.13);
  // the cup, the cage and the burning head, leaning out from the wall
  body.position.set(0, -0.47, -0.1); body.rotation.x = 0.35;
  body.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.13, 10), bronze), 0, 0.065, 0));
  const rim = at(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 12), gold), 0, 0.13, 0); rim.rotation.x = Math.PI / 2; body.add(rim);
  body.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.26, 8), lam(0xe6d8b0, 0xb09c70)), 0, 0.23, 0));       // the linen
  for (const y of [0.17, 0.25, 0.33]) { const b = at(new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.008, 4, 10), dark), 0, y, 0); b.rotation.x = Math.PI / 2 + 0.25; body.add(b); }
  body.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.09, 8), new THREE.MeshBasicMaterial({ color: 0xffb050, fog: false })), 0, 0.37, 0));   // the burning top
  for (let i = 0; i < 6; i++) {                                                           // the cage: six bars and a ring
    const a = i / 6 * Math.PI * 2, bar = at(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.27, 0.012), bronze), Math.cos(a) * 0.072, 0.27, Math.sin(a) * 0.072);
    bar.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1); body.add(bar);
  }
  const top = at(new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.01, 4, 12), gold), 0, 0.41, 0); top.rotation.x = Math.PI / 2; body.add(top);
  model.add(ankh, body);
  model.position.y = -0.15;
  // the flame: a wide teardrop, a hot core, and a soft glow round them. The group is what flickers.
  const flame = new THREE.Group();
  const bodyTex = flameTexture(colour, 0.78), coreTex = flameTexture(colour, 0.95);
  flame.add(flameSprite(bodyTex, 0.3, 0.5, 0));
  flame.add(flameSprite(coreTex, 0.15, 0.3, 0.01));
  flame.add(flameSprite(bodyTex, 0.9, 0.9, -0.15, 0.16));
  flame.position.set(0, -0.25, 0.03);
  g.add(model, flame);
  g.scale.setScalar(1.2);
  g.userData.flame = flame;
  return g;
}

// A wall torch: bracket and flame.
export function standinTorch(colour = 0xffb040) {
  const g = new THREE.Group();
  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 0.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  bracket.position.y = -0.25;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.24, 6),
    new THREE.MeshBasicMaterial({ color: colour, fog: false }));
  flame.position.y = 0.05;
  g.add(bracket, flame);
  g.userData.flame = flame;
  return g;
}
