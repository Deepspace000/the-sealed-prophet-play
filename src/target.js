// Who you are fighting. The game marks one creature in front of you with a frame, its name and its health,
// and the frame turns red when your blow would reach it. Locking on keeps your view turned to it.
// Numbers rise from a creature when it is hit, so you can see what each blow did.
import * as THREE from 'three';

const FAR = 11;           // how far away a creature can be marked, in metres
const CONE = 0.62;        // how far off the middle of the view it can be, in radians
const KEEP = 16;          // a locked creature is let go beyond this
const v = new THREE.Vector3();
const $ = id => document.getElementById(id);
const turn = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Target {
  constructor({ camera, creatures, player, fight }) {
    Object.assign(this, { camera, creatures, player, fight });
    this.c = null; this.locked = false; this.lost = 0; this.cls = 'off'; this.name = '';
    this.el = $('tgt'); this.nameEl = $('tgtName'); this.barEl = $('tgtBar'); this.footEl = $('tgtFoot'); this.floats = $('floats');
  }
  dist(c) { return Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z); }
  sees(c) { const P = this.player; return this.creatures.sees(P.pos.x, P.eyeY, P.pos.z, c.x, c.y + c.def.height * 0.6, c.z); }
  // The living creature nearest the middle of the view. One standing like a statue is not given away.
  pick() {
    const P = this.player;
    let best = null, bestS = 9;
    for (const c of this.creatures.list) {
      if (c.state === 'dead' || c.state === 'still') continue;
      const d = this.dist(c), a = Math.abs(turn(P.yaw, Math.atan2(P.pos.x - c.x, P.pos.z - c.z)));
      if (d > FAR || a > CONE || !this.sees(c)) continue;
      const s = a + d * 0.04 - (c === this.c ? 0.15 : 0);        // the one already marked is kept unless another is clearly better
      if (s < bestS) { best = c; bestS = s; }
    }
    return best;
  }
  // Lock on to the marked creature, or let go. Returns 'on', 'off' or 'none'.
  toggle() {
    if (this.locked) { this.locked = false; return 'off'; }
    this.c = this.pick();
    this.locked = !!this.c; this.lost = 0;
    return this.c ? 'on' : 'none';
  }
  // While locked, the view turns to follow the creature.
  steer(dt) {
    const c = this.c, P = this.player;
    if (!this.locked || !c) return;
    const dx = c.x - P.pos.x, dz = c.z - P.pos.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, dt * 9);
    P.yaw += turn(P.yaw, Math.atan2(-dx, -dz)) * k;
    P.pitch += (Math.atan2(c.y + c.def.height * 0.6 - P.eyeY, Math.max(0.6, d)) - P.pitch) * k;
  }
  // Where a point in the world is on the screen, or null if it is behind you.
  at(x, y, z) {
    v.set(x, y, z).project(this.camera);
    return v.z > 1 ? null : [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  update(dt, aim, hide) {
    if (this.locked) {
      const c = this.c, gone = !c || c.state === 'dead' || this.dist(c) > KEEP;
      this.lost = !gone && !this.sees(c) ? this.lost + dt : 0;
      if (gone || this.lost > 2) { this.c = this.pick(); this.locked = !!this.c && gone; this.lost = 0; }      // the next one, if another is in front of you
    } else this.c = this.pick();
    const c = this.c, top = c && !hide && this.at(c.x, c.y + c.def.height, c.z), foot = top && this.at(c.x, c.y, c.z);
    if (!top || !foot) { if (this.cls !== 'off') { this.cls = 'off'; this.el.style.display = 'none'; } return; }
    // the frame is kept on the screen, clear of the words at the top and the belt at the bottom
    const full = Math.max(26, foot[1] - top[1]), w = Math.max(22, full * Math.min(1.5, c.aspect || 0.6) * 0.8), s = this.el.style;
    const y0 = Math.max(70, Math.min(innerHeight - 200, top[1])), y1 = Math.max(y0 + 26, Math.min(innerHeight - 120, foot[1]));
    s.left = ((top[0] + foot[0]) / 2 - w / 2) + 'px'; s.top = y0 + 'px'; s.width = w + 'px'; s.height = (y1 - y0) + 'px';
    const near = this.fight.reaches(c, aim), warn = c.state === 'windup';
    const cls = (this.locked ? 'lock ' : '') + (near ? 'near ' : '') + (warn ? 'warn' : '');
    if (cls !== this.cls) {
      this.cls = cls; this.el.className = cls; s.display = 'block';
      this.footEl.textContent = [this.locked ? 'LOCKED' : '', warn ? 'IT STRIKES' : near ? 'IN REACH' : ''].filter(Boolean).join(' · ');
    }
    if (this.name !== c.def.name) this.nameEl.textContent = this.name = c.def.name;
    this.barEl.style.width = Math.max(0, c.hp / c.max * 100) + '%';
  }

  // Words or a number that rise from a creature and fade.
  float(c, text, cls) {
    const p = this.at(c.x, c.y + c.def.height * 0.75, c.z);
    if (!p) return;
    const b = document.createElement('b');
    b.textContent = text; b.className = cls || '';
    b.style.left = (p[0] + (Math.random() - 0.5) * 40) + 'px'; b.style.top = p[1] + 'px';
    b.addEventListener('animationend', () => b.remove());
    this.floats.appendChild(b);
  }
  // A blow that met nothing: say why, if there was a creature to hit.
  whiff(reach) {
    const c = this.c;
    if (c && c.state !== 'dead') this.float(c, this.dist(c) - c.def.radius > reach ? 'Too far' : 'Missed', 'word');
  }
}
