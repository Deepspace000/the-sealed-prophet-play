// Creatures: flat pictures that face you, with simple senses, path-finding and attacks.
// The kinds are listed in data/creatures.json. Where they stand is in each level file ("creatures").
import * as THREE from 'three';
import { creatureFrames } from './standin_creatures.js';
import { art } from './art.js';
import { play } from './sound.js';

const STEP = 0.55;      // tallest step a creature walks up
const DROP = 1.3;       // deepest drop it will step down
const G = 22;
const HUNTING = new Set(['chase', 'windup', 'strike', 'recover', 'hurt', 'flee']);
const VOICE = c => (c.def.look && c.def.look.detail === 'bones') ? 'rattle' : c.def.kind === 'beast' ? 'growl' : 'groan';

export class Creatures {
  // hooks: onStrike(creature, damage, type), onDeath(creature), drop(itemId, x, z), pushPlayer(dx, dz) -> true if the player moved
  constructor(scene, level, defs, hooks) {
    this.scene = scene; this.level = level; this.defs = defs; this.hooks = hooks;
    this.list = []; this.edges = new Map(); this.tex = {}; this.hunting = 0;
  }

  texture(def, pose) {
    const key = def.id + ':' + pose;
    if (!this.tex[key]) {
      const t = this.tex[key] = new THREE.CanvasTexture(this.frame(def, pose));
      t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    }
    return this.tex[key];
  }

  // The picture for a pose: one made in Blender if there is one, or else the stand-in.
  frame(def, pose) { return art.creatures[def.id + '_' + pose] || art.creatures[def.id + '_idle'] || creatureFrames(def)[pose]; }

