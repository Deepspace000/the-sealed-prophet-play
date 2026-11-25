// Things you walk on or climb that are not cells (see levels/nut.json and tools/make_nut.py):
//   beams    "beams": long thin platforms of white stone, gilded along their edges, that stand out from a wall like rays of
//            sunlight. at: [x, z] where the root is (in cells, fractions allowed), dir: the way it points (degrees: 0 north,
//            90 east), len: metres, w / w2: width at the root and at the tip (a ray narrows to its tip), y / y2: the height of
//            its top at the root and at the tip, thick: how deep it is. You can stand on them (the body asks topAt); they are
//            never walls. A beam with len and w alike is a floating slab.
//   ladders  "ladders": a wooden ladder on a wall of a cell (cell, wall) going up to the height "to". Face it and push forward to
//            climb, back to go down, jump to let go.
import * as THREE from 'three';

const DIRV = d => { const a = d * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; };     // 0 = north (-z), 90 = east (+x)

function rayGeometry(len, w, w2, rise, th) {
  // a tapered slab: top surface from the root (z' = 0) to the tip (z' = len), the root w wide, the tip w2 wide
  const P = [
    [-w / 2, 0, 0], [w / 2, 0, 0], [w2 / 2, rise, len], [-w2 / 2, rise, len],                          // top
    [-w / 2, -th, 0], [w / 2, -th, 0], [w2 / 2, rise - th * 0.5, len], [-w2 / 2, rise - th * 0.5, len],  // bottom (thinner at the tip)
  ];
  const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [], uv = [];
  for (const f of F) {
    const q = f.map(i => P[i]);
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k]); uv.push((q[k][0] + q[k][1]) / 2, q[k][2] / 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class Beams {
  constructor({ scene, level, beams = [], mat }) {
    const s = level.size;
    const stone = mat ? mat.clone() : new THREE.MeshLambertMaterial({ color: 0xf4efe2 });
    if (stone.map) { stone.map = stone.map.clone(); stone.map.needsUpdate = true; }
    stone.emissive = new THREE.Color(0xfff4d8); stone.emissiveIntensity = 0.22;          // a faint glow, like light
    const gold = new THREE.MeshLambertMaterial({ color: 0xe0b445, emissive: 0x6a4a10 });
    this.list = beams.map(b => {
      const len = b.len, w = b.w ?? 1.4, w2 = b.w2 ?? w, y = b.y, y2 = b.y2 ?? y, th = b.thick ?? 0.7;
      const [dx, dz] = DIRV(b.dir || 0);
      const x0 = b.at[0] * s, z0 = b.at[1] * s;
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(rayGeometry(len, w, w2, y2 - y, th), stone));
      for (const side of [-1, 1]) {                    // gilded strips along both edges
        const e = new THREE.Mesh(rayGeometry(len, 0.12, 0.06, y2 - y, th * 0.4), gold);
        e.position.x = side * (w / 2 - 0.02); e.rotation.y = Math.atan2(side * (w2 - w) / 2, len);       // following the narrowing edge
        e.position.y = 0.02; grp.add(e);
      }
      grp.position.set(x0, y, z0);
      grp.rotation.y = Math.atan2(dx, dz);               // local +z points along the beam
      scene.add(grp);
      return { x0, z0, dx, dz, len, w, w2, y, y2 };
    });
  }
  // The top of a beam at this point (the highest one no higher than lim), or -Infinity.
  topAt(x, z, lim = Infinity) {
    let t = -Infinity;
    for (const b of this.list) {
      const rx = x - b.x0, rz = z - b.z0, along = rx * b.dx + rz * b.dz;
      if (along < 0 || along > b.len) continue;
      const k = along / b.len, across = Math.abs(rx * b.dz - rz * b.dx);
      if (across > (b.w + (b.w2 - b.w) * k) / 2) continue;
      const top = b.y + (b.y2 - b.y) * k;
      if (top > t && top <= lim) t = top;
    }
    return t;
  }
}

