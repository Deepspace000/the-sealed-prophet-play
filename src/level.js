// A level is a grid of cells. Each cell has a floor and ceiling height, and may
// slope, be drawn as stairs, or hold water. The file format is described in the
// "notes" at the top of levels/test.json.
import * as THREE from 'three';

const SOLID = { solid: true };
const EPS = 1e-4;
const TILE = 4;      // one texture covers this many metres

// Each edge of a cell, as seen from inside it: left corner, right corner (u east, v south), neighbour offset.
const EDGES = [
  ['N', [0, 0], [1, 0], [0, -1]],
  ['E', [1, 0], [1, 1], [1, 0]],
  ['S', [1, 1], [0, 1], [0, 1]],
  ['W', [0, 1], [0, 0], [-1, 0]],
];
// For stairs: low-left corner, uphill direction, right-hand direction (looking uphill).
const STAIR = {
  N: [[0, 1], [0, -1], [1, 0]],
  E: [[0, 0], [1, 0], [0, 1]],
  S: [[1, 0], [0, 1], [-1, 0]],
  W: [[1, 1], [-1, 0], [0, -1]],
};

class Geo {
  constructor() { this.p = []; this.uv = []; }
  tri(a, b, c, flat) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-10) return;   // no area
    for (const q of [a, b, c]) {
      this.p.push(q[0], q[1], q[2]);
      if (flat) this.uv.push(q[0] / TILE, q[2] / TILE);
      else this.uv.push((q[0] + q[2]) / TILE, q[1] / TILE);
    }
  }
  quad(a, b, c, d, flat) { this.tri(a, b, c, flat); this.tri(a, c, d, flat); }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

export class Level {
  constructor(data) {
    this.data = data;
    this.size = data.cell || 2;
    this.h = data.rows.length;
    this.shut = new Set();          // cells a closed gate fills (see hazards.js): solid while they are in it
    this.w = data.rows[0].length;
    this.cells = data.rows.map((row, z) => {
      if (row.length !== this.w) throw new Error(`Row ${z} is ${row.length} long, expected ${this.w}`);
      return [...row].map(ch => {
        const t = data.legend[ch];
        if (!t) throw new Error(`Row ${z}: no legend entry for "${ch}"`);
        return t;
      });
    });
  }

  cell(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return SOLID;
    return this.shut.size && this.shut.has(cz * this.w + cx) ? SOLID : this.cells[cz][cx];
  }
  cellAt(x, z) { return this.cell(Math.floor(x / this.size), Math.floor(z / this.size)); }

  static slopeT(c, u, v) {
    return c.slope === 'N' ? 1 - v : c.slope === 'S' ? v : c.slope === 'E' ? u : 1 - u;
  }
  // Floor height the player stands on, at a point inside the cell (u east, v south, 0..1).
  static floorIn(c, u, v) {
    return c.slope ? c.floor + c.rise * Level.slopeT(c, u, v) : c.floor;
  }
  // Floor height as drawn (stairs are stepped).
  static surfIn(c, u, v) {
    if (!c.steps) return Level.floorIn(c, u, v);
    const i = Math.min(c.steps, Math.floor(Level.slopeT(c, u, v) * c.steps + EPS) + 1);
    return c.floor + c.rise * i / c.steps;
  }

  floorAt(x, z) {
    const s = this.size, cx = Math.floor(x / s), cz = Math.floor(z / s), c = this.cell(cx, cz);
    return c.solid ? Infinity : Level.floorIn(c, x / s - cx, z / s - cz);
  }
  // The floor as it is drawn (a stair is stepped), for things that lie on it.
  surfAt(x, z) {
    const s = this.size, cx = Math.floor(x / s), cz = Math.floor(z / s), c = this.cell(cx, cz);
    return c.solid ? Infinity : Level.surfIn(c, x / s - cx, z / s - cz);
  }
  ceilAt(x, z) { const c = this.cellAt(x, z); return c.solid ? -Infinity : c.ceil; }
  waterAt(x, z) { const c = this.cellAt(x, z); return (c.solid || c.water == null) ? null : c.water; }

  cellCentre(cx, cz) { return { x: (cx + 0.5) * this.size, z: (cz + 0.5) * this.size }; }

