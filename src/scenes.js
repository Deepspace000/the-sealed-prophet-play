// Short text scenes: the player's thoughts, shown in a box the first time something happens (the first enemy,
// the first walking skeleton, the first body, the first water, the first hidden room). The game stands still
// while one is up. The words are in data/scenes.json. Which ones have been shown is kept in the save.
const $ = id => document.getElementById(id);
const turn = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Scenes {
  // remains: [{ x, z }] human bones lying in this level. areas: [{ id, area: [x0, z0, x1, z1] }] from the level file.
  constructor({ data, seen, off, level, player, creatures, brightnessAt, remains, areas, outdoors }) {
    Object.assign(this, { data, off, level, player, creatures, brightnessAt, remains, areas, outdoors });
    this.seen = new Set(seen || []);
    this.open = null; this.wait = 3; this.at = 0;       // wait: seconds before the next quiet scene (creatures do not wait)
    this.el = $('scene');
    $('sceneGo').addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
  }
  pack() { return [...this.seen]; }
  due(id) { return !this.seen.has(id) && !!this.data[id]; }

  show(id, vars = {}) {
    const s = (this.outdoors && this.data[id + '_sky']) || this.data[id];      // (under the open sky some have other words: "enemy_sky")
    this.seen.add(id);
    if (!s) return;
    $('sceneTitle').textContent = s.title;
    $('sceneLines').innerHTML = '';
    s.lines.forEach((line, i) => {
      const p = document.createElement('p');
      p.textContent = line.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? '');
      p.style.animationDelay = (0.25 + i * 0.7) + 's';
      $('sceneLines').appendChild(p);
    });
    this.el.style.display = 'flex';
    this.open = id; this.at = performance.now();
    if (document.pointerLockElement) document.exitPointerLock();      // so the pointer can reach CONTINUE
  }
  // Closes the box. A press in the first moment is ignored, so that a key already being pressed does not skip it.
  close() {
    if (!this.open || performance.now() - this.at < 600) return;
    this.el.style.display = 'none';
    this.open = null; this.wait = 4;
  }

  // Can the player see this point: near enough, in front, not behind a wall, and with some light on it?
  inView(x, y, z, far) {
    const P = this.player, dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > far) return false;
    if (d > 1.2 && Math.abs(turn(P.yaw, Math.atan2(-dx, -dz))) > 0.6) return false;
    if (!this.creatures.sees(P.pos.x, P.eyeY, P.pos.z, x, y, z)) return false;
    return this.brightnessAt(x, y, z) > 0.07;
  }

  // Called every frame of play: shows a scene if its moment has come.
  check(dt) {
    if (this.off || this.open) return;
    this.wait -= dt;
    const P = this.player, L = this.level;
    for (const c of this.creatures.list) {
      if (c.state === 'dead' || c.state === 'still') continue;
      const id = c.def.look && c.def.look.detail === 'bones' ? 'skeleton' : c.def.kind === 'dead' ? 'walking_dead' : 'enemy';
      if (this.due(id) && this.inView(c.x, c.y + c.def.height * 0.6, c.z, 9)) return this.show(id, { name: c.def.name.toLowerCase() });
    }
    if (this.wait > 0 || this.creatures.hunting) return;      // the rest wait a moment, and until nothing is after you
    if (this.due('body')) for (const r of this.remains) {
      if (this.inView(r.x, L.floorAt(r.x, r.z) + 0.25, r.z, 4.5)) return this.show('body');
    }
    if (this.due('water') && P.onGround && !P.swimming && !P.underwater) {
      const S = L.size, cx = Math.floor(P.pos.x / S), cz = Math.floor(P.pos.z / S);
      for (let z = cz - 2; z <= cz + 2; z++) for (let x = cx - 2; x <= cx + 2; x++) {
        const wx = (x + 0.5) * S, wz = (z + 0.5) * S, w = L.waterAt(wx, wz);
        if (w == null || L.cellAt(wx, wz).ceil < w + 0.3) continue;       // a flooded passage with no air above it is not seen as water
        if (this.inView(wx, w + 0.1, wz, 5)) return this.show('water');
      }
    }
    for (const a of this.areas) {            // a note or a place with its own words: shown once, when you walk into its area
      if (a.id === 'secret' || !this.due(a.id) || P.underwater || !P.onGround) continue;
      const S = L.size, cx = Math.floor(P.pos.x / S), cz = Math.floor(P.pos.z / S);
      if (cx >= a.area[0] && cx <= a.area[2] && cz >= a.area[1] && cz <= a.area[3]) return this.show(a.id);
    }
    if (this.due('secret') && !P.underwater && P.onGround) {
      const S = L.size, cx = Math.floor(P.pos.x / S), cz = Math.floor(P.pos.z / S);
      const inArea = this.areas.some(a => a.id === 'secret' && cx >= a.area[0] && cx <= a.area[2] && cz >= a.area[1] && cz <= a.area[3]);
      if (inArea || L.cellAt(P.pos.x, P.pos.z).secret) return this.show('secret');
    }
  }
}