// Stained glass: "windows" in a level, long panes of coloured glass in lead set into a wall. face: which way the wall faces
// (N, E, S or W), a / b: its two ends along the wall (x, z in metres), y0 / y1: its foot and its top (metres). The glass glows a
// little, as if the light came through it; a soft glow lies on the wall round it, and a pool of its colours on the floor at its foot.
export class Windows {
  constructor({ scene, windows = [], texture, level }) {
    const TURN = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }, OUT = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
    const COLOURS = ['#ffb84a', '#ff5a4a', '#5a8cff', '#3ad6c8', '#c86aff'];
    const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.glows = []; this.time = 0;
    windows.forEach((w, i) => {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), h = w.y1 - w.y0;
      const map = texture(i + 1); map.repeat.set(1, h / (len * 4));
      // (polygonOffset: seen from far off the glass must still be drawn in front of the wall it lies on, without flickering)
      const m = new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
      mesh.position.set((w.a[0] + w.b[0]) / 2, (w.y0 + w.y1) / 2, (w.a[1] + w.b[1]) / 2);
      mesh.rotation.y = TURN[w.face] ?? 0;
      scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.35, 0.25), new THREE.MeshLambertMaterial({ color: 0xd9a535, emissive: 0x5a3a08 }));
      for (const y of [w.y0, w.y1]) { const f = frame.clone(); f.position.set(mesh.position.x, y, mesh.position.z); f.rotation.y = mesh.rotation.y; scene.add(f); }
      // the glow on the wall round it: bands of its colours, fading away to each side
      const o = OUT[w.face] || [0, 1], c1 = COLOURS[i % COLOURS.length], c2 = COLOURS[(i * 3 + 2) % COLOURS.length];
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(len * 4.2, h + 2), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        map: canvasTex(32, 64, (g, cw, ch) => { const img = g.createImageData(cw, ch), d = img.data, a = new THREE.Color(c1), b = new THREE.Color(c2);
          for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const u = Math.abs(x / (cw - 1) - 0.5) * 2, v = y / (ch - 1), k = 0.5 + 0.5 * Math.sin(v * 9 + i);
            const al = Math.pow(1 - u, 2.4) * Math.min(1, v * 8, (1 - v) * 8), j = (y * cw + x) * 4;
            d[j] = (a.r * k + b.r * (1 - k)) * 255; d[j + 1] = (a.g * k + b.g * (1 - k)) * 255; d[j + 2] = (a.b * k + b.b * (1 - k)) * 255; d[j + 3] = al * 255; }
          g.putImageData(img, 0, 0); }) }));
      halo.position.set(mesh.position.x - o[0] * 0.02, mesh.position.y, mesh.position.z - o[1] * 0.02); halo.rotation.y = mesh.rotation.y;
      scene.add(halo); this.glows.push(halo.material);
      // the pool of coloured light on the floor at its foot (laid on the floor's own slope; none where the floor falls away)
      if (level) {
        const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2, ax = -o[1], az = o[0], half = len / 2 + 0.7;
        const fl = (x, z) => level.floorAt(x, z, w.y0 - 2.5 + 1.2);
        const base = fl(mx + o[0] * 0.5, mz + o[1] * 0.5);
        let reach = 0;
        for (const r of [2.6, 1.8, 1.1]) { if (Math.abs(fl(mx + o[0] * r, mz + o[1] * r) - base) < 1.3) { reach = r; break; } }
        if (reach && isFinite(base)) {
          const P = [[-half, 0.06], [half, 0.06], [half, reach], [-half, reach]].map(([s, r]) => { const x = mx + ax * s + o[0] * r, z = mz + az * s + o[1] * r; let y = fl(x, z); if (!isFinite(y) || Math.abs(y - base) > 1.3) y = base; return [x, y + 0.05, z]; });
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]], 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
          const pool = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, side: THREE.DoubleSide, fog: true,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            map: canvasTex(32, 32, (cg, cw, ch) => { const img = cg.createImageData(cw, ch), d = img.data, cols = [c1, c2, COLOURS[(i + 1) % COLOURS.length]].map(c => new THREE.Color(c));
              for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const u = x / (cw - 1), v = 1 - y / (ch - 1), c = cols[Math.floor(v * 5.99 + i) % 3];      // v: 0 at the wall
                const al = Math.pow(1 - v, 1.3) * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.75 + 0.25 * Math.sin(v * 37.7)), j = (y * cw + x) * 4;
                d[j] = c.r * 255; d[j + 1] = c.g * 255; d[j + 2] = c.b * 255; d[j + 3] = al * 255; }
              cg.putImageData(img, 0, 0); }) }));
          scene.add(pool); this.glows.push(pool.material);
        }
      }
    });
  }
}