  torchPositions() {
    const s = this.size, off = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    return (this.data.torches || []).map(t => {
      const [cx, cz] = t.cell, o = off[t.wall] || [0, 0], c = this.cell(cx, cz);
      return {
        wall: t.wall,
        x: (cx + 0.5 + o[0] * 0.42) * s,
        y: (c.floor || 0) + (t.h ?? 2.2),
        z: (cz + 0.5 + o[1] * 0.42) * s,
      };
    });
  }

  // Build the meshes. mats: { floor, wall, ceil, water } (a cell type may name others with floorTex / wallTex / ceilTex).
  build(mats) {
    const geos = {};
    const geo = name => geos[name] || (geos[name] = new Geo());
    const s = this.size;

    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const c = this.cells[cz][cx];
      if (c.solid) continue;
      const x0 = cx * s, z0 = cz * s;
      const P = (u, v, y) => [x0 + u * s, y, z0 + v * s];
      const fl = geo(c.floorTex || 'floor'), wl = geo(c.wallTex || 'wall');

      // floor
      if (c.steps) {
        const [o, up, rt] = STAIR[c.slope], n = c.steps;
        const Q = (t, r, y) => P(o[0] + up[0] * t + rt[0] * r, o[1] + up[1] * t + rt[1] * r, y);
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n, y1 = c.floor + c.rise * (i + 1) / n, y0 = c.floor + c.rise * i / n;
          fl.quad(Q(t0, 0, y1), Q(t0, 1, y1), Q(t1, 1, y1), Q(t1, 0, y1), true);
          if (i > 0) wl.quad(Q(t0, 0, y0), Q(t0, 1, y0), Q(t0, 1, y1), Q(t0, 0, y1), false);
        }
      } else {
        const f = (u, v) => Level.floorIn(c, u, v);
        fl.quad(P(0, 0, f(0, 0)), P(0, 1, f(0, 1)), P(1, 1, f(1, 1)), P(1, 0, f(1, 0)), true);
      }
      // ceiling
      geo(c.ceilTex || 'ceil').quad(P(0, 0, c.ceil), P(1, 0, c.ceil), P(1, 1, c.ceil), P(0, 1, c.ceil), true);
      // water surface
      if (c.water != null && c.ceil > c.water) {
        geo('water').quad(P(0, 0, c.water), P(0, 1, c.water), P(1, 1, c.water), P(1, 0, c.water), true);
      }

      // walls on each edge
      const base = (u, v) => c.steps ? c.floor : Level.floorIn(c, u, v);
      for (const [, L, R, o] of EDGES) {
        const n = this.cell(cx + o[0], cz + o[1]);
        const k = (!n.solid && n.steps) || 1;
        for (let j = 0; j < k; j++) {
          const ta = j / k, tb = (j + 1) / k;
          const A = [L[0] + (R[0] - L[0]) * ta, L[1] + (R[1] - L[1]) * ta];
          const B = [L[0] + (R[0] - L[0]) * tb, L[1] + (R[1] - L[1]) * tb];
          const fa = base(A[0], A[1]), fb = base(B[0], B[1]);
          const wall = (ba, bb, ta2, tb2) =>
            wl.quad(P(A[0], A[1], ba), P(B[0], B[1], bb), P(B[0], B[1], tb2), P(A[0], A[1], ta2), false);
          // A false wall: from outside, a secret cell looks like solid wall, but it can be walked through.
          if (n.solid || (n.secret && !c.secret)) { wall(fa, fb, c.ceil, c.ceil); continue; }
          let na, nb;
          if (n.steps) {
            na = nb = Level.surfIn(n, (A[0] + B[0]) / 2 - o[0], (A[1] + B[1]) / 2 - o[1]);
          } else {
            na = Level.floorIn(n, A[0] - o[0], A[1] - o[1]);
            nb = Level.floorIn(n, B[0] - o[0], B[1] - o[1]);
          }
          na = Math.min(na, c.ceil); nb = Math.min(nb, c.ceil);
          if (na > fa + EPS || nb > fb + EPS) wall(fa, fb, Math.max(fa, na), Math.max(fb, nb));
          if (n.ceil < c.ceil - EPS) wall(Math.max(n.ceil, fa), Math.max(n.ceil, fb), c.ceil, c.ceil);
        }
      }
    }

    const group = new THREE.Group();
    for (const name in geos) {
      const m = geos[name].mesh(mats[name] || mats.wall);
      m.name = name;
      if (name === 'water') m.renderOrder = 2;
      group.add(m);
    }
    return group;
  }
}