  spawn(id, x, z, n, dead) {
    const def = this.defs[id];
    if (!def) throw new Error(`No creature called "${id}"`);
    if (this.level.cellAt(x, z).solid) throw new Error(`Creature ${n} (${id}) is placed inside solid rock`);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture(def, 'idle'), fog: true, alphaTest: 0.5 }));
    spr.center.set(0.5, 0);
    this.scene.add(spr);
    const frame = this.frame(def, 'idle');
    const c = {
      def, n, x, z, y: this.level.floorAt(x, z), vy: 0, hp: def.health, state: def.still ? 'still' : 'idle', t: 0,
      home: { x, z }, path: null, pathT: 0, seen: 99, last: null, pose: 'idle', flash: 0, kx: 0, kz: 0,
      anim: Math.random() * 4, fled: false, moving: false, wanderT: 1 + Math.random() * 3, goal: null, spr,
      aspect: frame.width / frame.height,
    };
    if (dead) { c.state = 'dead'; c.hp = 0; }
    this.list.push(c);
    return c;
  }

  // ---- the ground under it
  canStand(c, x, z, y) {
    const L = this.level, r = c.def.radius;
    for (const [sx, sz] of [[x, z], [x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]]) {
      const cell = L.cellAt(sx, sz);
      if (cell.solid || cell.secret) return false;
      const f = L.floorAt(sx, sz);
      if (f > y + STEP || f < y - DROP) return false;
      if (cell.ceil - Math.max(f, y) < c.def.height) return false;
      if (cell.water != null && cell.water - f > (c.def.wade ?? 0.8)) return false;
    }
    return true;
  }
  groundAt(c) {
    const L = this.level, r = c.def.radius;
    let g = -Infinity;
    for (const [sx, sz] of [[c.x, c.z], [c.x - r, c.z - r], [c.x + r, c.z - r], [c.x - r, c.z + r], [c.x + r, c.z + r]]) {
      const f = L.floorAt(sx, sz);
      if (f <= c.y + STEP && f > g) g = f;
    }
    return g;
  }
  move(c, wx, wz, speed, dt) {
    const dx = wx - c.x, dz = wz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.04) return false;
    const len = Math.min(d, speed * dt), mx = dx / d * len, mz = dz / d * len;
    let moved = false;
    if (mx && this.canStand(c, c.x + mx, c.z, c.y)) { c.x += mx; moved = true; }
    if (mz && this.canStand(c, c.x, c.z + mz, c.y)) { c.z += mz; moved = true; }
    return moved;
  }

  // ---- finding the way: which neighbouring cells this kind of creature can walk between
  edgeOK(c, ax, az, bx, bz) {
    const key = c.def.id + ':' + ax + ',' + az + ',' + bx + ',' + bz;
    let ok = this.edges.get(key);
    if (ok === undefined) {
      const L = this.level, s = L.size, a = L.cell(ax, az), b = L.cell(bx, bz);
      ok = false;
      if (!b.solid && !b.secret) {
        const mx = (ax + bx + 1) / 2 * s, mz = (az + bz + 1) / 2 * s, dx = (bx - ax) * 0.06, dz = (bz - az) * 0.06;
        const fa = L.floorAt(mx - dx, mz - dz), fb = L.floorAt(mx + dx, mz + dz), mid = L.floorAt((bx + 0.5) * s, (bz + 0.5) * s);
        ok = fb - fa <= STEP && fa - fb <= DROP && Math.min(a.ceil, b.ceil) - Math.max(fa, fb) >= c.def.height
          && !(b.water != null && b.water - mid > (c.def.wade ?? 0.8));
      }
      this.edges.set(key, ok);
    }
    return ok;
  }
  // A list of cells to walk through to reach cell (tx, tz). If it cannot be reached, the way to the nearest cell that can.
  findPath(c, tx, tz) {
    const L = this.level, s = L.size, W = L.w, sx = Math.floor(c.x / s), sz = Math.floor(c.z / s);
    const prev = new Map([[sx + sz * W, -1]]), q = [[sx, sz]];
    let best = q[0], bestD = Math.hypot(sx - tx, sz - tz);
    for (let i = 0; i < q.length && i < 900; i++) {
      const [x, z] = q[i], d = Math.hypot(x - tx, z - tz);
      if (d < bestD) { bestD = d; best = q[i]; }
      if (d === 0) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + nz * W;
        if (prev.has(k) || !this.edgeOK(c, x, z, nx, nz)) continue;
        prev.set(k, x + z * W); q.push([nx, nz]);
      }
    }
    const path = [];
    for (let k = best[0] + best[1] * W; k >= 0 && k !== sx + sz * W; k = prev.get(k)) path.unshift([k % W, Math.floor(k / W)]);
    return path;
  }
  // Where to walk right now to get to (x, z).
  toward(c, x, z, dt, straight) {
    if (straight) return [x, z];
    const s = this.level.size;
    c.pathT -= dt;
    if (!c.path || c.pathT <= 0) { c.path = this.findPath(c, Math.floor(x / s), Math.floor(z / s)); c.pathT = 0.6; }
    while (c.path.length) {
      const wx = (c.path[0][0] + 0.5) * s, wz = (c.path[0][1] + 0.5) * s;
      if (Math.hypot(wx - c.x, wz - c.z) > 0.4) return [wx, wz];
      c.path.shift();
    }
    const here = Math.floor(c.x / s) === Math.floor(x / s) && Math.floor(c.z / s) === Math.floor(z / s);
    return here ? [x, z] : [c.x, c.z];
  }

  // Is there a clear line between two points?
  sees(x0, y0, z0, x1, y1, z1) {
    const L = this.level, d = Math.hypot(x1 - x0, y1 - y0, z1 - z0), n = Math.ceil(d / 0.4);
    if (!(d < 200)) return false;
    const ends = [L.cellAt(x0, z0), L.cellAt(x1, z1)];
    for (let i = 1; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t, cell = L.cellAt(x, z);
      if (cell.solid || (cell.secret && !ends.includes(cell))) return false;
      if (L.floorAt(x, z) > y || cell.ceil < y) return false;
    }
    return true;
  }

  rouse(c, far) {
    if (c.state === 'dead') return;
    if (!HUNTING.has(c.state)) play(VOICE(c), far);
    c.state = 'chase'; c.pathT = 0; c.seen = 0;
  }
  stagger(c, time) { if (c.state !== 'dead') { c.state = 'hurt'; c.t = time; } }

  // Damage from the player. Returns { real, weak, killed }.
  // bare: the blow is a bare fist, which some things (bone) hardly feel.
  hurt(c, dmg, type, fromX, fromZ, push = 1, bare = false) {
    if (c.state === 'dead') return null;
    const W = c.def.weak || {}, weak = (W[type] ?? 1) * (bare ? W.bare ?? 1 : 1), real = dmg * weak;
    c.hp -= real; c.flash = 0.16; c.dull = weak <= 0.6;
    const dx = c.x - fromX, dz = c.z - fromZ, d = Math.hypot(dx, dz) || 1;
    c.kx = dx / d * 3 * push; c.kz = dz / d * 3 * push;
    c.last = { x: fromX, z: fromZ }; c.seen = 0;
    if (c.hp <= 0) {
      c.state = 'dead'; c.hp = 0;
      play(c.def.look && c.def.look.detail === 'bones' ? 'rattle' : 'die', d);
      for (const [id, chance] of c.def.drops || []) {
        if (Math.random() < chance) this.hooks.drop(id, c.x + (Math.random() - 0.5) * 0.5, c.z + (Math.random() - 0.5) * 0.5);
      }
      this.hooks.onDeath(c);
      return { real, weak, killed: true };
    }
    if (real >= c.def.health * 0.15) this.stagger(c, 0.55);       // a hard blow stops what it was doing
    else if (!HUNTING.has(c.state)) this.rouse(c, d);
    return { real, weak, killed: false };
  }

  // P: the player: { x, y, z, eyeY, r, lit 0..1, noise 0..1, alive }
  update(dt, P, brightnessAt) {
    this.hunting = 0;
    for (const c of this.list) {
      const def = c.def;
      if (c.burn > 0 && c.state !== 'dead') { c.burn -= dt; this.hurt(c, 5 * dt, 'fire', c.x, c.z, 0); c.flash = 0.16; }       // set alight by a torch
      c.flash = Math.max(0, c.flash - dt);
      if (c.state === 'dead') { this.draw(c, dt, P, brightnessAt); continue; }
      const dx = P.x - c.x, dz = P.z - c.z, dist = Math.hypot(dx, dz), dy = P.y - c.y;
      const los = dist < 30 && this.sees(c.x, c.y + def.height * 0.85, c.z, P.x, P.eyeY - 0.2, P.z);
      let aware = false;
      if (P.alive && los) {
        const range = c.state === 'still' ? def.wake : def.sense === 'life' ? def.sight : def.sight * (0.3 + 0.7 * P.lit);
        aware = dist < range || (HUNTING.has(c.state) && dist < def.sight * 1.6);     // once after you, it is not shaken off easily
      }
      if (aware) { c.seen = 0; c.last = { x: P.x, z: P.z }; } else c.seen += dt;
      const heard = P.alive && P.noise > 0 && c.state !== 'still' && dist < (def.hearing || 0) * P.noise;
      const reach = def.attack.reach + def.radius + P.r;

      c.t -= dt;
      let want = null, speed = def.speed;
      switch (c.state) {
        case 'still':
          if (aware) this.rouse(c, dist);
          break;
        case 'idle':
          if (aware) this.rouse(c, dist);
          else if (heard) { c.last = { x: P.x, z: P.z }; c.state = 'search'; c.t = 9; c.pathT = 0; }
          else if (def.kind === 'beast') {                   // beasts pad about near where they live
            c.wanderT -= dt;
            if (c.wanderT <= 0) {
              c.wanderT = 2 + Math.random() * 4;
              const a = Math.random() * 6.28, r = Math.random() * 2.2;
              c.goal = { x: c.home.x + Math.cos(a) * r, z: c.home.z + Math.sin(a) * r };
            }
            if (c.goal) {
              if (Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 0.3) c.goal = null;
              else { want = [c.goal.x, c.goal.z]; speed *= 0.3; }
            }
          }
          break;
        case 'search':                                       // going to where it last saw or heard you
          if (aware) { this.rouse(c, dist); break; }
          if (heard) c.last = { x: P.x, z: P.z };
          if (c.t <= 0 || !c.last || Math.hypot(c.last.x - c.x, c.last.z - c.z) < 0.9) { c.state = 'home'; c.pathT = 0; break; }
          want = this.toward(c, c.last.x, c.last.z, dt); speed *= 0.7;
          break;
        case 'home':
          if (aware) { this.rouse(c, dist); break; }
          if (heard) { c.last = { x: P.x, z: P.z }; c.state = 'search'; c.t = 9; c.pathT = 0; break; }
          if (Math.hypot(c.home.x - c.x, c.home.z - c.z) < 0.5) { c.state = 'idle'; break; }
          want = this.toward(c, c.home.x, c.home.z, dt); speed *= 0.6;
          break;
        case 'chase':
          if (!P.alive) { c.state = 'home'; c.pathT = 0; break; }
          if (c.seen > 5) { c.state = 'search'; c.t = 9; c.pathT = 0; break; }
          if (def.fleeAt && !c.fled && c.hp < def.health * def.fleeAt) { c.fled = true; c.state = 'flee'; c.t = 4; break; }
          if (los && dist < reach - 0.2 && Math.abs(dy) < 1.3) { c.state = 'windup'; c.t = def.attack.windup; break; }
          if (c.last) want = this.toward(c, c.last.x, c.last.z, dt, los && dist < 3 && Math.abs(dy) < 0.8);
          break;
        case 'windup':                                       // the warning before the blow
          if (c.t <= 0) {
            c.state = 'strike'; c.t = 0.28;
            play(def.kind === 'beast' ? 'bite' : 'swing', dist);
            if (P.alive && los && dist < reach + 0.35 && Math.abs(dy) < 1.4) {
              this.hooks.onStrike(c, def.attack.damage * (0.85 + Math.random() * 0.3), def.attack.type);
            }
          }
          break;
        case 'strike':
          if (c.t <= 0 && c.state === 'strike') { c.state = 'recover'; c.t = def.attack.recover; }
          break;
        case 'recover':
        case 'hurt':
          if (c.t <= 0) c.state = 'chase';
          break;
        case 'flee':
          if (c.t <= 0) { c.state = 'chase'; break; }
          want = [c.x - dx / (dist || 1) * 3, c.z - dz / (dist || 1) * 3]; speed *= 1.15;
          break;
      }
      if (HUNTING.has(c.state)) this.hunting++;

      // moving, being knocked back, and falling
      c.moving = false;
      if (want && !(c.state === 'chase' && dist < reach - 0.3)) c.moving = this.move(c, want[0], want[1], speed, dt);
      if (c.kx || c.kz) {
        this.move(c, c.x + c.kx, c.z + c.kz, Math.hypot(c.kx, c.kz), dt);
        const k = Math.max(0, 1 - dt * 7); c.kx *= k; c.kz *= k;
        if (Math.abs(c.kx) + Math.abs(c.kz) < 0.05) c.kx = c.kz = 0;
      }
      const g = this.groundAt(c);
      if (c.y - g > 0.02) { c.vy -= G * dt; c.y = Math.max(g, c.y + c.vy * dt); } else { c.y = g; c.vy = 0; }

      // it and the player cannot stand in the same place
      const min = def.radius + P.r, d2 = Math.hypot(P.x - c.x, P.z - c.z);
      if (d2 < min && d2 > 0.001 && Math.abs(dy) < 1.5) {
        const nx = (P.x - c.x) / d2, nz = (P.z - c.z) / d2, push = min - d2;
        if (!this.hooks.pushPlayer(nx * push, nz * push) && this.canStand(c, c.x - nx * push, c.z - nz * push, c.y)) {
          c.x -= nx * push; c.z -= nz * push;
        }
      }
      this.draw(c, dt, P, brightnessAt);
    }
    // nor can two creatures
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j];
      if (a.state === 'dead' || b.state === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.def.radius + b.def.radius;
      if (d >= min || d < 0.001 || Math.abs(a.y - b.y) > 1.5) continue;
      const px = dx / d * (min - d) / 2, pz = dz / d * (min - d) / 2;
      if (this.canStand(a, a.x - px, a.z - pz, a.y)) { a.x -= px; a.z -= pz; }
      if (this.canStand(b, b.x + px, b.z + pz, b.y)) { b.x += px; b.z += pz; }
    }
  }

  draw(c, dt, P, brightnessAt) {
    let pose = 'idle', lunge = 0;
    if (c.state === 'dead') pose = 'dead';
    else if (c.state === 'windup') pose = 'windup';
    else if (c.state === 'strike') { pose = 'strike'; lunge = 0.4; }
    else if (c.moving) { c.anim += dt * (2 + c.def.speed); pose = (c.anim | 0) % 2 ? 'step' : 'idle'; }
    if (pose !== c.pose) { c.pose = pose; c.spr.material.map = this.texture(c.def, pose); }
    const h = c.def.height * (pose === 'strike' ? 1.14 : pose === 'dead' ? (c.def.deadSize || 1) : 1);
    c.spr.scale.set(h * c.aspect, h, 1);
    const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz) || 1;
    const shake = c.state === 'windup' ? Math.sin(c.t * 60) * 0.015 : 0;
    c.spr.position.set(c.x + dx / d * lunge + shake, c.y - 0.03, c.z + dz / d * lunge);
    const b = brightnessAt(c.x, c.y + c.def.height * 0.6, c.z);
    if (c.flash > 0 && c.dull) c.spr.material.color.setScalar(Math.min(1.3, b * 1.3 + 0.25));      // a blow that did little: a pale flash
    else if (c.flash > 0) c.spr.material.color.setRGB(Math.min(1.4, b * 1.6 + 0.35), b * 0.35, b * 0.3);
    else c.spr.material.color.setScalar(b);
  }

  // The creature the eye is looking at, for the words under the crosshair.
  target(eye, dir, reach = 7) {
    let best = null, bestT = reach;
    for (const c of this.list) {
      const h = c.state === 'dead' ? 0.4 : c.def.height, vx = c.x - eye.x, vy = c.y + h / 2 - eye.y, vz = c.z - eye.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t <= 0 || t >= bestT) continue;
      const px = eye.x + dir.x * t, py = eye.y + dir.y * t, pz = eye.z + dir.z * t;
      if (Math.hypot(px - c.x, pz - c.z) > c.def.radius * 1.5 + 0.1 || Math.abs(py - (c.y + h / 2)) > h / 2 + 0.1) continue;
      if (!this.sees(eye.x, eye.y, eye.z, c.x, c.y + h * 0.6, c.z)) continue;
      best = c; bestT = t;
    }
    return best;
  }

  // The nearest dead creature that has something to take from it (def.skin), has not been taken from yet, and lies within arm's
  // reach in front of you. Loose on purpose: you only need to be facing it and near, not have the crosshair on it.
  skinnable(eye, dir, reach = 2.0) {
    const fl = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / fl, fz = dir.z / fl;
    let best = null, bd = reach;
    for (const c of this.list) {
      if (c.state !== 'dead' || !c.def.skin || c.skinned) continue;
      const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz) - c.def.radius * 0.5;
      if (d > bd || eye.y - c.y > 3 || c.y > eye.y) continue;
      if (d > 0.5 && (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.55) continue;
      if (!this.sees(eye.x, eye.y, eye.z, c.x, c.y + 0.3, c.z)) continue;
      best = c; bd = d;
    }
    return best;
  }

  // Living creatures in front of the player within reach, nearest first. half = half the width of the swing, in radians.
  inArc(P, yaw, reach, half) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), out = [];
    for (const c of this.list) {
      if (c.state === 'dead') continue;
      const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz), gap = d - c.def.radius;
      if (gap > reach || c.y > P.y + 1.9 || c.y + c.def.height < P.y - 0.3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      if (ang > half + Math.atan2(c.def.radius, Math.max(0.2, d))) continue;
      if (!this.sees(P.x, P.eyeY, P.z, c.x, c.y + c.def.height * 0.6, c.z)) continue;
      out.push([gap, c]);
    }
    return out.sort((a, b) => a[0] - b[0]).map(e => e[1]);
  }
}