// the glass's light breathes a little
Windows.prototype.update = function (dt) { this.time += dt; const k = 0.82 + 0.18 * Math.sin(this.time * 0.8); for (const m of this.glows) m.opacity = (m.opacity0 ??= m.opacity) * k; };

// "shafts": light coming down a hole in a roof (cell, y0: the floor below, y1: the top of the hole). A faint column of light
// straight down from the hole to the patch of sun on the floor under it, that you see from the dark.
export class Shafts {
  constructor({ scene, level, shafts = [], sun = [0.4, 0.8, 0.3] }) {
    const s = level.size, lx = 0, lz = 0;                        // (it does not lean: the sun on the floor lies right under the hole)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const sh of shafts) {
      const x0 = sh.cell[0] * s, z0 = sh.cell[1] * s, hgt = sh.y1 - sh.y0, grow = 0;
      const top = [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]].map(([x, z]) => [x, sh.y1, z]);
      const bot = [[x0 - grow, z0 - grow], [x0 + s + grow, z0 - grow], [x0 + s + grow, z0 + s + grow], [x0 - grow, z0 + s + grow]].map(([x, z]) => [x + lx * hgt, sh.y0 + 0.02, z + lz * hgt]);
      const v = [];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; v.push(...top[i], ...bot[i], ...top[j], ...top[j], ...bot[i], ...bot[j]); }      // its four sides
      for (const q of [[0, 1, 2], [0, 2, 3]]) for (const k of q) v.push(...bot[k]);                                                         // and where it lands
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      scene.add(new THREE.Mesh(g, mat));
    }
  }
}

export class Ladders {
  constructor({ scene, level, ladders = [] }) {
    const s = level.size, wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2b }), OFF = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    this.level = level;
    this.list = ladders.map(l => {
      const c = level.cell(l.cell[0], l.cell[1]), o = OFF[l.wall], bottom = c.floor, h = l.to - bottom + 1.0;
      const grp = new THREE.Group();
      for (const side of [-0.32, 0.32]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), wood);
        rail.position.set(side, h / 2, 0); grp.add(rail);
      }
      for (let y = 0.3; y < h - 0.1; y += 0.35) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.05), wood);
        rung.position.set(0, y, 0); grp.add(rung);
      }
      const x = (l.cell[0] + 0.5 + o[0] * 0.44) * s, z = (l.cell[1] + 0.5 + o[1] * 0.44) * s;
      grp.position.set(x, bottom, z);
      grp.rotation.y = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[l.wall];
      scene.add(grp);
      return { ...l, bottom, wx: (l.cell[0] + 0.5 + o[0] * 0.5) * s, wz: (l.cell[1] + 0.5 + o[1] * 0.5) * s, o, yaw: { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[l.wall] };
    });
  }
  // The ladder you are on: in its cell, close to its wall, between its foot and its top, and not facing away from it.
  at(x, z, y, yaw) {
    const s = this.level.size;
    for (const l of this.list) {
      if (Math.floor(x / s) !== l.cell[0] || Math.floor(z / s) !== l.cell[1]) continue;
      const toWall = l.o[0] ? Math.abs(l.wx - x) : Math.abs(l.wz - z);
      if (toWall > 0.8 || y > l.to + 0.04 || y < l.bottom - 0.05) continue;
      let d = (yaw - l.yaw) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 1.75) continue;
      return l;
    }
    return null;
  }
}
