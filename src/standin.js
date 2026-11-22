// STAND-IN ART ONLY. These textures are drawn by code so the test level is visible.
// They are to be replaced by real painted textures before anything is shown as finished.
import * as THREE from 'three';

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
        tones.push(0.68 + rnd() * 0.42);
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
      let k = tones[id[i]] * (0.72 + B * 0.56) * (0.88 + fine(x, y) * 0.24);
      const streak = Math.max(0, col(x, y * 0.15) - 0.58) / 0.42;     // dark runs down the wall
      k *= 1 - 0.38 * streak * (0.4 + 0.6 * M);
      if (joint[i]) k *= 0.36; else if (chipped) k *= 0.56;
      if (crack[i]) k *= 0.34; else if (crack[ix(x - 1, y)]) k *= 1.14;
      if (rnd() < 0.035) k *= 0.62;                                   // pits
      k += (rnd() - 0.5) * 0.1;
      const c = [o.rgb[0] * k, o.rgb[1] * k, o.rgb[2] * k];
      if (B < 0.4) mix(c, [52, 56, 44], (0.4 - B) * (o.dark ? 2.2 : 1.5));   // damp and soot
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

export function standinMaterials() {
  const lam = map => new THREE.MeshLambertMaterial({ map });
  return {
    wall: lam(oldStone({ seed: 11, rgb: [176, 146, 100], rows: [22, 18, 26, 16, 24, 22], minW: 22, maxW: 46, cracks: 6,
      paint: [[40, 5, [52, 82, 120]], [46, 2, [150, 74, 44]]] })),
    floor: lam(oldStone({ seed: 23, rgb: [138, 116, 80], rows: [32, 32, 32, 32], minW: 26, maxW: 40, cracks: 4, sand: true })),
    ceil: lam(oldStone({ seed: 37, rgb: [98, 84, 64], rows: [42, 43, 43], minW: 40, maxW: 64, cracks: 3, dark: true })),
    water: new THREE.MeshLambertMaterial({
      color: 0x2a8c96, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
    }),
  };
}

// A false door: frames set one inside another. Open ones are black in the middle.
export function standinDoor(open) {
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

// A wall torch: bracket and flame.
export function standinTorch() {
  const g = new THREE.Group();
  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 0.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  bracket.position.y = -0.25;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.24, 6),
    new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false }));
  flame.position.y = 0.05;
  g.add(bracket, flame);
  g.userData.flame = flame;
  return g;
}
