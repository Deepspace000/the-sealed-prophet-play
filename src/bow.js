// Arrows in the air (Mirko: a bow, to attack creatures from afar; arrows must be found, and can be used again).
// The bow itself is in data/items.json ("bow") and is drawn and loosed in src/fight.js. An arrow flies from the eye the way
// you look, drops a little as it goes, and stops at the first creature, wall, floor or roof in its way. Where it stops it
// lies as a thing to pick up again (land), whether it hit or missed.
import * as THREE from 'three';
import { art } from './art.js';

const G = 7;              // how fast an arrow drops, in metres a second each second (less than a stone: it flies fairly flat)
const LIFE = 6;           // seconds in the air at most
const UP = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();

export class Arrows {
  // ground(x, z, near): the height of the ground under a point. land(x, y, z): an arrow has stopped there.
  // hit(creature, arrow): it struck a creature (arrow.dmg, arrow.from).
  constructor({ scene, level, creatures, ground, land, hit }) {
    Object.assign(this, { scene, level, creatures, ground, land, hit });
    this.list = []; this.geo = null; this.mat = null;
  }
  // Two flat pictures of the arrow set crosswise (art/items/arrow_fly.png, point up), so it shows from every side.
  mesh() {
    if (!this.geo) {
      const a = new THREE.PlaneGeometry(0.11, 0.8), b = a.clone().rotateY(Math.PI / 2), pos = [], uv = [], idx = [];
      for (const [n, g] of [a, b].entries()) {
        pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array);
        idx.push(...[...g.index.array].map(i => i + n * 4));
      }
      this.geo = new THREE.BufferGeometry();
      this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      this.geo.setIndex(idx);
      const im = art.items.arrow_fly, t = im ? new THREE.Texture(im) : null;
      if (t) { t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; }
      this.mat = new THREE.MeshBasicMaterial({ map: t, color: t ? 0xffffff : 0x8a6a3a, alphaTest: t ? 0.4 : 0, side: THREE.DoubleSide });
    }
    return new THREE.Mesh(this.geo, this.mat.clone());
  }
  shoot(eye, dir, speed, dmg) {
    const m = this.mesh();
    this.scene.add(m);
    this.list.push({ x: eye.x + dir.x * 0.4, y: eye.y - 0.1 + dir.y * 0.4, z: eye.z + dir.z * 0.4, vx: dir.x * speed, vy: dir.y * speed + 0.6, vz: dir.z * speed,
      dmg, t: 0, from: { x: eye.x, z: eye.z }, m });
  }
  // Is this point inside stone or sand? was: the cell the arrow came from (a false wall stops an arrow that comes at it from outside).
  blocked(x, y, z, was) {
    const L = this.level, cell = L.cellAt(x, z);
    if (cell.solid || (cell.secret && !was.secret)) return true;
    return this.ground(x, z, y) > y || L.ceilAt(x, z, y) < y;
  }
  update(dt, brightnessAt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i], n = Math.max(1, Math.ceil(Math.hypot(a.vx, a.vy, a.vz) * dt / 0.2)), h = dt / n;
      let done = false;
      a.t += dt;
      for (let k = 0; k < n && !done; k++) {
        a.vy -= G * h;
        const x = a.x + a.vx * h, y = a.y + a.vy * h, z = a.z + a.vz * h;
        const c = this.creatures.list.find(c => c.state !== 'dead' && y > c.y - 0.1 && y < c.y + c.def.height + 0.1 && Math.hypot(x - c.x, z - c.z) < c.def.radius + 0.15);
        if (c) {
          // where on it: how far up its body (0 its feet, 1 its top) and how far off its middle line (0 the middle, 1 its edge),
          // taken where the arrow's line comes nearest the middle of the creature (src/fight.js arrowHit: its vital places)
          const hh = a.vx * a.vx + a.vz * a.vz || 1, s = ((c.x - x) * a.vx + (c.z - z) * a.vz) / hh;
          a.at = { f: Math.max(0, Math.min(1, (y + a.vy * s - c.y) / c.def.height)), lat: Math.hypot(x + a.vx * s - c.x, z + a.vz * s - c.z) / c.def.radius };
          this.hit(c, a); done = true;
        }
        else if (this.blocked(x, y, z, this.level.cellAt(a.x, a.z))) done = true;
        else { a.x = x; a.y = y; a.z = z; }
      }
      if (done || a.t > LIFE) {
        this.scene.remove(a.m); a.m.material.dispose();
        this.list.splice(i, 1);
        this.land(a.x, a.y, a.z);
        continue;
      }
      a.m.position.set(a.x, a.y, a.z);
      a.m.quaternion.setFromUnitVectors(UP, v.set(a.vx, a.vy, a.vz).normalize());
      a.m.material.color.setScalar(Math.min(1, 0.25 + brightnessAt(a.x, a.y, a.z)));
    }
  }
}
