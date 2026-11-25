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
// little, as if the light came through it.
export class Windows {
  constructor({ scene, windows = [], texture }) {
    const TURN = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
    windows.forEach((w, i) => {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), h = w.y1 - w.y0;
      const map = texture(i + 1); map.repeat.set(1, h / (len * 4));
      const m = new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.6 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
      mesh.position.set((w.a[0] + w.b[0]) / 2, (w.y0 + w.y1) / 2, (w.a[1] + w.b[1]) / 2);
      mesh.rotation.y = TURN[w.face] ?? 0;
      scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.35, 0.25), new THREE.MeshLambertMaterial({ color: 0xd9a535, emissive: 0x5a3a08 }));
      for (const y of [w.y0, w.y1]) { const f = frame.clone(); f.position.set(mesh.position.x, y, mesh.position.z); f.rotation.y = mesh.rotation.y; scene.add(f); }
    });
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
