// Dunes: ground that is not cells (a level's "terrain", see levels/nut.json and tools/make_nut.py).
//   terrain: { unit: metres for one count of height, edge: the height (metres) the dunes come to all along the level's edge,
//              rows: one row for each line of cell corners from north to south, each a list of heights at the corners from
//              west to east (so a level w cells wide and h deep has h + 1 rows of w + 1 heights) }
// The dunes lie over the level's flat sand. Where a height is 0 there is no dune: the cells' own floor shows (the path, the
// ground round the tower). You walk on them (the body asks topAt, as for lifts and rays); they are never walls.
// Beyond the level's edge the same sand goes on rising into dunes the size of mountains, far off (drawn only: nobody walks there).
import * as THREE from 'three';

export class Terrain {
  constructor({ scene, level, terrain, mat, far }) {
    const S = level.size, W = level.w + 1, H = level.h + 1, unit = terrain.unit || 0.1;
    this.S = S; this.W = W; this.H = H;
    const h = this.h = new Float32Array(W * H);
    terrain.rows.forEach((row, z) => row.forEach((v, x) => { h[z * W + x] = v * unit; }));
    // ---- the dunes inside the level: one skin over the corners of the cells
    const pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2), idx = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x;
      pos[i * 3] = x * S; pos[i * 3 + 1] = h[i] > 0.02 ? h[i] : -0.06; pos[i * 3 + 2] = z * S;      // (where there is no dune it tucks just under the floor)
      uv[i * 2] = x * S / 4; uv[i * 2 + 1] = z * S / 4;
    }
    for (let z = 0; z < H - 1; z++) for (let x = 0; x < W - 1; x++) {
      const a = z * W + x, b = a + 1, c = a + W, d = c + 1;
      if (Math.max(h[a], h[b], h[c], h[d]) <= 0.02) continue;        // flat sand: the cells draw it
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, mat); scene.add(this.mesh);

    // ---- beyond the edge: rings of sand going out from the level's four sides, rising into ridges of dunes like mountains
    const E = terrain.edge ?? 0, cx = level.w * S / 2, cz = level.h * S / 2, hw = cx, hd = cz;
    const D = [0, 14, 32, 55, 85, 120, 160, 205, 255, 310, 370, 440, 520, 610, 720, 850], N = 220;
    const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise1 = (t, k) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash(i, k) * (1 - u) + hash(i + 1, k) * u; };
    // ridges of dunes at these distances out, each bigger than the last: [how far, how wide, how high]
    const RIDGES = terrain.mountains || [[70, 38, 22], [170, 60, 55], [300, 85, 105], [470, 120, 170], [680, 150, 230]];
    const high = (th, d) => {
      let y = 0;
      RIDGES.forEach(([at, wide, tall], k) => {
        const t = th / (Math.PI * 2);
        const where = at * (0.8 + 0.5 * noise1(t * (9 + k * 3), k * 7 + 1)), crest = tall * (0.45 + 0.75 * noise1(t * (13 + k * 4), k * 7 + 3));
        const q = (d - where) / wide;
        y += crest * Math.exp(-q * q * (q > 0 ? 2.6 : 1.0));          // a long windward slope, a steeper far side
      });
      return E * Math.max(0.35, 1 - d / 400) + y * Math.min(1, d / 40);      // (it leaves the level's edge at the edge's own height)
    };
    const p2 = new Float32Array(N * D.length * 3), u2 = new Float32Array(N * D.length * 2), i2 = [];
    for (let r = 0; r < D.length; r++) for (let n = 0; n < N; n++) {
      const th = n / N * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
      const k = Math.min(hw / Math.abs(dx || 1e-9), hd / Math.abs(dz || 1e-9));      // where a line from the middle meets the level's edge
      const x = cx + dx * (k + D[r]), z = cz + dz * (k + D[r]), i = r * N + n;
      p2[i * 3] = x; p2[i * 3 + 1] = high(th, D[r]); p2[i * 3 + 2] = z;
      u2[i * 2] = x / 4; u2[i * 2 + 1] = z / 4;
      if (r < D.length - 1) { const a = i, b = r * N + (n + 1) % N, c = a + N, d = b + N; i2.push(a, b, c, b, d, c); }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(p2, 3)); g2.setAttribute('uv', new THREE.BufferAttribute(u2, 2));
    g2.setIndex(i2); g2.computeVertexNormals();
    // far dunes do not fade right out into the haze: they stay as pale shapes against the sky
    const m2 = mat.clone();
    m2.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      `#ifdef USE_FOG
  float fogF = min(1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth), ${(terrain.hazeMax ?? 0.74).toFixed(2)});
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
#endif`); };
    m2.customProgramCacheKey = () => 'fardunes';
    this.far = new THREE.Mesh(g2, m2); this.far.frustumCulled = false; scene.add(this.far);
  }
  // the height of the dunes at a point (0 where there is none, or outside the level)
  heightAt(x, z) {
    const S = this.S, fx = x / S, fz = z / S, x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= this.W - 1 || z0 >= this.H - 1) return 0;
    const u = fx - x0, v = fz - z0, h = this.h, i = z0 * this.W + x0;
    // (the two triangles of the square, as it is drawn)
    return u + v <= 1 ? h[i] + (h[i + 1] - h[i]) * u + (h[i + this.W] - h[i]) * v
      : h[i + this.W + 1] + (h[i + this.W] - h[i + this.W + 1]) * (1 - u) + (h[i + 1] - h[i + this.W + 1]) * (1 - v);
  }
  // The top of the dunes at this point if it is ground to stand on from the height lim (a little above it still counts: sand
  // does not hold you under it), or -Infinity.
  topAt(x, z, lim = Infinity) {
    const y = this.heightAt(x, z);
    return y > 0.02 && y <= lim + 0.7 ? y : -Infinity;
  }
}
