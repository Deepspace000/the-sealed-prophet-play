// An open sky, for a level that is outdoors (its "sky" entry, see levels/nut.json):
//   zenith, horizon  colours of the dome overhead and at the edge of the world (the haze fades into the horizon colour)
//   sun              { dir: [x, y, z], color, power }: the sunlight
//   ground           { y, mat }: a plain of sand under the whole level, so the land runs on to the horizon past the level's edge
//   clouds           { count, low, high, spread, size, wind: [x, z] }: soft clouds that drift with the wind and come round again
// Clouds are drawn by code: lit heaps of billows (effects, not art).
import * as THREE from 'three';

const hex = c => new THREE.Color(c);

// A cumulus cloud drawn into a picture: a heap of round billows on a flat base, its edges worn ragged by fine noise, lit like
// solid shapes by the sun (bright tops, soft blue-grey bellies and undersides). sunX: which side the light comes from (-1 left, 1 right).
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { t += a * vnoise(x * f, y * f, s + i * 17); f *= 2.1; a *= 0.5; } return t; };

function cumulusTexture(seed, sunX = -0.5) {
  const W = 384, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  let st = seed;
  const r = () => (st = (st * 16807) % 2147483647) / 2147483647;
  const base = H * 0.74, puffs = [];
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {                                   // the bottom row of billows sits on the flat base
    const x = W * (0.12 + 0.76 * (i + r() * 0.6) / n), rad = H * (0.13 + 0.08 * r());
    puffs.push([x, base - rad * 0.55, rad]);
  }
  const peak = 0.35 + 0.3 * r(), reach = 0.18 + 0.14 * r();      // where the heap is highest, and how wide it is
  for (let i = 0; i < n + 3; i++) {                               // more heaped on top, highest over its peak: a dome, not a loaf
    const t = peak + (r() - 0.5) * 2 * reach, mid = Math.max(0, 1 - Math.abs(t - peak) / reach);
    const rad = H * (0.08 + 0.15 * mid + 0.05 * r());
    puffs.push([W * t, base - H * (0.12 + 0.4 * Math.pow(mid, 1.3) * (0.5 + 0.5 * r())) - rad * 0.3, rad]);
  }
  for (const p of puffs.slice()) {                              // small knobbly billows round the top of each big one, like a cauliflower
    for (let k = 0; k < 4; k++) {
      const ang = -Math.PI * (0.15 + 0.7 * r()), rad = p[2] * (0.28 + 0.2 * r());
      puffs.push([p[0] + Math.cos(ang) * p[2] * 0.78, p[1] + Math.sin(ang) * p[2] * 0.78, rad]);
    }
  }
  const L = [sunX * 0.55, -0.7, 0.45], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  for (const p of puffs) p[1] = Math.max(p[1], p[2] + H * 0.04);           // nothing pokes out of the top of the picture
  const SH = 9;                                                   // how softly neighbouring billows melt into each other
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // a soft maximum over the billows: their shapes and their surfaces blend, so there are no seams where two meet
    let sum = 0, best = -9, nx = 0, ny = 0, nz = 0;
    for (const p of puffs) {
      const dx = (x - p[0]) / p[2], dy = (y - p[1]) / p[2], q = dx * dx + dy * dy;
      if (q > 2.3) continue;
      const k = 1 - Math.sqrt(q), w = Math.exp(SH * k);
      sum += w; if (k > best) best = k;
      const z = Math.sqrt(Math.max(0, 1 - q));
      nx += w * dx; ny += w * dy; nz += w * z;
    }
    const i4 = (y * W + x) * 4;
    if (!sum) { d[i4 + 3] = 0; continue; }
    const soft = Math.log(sum) / SH;
    const rough = fbm(x / 16, y / 16, seed) - 0.5;
    let dens = soft + rough * 0.4;
    if (y > base) dens -= (y - base) / (H * 0.06);                // the flat underside
    const a = Math.min(1, Math.max(0, (dens + 0.02) / 0.16));
    if (a <= 0) { d[i4 + 3] = 0; continue; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    let lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
    lit = lit * 0.72 + 0.28 * (1 - (y / base)) + (fbm(x / 7, y / 7, seed + 5) - 0.5) * 0.2;     // brighter higher up, and fine detail
    const under = Math.max(0, Math.min(1, (y - (base - H * 0.2)) / (H * 0.26)));               // the shaded belly
    lit = Math.max(0, Math.min(1, lit - under * 0.35));
    const sh = [150, 182, 196], hi = [255, 253, 248];             // shade: blue-grey from the turquoise sky; light: warm white
    for (let k = 0; k < 3; k++) d[i4 + k] = sh[k] + (hi[k] - sh[k]) * lit;
    d[i4 + 3] = a * 255 * (0.84 + 0.16 * Math.min(1, Math.max(0, soft) * 3));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky(scene, sky, mats, centre) {
  const far = sky.far || 900;
  // the dome: a gradient from the horizon colour up to the zenith, drawn behind everything and always round you
  const dome = new THREE.Mesh(new THREE.SphereGeometry(far * 0.9, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: hex(sky.zenith) }, bot: { value: hex(sky.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; varying vec3 vP;
void main(){ float t = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(t, 0.7)), 1.0);
#include <colorspace_fragment>
}`,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  const sun = sky.sun || {};
  const light = new THREE.DirectionalLight(sun.color || 0xfff4dc, sun.power ?? 2.2);
  const d = new THREE.Vector3(...(sun.dir || [0.4, 0.8, 0.3])).normalize();
  light.position.copy(d); scene.add(light);
  scene.add(new THREE.HemisphereLight(hex(sky.zenith), 0xd8b57a, sky.fill ?? 0.9));
  // the sun's disc, far off in its own direction
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfffbe8, fog: false, depthWrite: false, transparent: true,
    map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,240,1)');
      grd.addColorStop(0.45, 'rgba(255,250,220,0.35)'); grd.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
  disc.scale.set(far * 0.12, far * 0.12, 1); disc.renderOrder = -9;
  scene.add(disc);

  if (sky.ground) {
    const m = mats[sky.ground.mat || 'sand'].clone();
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(far * 4 / 4, far * 4 / 4); m.map.needsUpdate = true; }
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(far * 4, far * 4), m);
    plain.rotation.x = -Math.PI / 2; plain.position.set(centre.x, sky.ground.y ?? -0.3, centre.z);
    scene.add(plain);
  }

  const cl = sky.clouds || {};
  const clouds = [];
  const spread = cl.spread || 300, wind = cl.wind || [1.2, 0.4];
  let seed = 4242;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const texs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => cumulusTexture(i * 7919, (sky.sun && sky.sun.dir ? Math.sign(sky.sun.dir[0]) : -1) * 0.6));
  const mats_ = texs.map(map => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true }));
  // Each cloud is a little group of pictures, one behind another and a little apart, so it has some depth as you pass it.
  for (let i = 0; i < (cl.count || 0); i++) {
    const size = (cl.size || 40) * (0.6 + r() * 0.9), grp = new THREE.Group();
    const parts = 2 + Math.floor(r() * 3);
    for (let j = 0; j < parts; j++) {
      const k = j ? 0.55 + r() * 0.35 : 1;
      const sp = new THREE.Sprite(mats_[Math.floor(r() * mats_.length)]);
      sp.scale.set(size * k, size * k / 2, 1);
      sp.position.set((r() - 0.5) * size * 0.7, (r() - 0.5) * size * 0.08 + (j ? size * 0.06 : 0), (r() - 0.5) * size * 0.5);
      grp.add(sp);
    }
    grp.position.set(centre.x + (r() - 0.5) * spread * 2, (cl.low ?? 80) + r() * ((cl.high ?? 160) - (cl.low ?? 80)), centre.z + (r() - 0.5) * spread * 2);
    grp.userData.k = 0.7 + r() * 0.6;                    // some drift faster than others
    scene.add(grp); clouds.push(grp);
  }

  return {
    update(dt, cam) {
      dome.position.copy(cam);
      disc.position.copy(cam).addScaledVector(d, far * 0.8);
      for (const s of clouds) {
        s.position.x += wind[0] * s.userData.k * dt; s.position.z += wind[1] * s.userData.k * dt;
        // gone too far downwind: comes back in on the other side
        if (s.position.x - centre.x > spread) s.position.x -= spread * 2; else if (s.position.x - centre.x < -spread) s.position.x += spread * 2;
        if (s.position.z - centre.z > spread) s.position.z -= spread * 2; else if (s.position.z - centre.z < -spread) s.position.z += spread * 2;
      }
    },
  };
}
