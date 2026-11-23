// Dangers and barriers built into a level (see levels/ptah.json and tools/make_ptah.py):
//   spikes   cells with "spikes": true. Their floor is a bed of spikes, and falling or stepping on to it kills at once.
//   gates    "gates": a door that fills one cell. mode "key" opens once with the matching key item (item "key" = the gate's "key"),
//            "lever" opens and shuts with a lever, "timed" opens and shuts by itself, "auto" slides open as you come near.
//            Gates with the same "id" are one door (a wide passage needs a gate in each of its cells).
//   buttons  "buttons": a round stone button in a wall (cell, wall, h). Pressed once: rumbling and running water, then the gate named
//            in "opens" (a gate with mode "button", drawn as plain wall) slides back for good. It stays open in the save.
//   levers   "levers": a lever on a wall that works the gates it "opens". "hold": seconds before they shut again (0 = they stay open).
//   shooters "shooters": a carved mouth in a wall that spits fireballs along the passage.
import * as THREE from 'three';
import { play } from './sound.js';

const SOLID_PAD = 0.45;
const OFF = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const TURN = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };       // a picture on that wall of a cell faces into the cell
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
};

// ---- spikes ----
export function buildSpikes(scene, level) {
  const spots = [];
  const s = level.size;
  for (let cz = 0; cz < level.h; cz++) for (let cx = 0; cx < level.w; cx++) {
    const c = level.cells[cz][cx];
    if (!c.spikes || c.solid || c.spikes === 'deep') continue;      // 'deep': too far down to be seen, so not drawn
    let seed = cx * 7919 + cz * 104729;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      spots.push([(cx + (i + 0.5 + (r() - 0.5) * 0.6) / 3) * s, c.floor, (cz + (j + 0.5 + (r() - 0.5) * 0.6) / 3) * s, 0.7 + r() * 0.6, r() * 6]);
    }
  }
  if (!spots.length) return null;
  const geo = new THREE.ConeGeometry(0.1, 0.8, 5).translate(0, 0.4, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x8d8478 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), k = new THREE.Vector3();
  spots.forEach(([x, y, z, h, a], i) => {
    q.setFromEuler(e.set((h - 1) * 0.25, a, (a - 3) * 0.05));
    m.compose(v.set(x, y, z), q, k.set(1, h, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
// Is any part of the body on a bed of spikes?
export function onSpikes(level, player) {
  const p = player.pos;
  for (const [sx, sz] of player.samples(p.x, p.z)) {
    const c = level.cellAt(sx, sz);
    if (c.spikes && p.y < c.floor + 0.7) return true;
  }
  return false;
}

// ---- gates and levers ----
function gateTex(mode, colour) {
  return canvasTex(64, 96, (g, w, h) => {
    g.fillStyle = '#6d5a3c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) { g.fillStyle = y % 24 ? '#7b6644' : '#5f4e33'; g.fillRect(0, y, w, 11); }
    g.strokeStyle = '#c9a44c'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#1f3f66'; g.fillRect(8, 8, w - 16, 5); g.fillRect(8, h - 13, w - 16, 5);
    if (mode === 'key') {                                   // a lock plate in the key's colour: a scarab
      g.fillStyle = '#2a2014'; g.beginPath(); g.arc(w / 2, h / 2, 17, 0, 7); g.fill();
      g.fillStyle = colour || '#c9a44c'; g.beginPath(); g.ellipse(w / 2, h / 2 + 2, 9, 11, 0, 0, 7); g.fill();
      g.fillRect(w / 2 - 1, h / 2 - 13, 2, 26);
      g.fillStyle = '#2a2014'; g.fillRect(w / 2 - 10, h / 2 - 1, 20, 2);
    } else {                                                // a carved eye
      g.strokeStyle = '#2a2014'; g.lineWidth = 3; g.beginPath(); g.ellipse(w / 2, h / 2, 16, 8, 0, 0, 7); g.stroke();
      g.fillStyle = '#2a2014'; g.beginPath(); g.arc(w / 2, h / 2, 4, 0, 7); g.fill();
    }
  });
}

// The slab of a gate that is drawn as plain wall: the level's own wall stone, repeated so it matches.
function plainWall(mat, w, h) {
  const m = mat.clone();
  if (m.map) { m.map = m.map.clone(); m.map.repeat.set(w / 2, h / 2); m.map.needsUpdate = true; }
  return m;
}

export class Gates {
  // cfg: { scene, level, gates, levers, saved (indexes of gates already opened), say(text), findKey(id) -> item|null, takeKey(item) }
  constructor({ scene, level, gates = [], levers = [], buttons = [], saved = [], say, findKey, takeKey, wallMat }) {
    Object.assign(this, { scene, level, say, findKey, takeKey });
    this.shake = 0;
    this.time = 0;
    this.list = gates.map((g, n) => {
      const c = level.cell(g.cell[0], g.cell[1]);
      const h = c.ceil - c.floor, s = level.size;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(s, h, 0.45), g.mode === 'button' && wallMat ? plainWall(wallMat, s, h) : new THREE.MeshLambertMaterial({ map: gateTex(g.mode, g.colour) }));
      slab.rotation.y = g.run === 'EW' ? Math.PI / 2 : 0;
      const gate = { ...g, n, id: g.id ?? 'g' + n, mesh: slab, h, floor: c.floor, t: 1, want: 1, x: (g.cell[0] + 0.5) * s, z: (g.cell[1] + 0.5) * s,
        index: g.cell[1] * level.w + g.cell[0], slide: g.slide || (g.mode === 'auto' || g.mode === 'timed' ? 'side' : 'up') };
      scene.add(slab);
      return gate;
    });
    this.opened = new Set(saved);
    for (const g of this.list) if (this.opened.has(g.id) && (g.mode === 'key' || g.mode === 'button')) { g.t = 0; g.want = 0; }
    this.buttons = buttons.map(b => {
      const s = level.size, c = level.cell(b.cell[0], b.cell[1]), o = OFF[b.wall];
      const grp = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a3c28 }));
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.07, 14), new THREE.MeshLambertMaterial({ color: 0xc9a44c }));
      knob.rotation.x = Math.PI / 2;
      grp.add(plate, knob);
      grp.position.set((b.cell[0] + 0.5 + o[0] * 0.49) * s, c.floor + (b.h ?? 1.2), (b.cell[1] + 0.5 + o[1] * 0.49) * s);
      grp.rotation.y = TURN[b.wall];
      scene.add(grp);
      const on = this.opened.has(b.opens);
      knob.position.z = on ? 0.02 : 0.07;
      return { ...b, grp, knob, on, timer: 0, x: (b.cell[0] + 0.5) * s, z: (b.cell[1] + 0.5) * s, y: c.floor + (b.h ?? 1.2) };
    });
    this.levers = levers.map(l => {
      const s = level.size, c = level.cell(l.cell[0], l.cell[1]), o = OFF[l.wall];
      const grp = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.07), new THREE.MeshLambertMaterial({ color: 0x4a3c28 }));
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), new THREE.MeshLambertMaterial({ color: 0xc9a44c }));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xb02a1a }));
      arm.position.y = 0.17; knob.position.y = 0.36;
      const pivot = new THREE.Group(); pivot.add(arm, knob); pivot.position.z = 0.05;
      grp.add(plate, pivot);
      grp.position.set((l.cell[0] + 0.5 + o[0] * 0.485) * s, c.floor + (l.h ?? 1.2), (l.cell[1] + 0.5 + o[1] * 0.485) * s);
      grp.rotation.y = TURN[l.wall];
      scene.add(grp);
      return { ...l, grp, pivot, on: false, x: (l.cell[0] + 0.5) * s, z: (l.cell[1] + 0.5) * s, timer: 0, y: c.floor + (l.h ?? 1.2) };
    });
    this.apply(0);
  }
  group(id) { return this.list.filter(g => g.id === id); }
  shut() { return this.list.some(g => g.t > 0.05); }
  // moves the doors and keeps the level's solid cells in step
  apply(dt) {
    const L = this.level;
    for (const g of this.list) {
      if (g.t !== g.want) {
        const step = dt / 1.3 * (g.want ? 1 : 1);
        g.t = g.want > g.t ? Math.min(g.want, g.t + step) : Math.max(g.want, g.t - step);
      }
      const s = L.size, k = 1 - g.t;
      if (g.slide === 'side') {
        const dx = g.run === 'EW' ? 0 : 1, dz = g.run === 'EW' ? 1 : 0;
        g.mesh.position.set(g.x + dx * k * s * 0.98, g.floor + g.h / 2, g.z + dz * k * s * 0.98);
      } else g.mesh.position.set(g.x, g.floor + g.h / 2 + k * g.h, g.z);
      if (g.t > 0.05) L.shut.add(g.index); else L.shut.delete(g.index);
    }
  }
  bodyIn(g, P) { return Math.abs(P.pos.x - g.x) < this.level.size / 2 + SOLID_PAD && Math.abs(P.pos.z - g.z) < this.level.size / 2 + SOLID_PAD && Math.abs(P.pos.y - g.floor) < 3; }
  setGroup(id, open, P) {
    for (const g of this.group(id)) {
      if (!open && P && this.bodyIn(g, P)) { g.pending = true; continue; }      // never shut a door on someone standing in it
      g.pending = false; g.want = open ? 0 : 1;
    }
  }
  update(dt, P) {
    this.time += dt;
    for (const g of this.list) {
      if (g.mode === 'timed') {
        const per = g.every || 6, ph = (this.time + (g.phase || 0)) % per, open = ph < (g.open || per / 2);
        if (open && g.want !== 0) { g.want = 0; if (Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 14) play('groan', Math.hypot(P.pos.x - g.x, P.pos.z - g.z)); }
        if (!open && g.want !== 1) { if (!this.bodyIn(g, P)) { g.want = 1; if (Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 14) play('groan', Math.hypot(P.pos.x - g.x, P.pos.z - g.z)); } }
      } else if (g.mode === 'auto') {
        const d = Math.hypot(P.pos.x - g.x, P.pos.z - g.z), near = d < 3.2 && Math.abs(P.pos.y - g.floor) < 3;
        if (near && g.want !== 0) { g.want = 0; play('groan', d); }
        else if (d > 5 && g.want !== 1 && !this.bodyIn(g, P)) g.want = 1;
      } else if (g.pending && !this.bodyIn(g, P)) { g.pending = false; g.want = 1; }
    }
    let shaking = 0;
    for (const b of this.buttons) {
      b.knob.position.z += ((b.on ? 0.02 : 0.07) - b.knob.position.z) * Math.min(1, dt * 10);
      if (b.timer > 0) {
        b.timer -= dt; shaking = Math.max(shaking, Math.min(1, b.timer / 1.5 + 0.4));
        if (b.timer <= 0) { this.setGroup(b.opens, true); play('groan', 0); }
      }
    }
    this.shake = shaking;
    for (const l of this.levers) {
      if (l.on && l.hold > 0) { l.timer -= dt; if (l.timer <= 0) this.pull(l, P, true); }
      const want = l.on ? -0.9 : 0.9;
      l.pivot.rotation.x += (want - l.pivot.rotation.x) * Math.min(1, dt * 8);
    }
    this.apply(dt);
  }
  nearest(P, list) {
    let best = null, bd = 2.5;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (const o of list) {
      const dx = o.x - P.pos.x, dz = o.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs((o.y ?? o.floor) - P.pos.y) > 3) continue;
      if (d > 0.9 && (dx * fx + dz * fz) / d < 0.55) continue;           // you must be facing it
      best = o; bd = d;
    }
    return best;
  }
  press(b) {
    if (b.on) return;
    b.on = true; b.timer = 3.4;
    this.opened.add(b.opens);
    play('chip'); play('rumble'); play('gurgle');
    this.say(b.text || 'Something gives way in the wall. Stone rumbles and water gurgles somewhere behind it.');
  }
  pull(l, P, quiet) {
    l.on = !l.on; l.timer = l.hold || 0;
    this.setGroup(l.opens, l.on, P);
    play('chip');
    if (!quiet) this.say(l.on ? 'The lever grinds down. Somewhere, stone slides.' : 'The lever clunks back.');
  }
  // F pressed. Returns true if it did something.
  use(P) {
    const bt = this.nearest(P, this.buttons);
    if (bt) { this.press(bt); return true; }
    const l = this.nearest(P, this.levers);
    const g = this.nearest(P, this.list.filter(x => x.mode === 'key' && x.t > 0.05));
    if (l && (!g || Math.hypot(l.x - P.pos.x, l.z - P.pos.z) <= Math.hypot(g.x - P.pos.x, g.z - P.pos.z))) { this.pull(l, P); return true; }
    if (!g) return false;
    const key = this.findKey(g.key);
    if (!key) { this.say(g.text || 'A sealed door. Something is missing from its lock.'); return true; }
    this.takeKey(key);
    this.opened.add(g.id);
    this.setGroup(g.id, true);
    play('smash');
    this.say(`The ${key.def.name.toLowerCase()} turns. The door grinds open.`);
    return true;
  }
  // words for the screen when you look at a door or a lever
  look(P, hasKeyHint) {
    const bt = this.nearest(P, this.buttons);
    if (bt) return bt.on ? '' : hasKeyHint;
    const l = this.nearest(P, this.levers);
    if (l) return 'A lever, worn smooth by hands. ' + hasKeyHint;
    const g = this.nearest(P, this.list.filter(x => x.mode === 'key' && x.t > 0.05));
    if (g) return (g.text || 'A sealed door. Its lock is cut in the shape of a scarab.') + (this.findKey(g.key) ? ' ' + hasKeyHint : '');
    return '';
  }
  pack() { return [...this.opened]; }
}

// ---- fireballs ----
export class Fireballs {
  // shooters: { cell, wall, h, every, phase, speed, dmg }
  constructor({ scene, level, shooters = [], torchColour }) {
    Object.assign(this, { scene, level });
    const glow = canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, 'rgba(255,250,210,1)'); r.addColorStop(0.3, 'rgba(255,170,60,.9)'); r.addColorStop(0.7, 'rgba(210,50,10,.35)'); r.addColorStop(1, 'rgba(120,10,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    this.glow = glow;
    const mouth = canvasTex(64, 64, (g, w) => {
      g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
      g.fillStyle = '#0a0503'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.fill();
      g.strokeStyle = '#c9a44c'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.stroke();
      g.fillStyle = '#c9a44c'; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.fillRect(32 + Math.cos(a) * 24 - 2, 32 + Math.sin(a) * 24 - 2, 4, 4); }
    });
    const s = level.size;
    this.list = shooters.map(sh => {
      const o = OFF[sh.wall], c = level.cell(sh.cell[0], sh.cell[1]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: mouth, transparent: true }));
      const x = (sh.cell[0] + 0.5 + o[0] * 0.495) * s, z = (sh.cell[1] + 0.5 + o[1] * 0.495) * s, y = c.floor + (sh.h ?? 0.8);
      m.position.set(x, y, z); m.rotation.y = TURN[sh.wall];
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false }));
      flare.scale.set(0.9, 0.9, 1); flare.position.set(x - o[0] * 0.12, y, z - o[1] * 0.12);
      this.scene.add(m, flare);
      return { ...sh, x, y, z, dx: -o[0], dz: -o[1], m, flare, t: (sh.phase || 0) % (sh.every || 5) };
    });
    this.balls = [];
    this.light = new THREE.PointLight(0xff5a1a, 0, 9, 2);
    scene.add(this.light);
  }
  update(dt, P, hit) {
    const L = this.level;
    for (const sh of this.list) {
      const per = sh.every || 5, warn = 1.0;
      sh.t += dt;
      const near = Math.hypot(P.pos.x - sh.x, P.pos.z - sh.z) < 40;
      if (sh.t >= per) {
        sh.t -= per;
        if (near) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          sp.scale.set(0.8, 0.8, 1); sp.position.set(sh.x + sh.dx * 0.3, sh.y, sh.z + sh.dz * 0.3);
          this.scene.add(sp);
          this.balls.push({ sp, x: sp.position.x, y: sh.y, z: sp.position.z, dx: sh.dx, dz: sh.dz, speed: sh.speed || 7, dmg: sh.dmg || 12, life: 4, boom: 0 });
          play('smash', Math.hypot(P.pos.x - sh.x, P.pos.z - sh.z));
        }
      }
      const k = Math.max(0, 1 - (per - sh.t) / warn);                    // the mouth glows in the second before it fires
      sh.flare.material.opacity = Math.min(1, k * (0.7 + 0.3 * Math.sin(sh.t * 40)));
    }
    let lit = null, ld = 1e9;
    for (const b of this.balls) {
      if (b.boom > 0) { b.boom -= dt; if (b.boom <= 0) b.dead = true; else { b.sp.material.opacity = b.boom / 0.25; b.sp.scale.setScalar(2.2 - b.boom * 4); } continue; }
      b.life -= dt;
      const step = b.speed * dt, n = Math.max(1, Math.ceil(step / 0.3));
      let hitWall = false;
      for (let i = 0; i < n && !hitWall; i++) {
        b.x += b.dx * step / n; b.z += b.dz * step / n;
        if (L.cellAt(b.x, b.z).solid || L.ceilAt(b.x, b.z) < b.y + 0.15 || L.floorAt(b.x, b.z) > b.y - 0.1) hitWall = true;
      }
      b.sp.position.set(b.x, b.y, b.z);
      b.sp.scale.setScalar(0.75 + 0.12 * Math.sin(b.life * 40));
      if (!hitWall && Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < 0.6 && b.y > P.pos.y - 0.1 && b.y < P.pos.y + 1.75) { hit(b.dmg); hitWall = true; }
      if (hitWall || b.life <= 0) { b.boom = 0.25; b.sp.material.opacity = 1; }
      const d = Math.hypot(b.x - P.pos.x, b.z - P.pos.z);
      if (d < ld) { ld = d; lit = b; }
    }
    this.balls = this.balls.filter(b => { if (b.dead) { this.scene.remove(b.sp); b.sp.material.dispose(); return false; } return true; });
    if (lit && !(lit.boom > 0)) { this.light.position.set(lit.x, lit.y, lit.z); this.light.intensity = 9; } else this.light.intensity = 0;
  }
}
