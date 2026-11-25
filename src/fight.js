// The player's side of a fight: health and stamina, winding up and striking, blocking, dodging,
// and the weapon shown in the view. Weapon numbers are in data/items.json ("weapon" and "block").
import * as THREE from 'three';
import { iconCanvas } from './items.js';
import { art, HELD_AT } from './art.js';
import { play } from './sound.js';

const FISTS = { id: '_fists', name: 'Fists', weight: 0, icon: ['#c9966b', 'disc'], block: 0.2,
  weapon: { damage: 2, type: 'crush', reach: 0.9, wind: 0.4, recover: 0.3 } };
// The three blows. dmg and cost multiply the weapon's own numbers; reach is added; arc is half the width of the swing.
export const MOVES = {
  high: { name: 'Overhead', dmg: 1.35, cost: 1.4, reach: 0, arc: 0.45 },
  mid: { name: 'Slash', dmg: 1, cost: 1, reach: 0, arc: 0.9, all: true },        // a slash hits everything in front of you
  low: { name: 'Thrust', dmg: 0.85, cost: 0.8, reach: 0.4, arc: 0.35 },
};
// What a blow is called, and how it behaves, follows the damage the weapon does: an axe-edge chops and slashes, a point stabs,
// a heavy head smashes and swings. Only cutting and crushing blows sweep across several enemies; a stab hits one, narrowly.
const SAYS = { cut: ['Chop', 'Slash', 'Thrust'], stab: ['Downward stab', 'Stab', 'Thrust'], crush: ['Smash', 'Swing', 'Jab'], fists: ['Haymaker', 'Hook', 'Jab'] };
export function blowOf(w, move) {
  const m = MOVES[move], kind = w.id === '_fists' ? 'fists' : w.weapon.type, n = move === 'high' ? 0 : move === 'mid' ? 1 : 2;
  const name = kind === 'cut' && move === 'low' && !w.weapon.thrust ? 'Jab' : SAYS[kind][n];
  return { ...m, name, all: !!m.all && (kind === 'cut' || kind === 'crush'), arc: kind === 'stab' && move === 'mid' ? 0.45 : m.arc };
}
const SWING = 0.26;       // seconds a blow takes
const KIND = { cut: 'Cutting', stab: 'Stabbing', crush: 'Crushing' };
const lerp = (a, b, t) => a + (b - a) * t;
// The hand and weapon in the view (a picture from art/held, turned about the fist).
// Each is [right, up, forward, roll, tip]: where the fist is, how far the weapon leans left, and how far its point tips
// back toward you (+) or forward into the room (-). wind(c): winding up, c from 0 to 1. swing(k): the blow, k from 0 to 1.
const sin = Math.sin, PI = Math.PI;
const REST_DROP = -0.15;      // how far the hands are lowered when they are not striking or guarding
const HELD = {
  ready: [0.3, -0.37, -0.72, -0.28, 0],
  light: [0.31, -0.3, -0.72, -0.06, 0],
  block: [0.02, -0.27, -0.62, 0.22, 0.2],
  high: { wind: c => [0.27, -0.33 + 0.2 * c, -0.7, -0.28 - 0.2 * c, 0.9 * c], swing: k => [0.22 - 0.08 * k, -0.13 - 0.28 * k, -0.72 - 0.1 * k, -0.48 + 0.4 * k, 0.9 - 2.1 * k] },
  mid: { wind: c => [0.33 + 0.2 * c, -0.36 + 0.05 * c, -0.7, -0.28 - 0.5 * c, 0.1 * c],
    swing: k => [0.53 - 0.62 * k, -0.31 - 0.07 * sin(PI * k), -0.7, -0.78 + 0.95 * k, -0.4 * sin(PI * k)] },
  low: { wind: c => [0.3, -0.39, -0.72 + 0.2 * c, -0.28, -0.45 * c],
    swing: k => [0.3 - 0.2 * k, -0.39 + 0.1 * k, -0.52 - 0.5 * sin(PI * Math.min(1, k * 1.15)), -0.24, -0.45 - 0.5 * k] },
};

export class Fight {
  constructor({ camera, player, inv, creatures, ui }) {
    Object.assign(this, { camera, player, inv, creatures, ui });
    this.hpMax = 50; this.hp = 50; this.stMax = 100; this.st = 100;
    this.winding = false; this.charge = 0; this.move = 'mid'; this.swing = 0; this.cool = 0; this.landed = true;
    this.blocking = false; this.blockT = 0; this.stWait = 0; this.dodgeCd = 0; this.hurtT = 0; this.noise = 0;
    this.kick = 0; this.kickT = 0; this.kickSide = 0;          // being hit: see jolt()
    this.dead = false; this.calm = 0; this.told = new Set(); this.onDeath = () => {};
    this.regenMul = 1; this.stCap = 1;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthTest: false, fog: false }));
    this.mesh.renderOrder = 10;
    camera.add(this.mesh);
    this.maps = {}; this.pose = [0.34, -0.3, -0.62, -0.5, 0]; this.hand = 1;
    this.geoIcon = this.mesh.geometry;
    this.geoHeld = new THREE.PlaneGeometry(1, 1).translate(0.5 - HELD_AT[0], HELD_AT[1] - 0.5, 0);    // turns about the fist
  }

  // The picture of the arm stops at its corner. This carries the sleeve on past it, so that no cut-off end
  // shows however the arm is turned.
  makeSleeve(im) {
    const S = im.width, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, S, S).data, solid = (x, y) => d[(y * S + x) * 4 + 3] > 128;
    // walk down the right edge and back along the bottom edge: the first and last solid pixels are where the arm leaves
    const path = [];
    for (let y = 0; y < S; y++) path.push([S - 1, y, S, y]);
    for (let x = S - 2; x >= 0; x--) path.push([x, S - 1, x, S]);
    const on = path.filter(q => solid(q[0], q[1]));
    if (on.length < 4) return null;
    const A = on[0], B = on[on.length - 1];
    const at = (x, y) => [x / S - HELD_AT[0], HELD_AT[1] - y / S];
    const p1 = at(A[2], A[3]), p2 = at(B[2], B[3]), vx = p2[0] - p1[0], vy = p2[1] - p1[1], len = Math.hypot(vx, vy) || 1;
    let nx = vy / len, ny = -vx / len;                               // straight on down the arm, away from the fist
    if (nx * (p1[0] + p2[0]) + ny * (p1[1] + p2[1]) < 0) { nx = -nx; ny = -ny; }
    nx *= 1.8; ny *= 1.8;
    // a patch of the sleeve, taken a little way in from where it leaves, to cover the rest
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, fx = HELD_AT[0] * S - mx, fy = HELD_AT[1] * S - my, fl = Math.hypot(fx, fy) || 1;
    const px = Math.max(0, Math.min(S - 32, Math.round(mx + fx / fl * 26 - 16))), py = Math.max(0, Math.min(S - 32, Math.round(my + fy / fl * 26 - 16)));
    const patch = document.createElement('canvas');
    patch.width = patch.height = 32;
    patch.getContext('2d').drawImage(im, px, py, 32, 32, 0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(patch);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([p1[0], p1[1], 0, p1[0] + nx, p1[1] + ny, 0, p2[0] + nx, p2[1] + ny, 0, p2[0], p2[1], 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 20, 3, 20, 3, 0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, depthTest: false, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = 9;
    return m;
  }

  // What the hand that is striking strikes with: the weapon in it, or a bare fist.
  weapon() { const it = this.inv.hands[this.hand]; return it && it.def.weapon ? it.def : FISTS; }
  // The hand that strikes when a key or a trigger is used, where no hand is named: the one with a weapon in it.
  mainHand() {
    const h = this.inv.hands, free = i => !h[i] || !h[i].def.light;
    return h[1] && h[1].def.weapon ? 1 : h[0] && h[0].def.weapon ? 0 : free(1) ? 1 : 0;
  }
  // Would a blow struck now reach this creature? aim: 'high' | 'mid' | 'low'.
  reaches(c, aim) {
    const busy = this.winding || this.swing > 0, it = this.inv.hands[busy ? this.hand : this.mainHand()];
    const w = it && it.def.weapon ? it.def : FISTS, wp = w.weapon, m = blowOf(w, busy ? this.move : aim || 'mid'), P = this.player;
    return this.creatures.inArc({ x: P.pos.x, y: P.pos.y, z: P.pos.z, eyeY: P.eyeY }, P.yaw, wp.reach + m.reach + 0.3, m.arc).includes(c);
  }
  blowName() { return blowOf(this.weapon(), this.move).name; }      // what the blow being wound up is called, for the screen
  guard() {                 // what you block with: the best of what is in your hands
    let best = FISTS;
    for (const it of this.inv.hands) if (it && (it.def.block || 0) > best.block) best = it.def;
    return best;
  }

  // ctl: { attack, hand: 1 right or 0 left (which hand strikes), cancel: drop a wind-up without striking,
  //        block, dodge: [x, z] in the world or null, aim: 'high' | 'mid' | 'low' }
  update(dt, ctl, bright) {
    if (this.dead) { this.mesh.visible = false; if (this.h) for (const H of this.h) H.mesh.visible = false; return; }
    if (ctl.attack && !this.winding && this.swing <= 0 && ctl.hand >= 0) this.hand = ctl.hand;
    if (ctl.cancel && this.winding) { this.winding = false; this.charge = 0; }
    const w = this.weapon(), wp = w.weapon;
    this.cool = Math.max(0, this.cool - dt); this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt); this.noise = Math.max(0, this.noise - dt * 1.5);
    this.kickT += dt; this.kick = Math.max(0, this.kick - dt * 2.6);

    const wantBlock = ctl.block && this.swing <= 0 && !this.winding;
    if (wantBlock && !this.blocking) this.blockT = 0;
    this.blocking = wantBlock && this.st > 0;
    if (this.blocking) this.blockT += dt;

    if (this.swing > 0) {
      this.swing -= dt;
      if (!this.landed && this.swing <= SWING * 0.45) { this.landed = true; this.land(w); }
      if (this.swing <= 0) this.cool = wp.recover;
    } else if (ctl.attack && !this.blocking && this.cool <= 0) {       // held: winding up
      if (!this.winding) { this.winding = true; this.charge = 0; }
      this.charge = Math.min(1, this.charge + dt / wp.wind);
      this.move = ctl.aim || 'mid';
    } else if (this.winding) {                                         // let go: the blow
      this.winding = false;
      const cost = (7 + 14 * this.charge + (w.weight || 0) * 2) * MOVES[this.move].cost;
      this.tired = this.st < cost;
      this.st = Math.max(0, this.st - cost); this.stWait = 0.9;
      this.power = this.charge; this.swing = SWING; this.landed = false; this.noise = 1;
      play('swing');
      if (this.tired) this.ui.say('You are out of breath. Your blow is weak.');
    }

    if (ctl.dodge && this.dodgeCd <= 0 && this.player.onGround && !this.player.swimming) {
      if (this.st < 15) this.ui.say('You are too tired to dodge.');
      else {
        this.st -= 15; this.stWait = 0.9; this.dodgeCd = 0.7; this.winding = false;
        this.player.dash(ctl.dodge[0], ctl.dodge[1]);
        play('dodge');
      }
    }

    this.stWait -= dt;
    // Stamina comes back by itself. Hunger slows it (regenMul) and tiredness lowers the most you can have (stCap).
    const cap = this.stMax * this.stCap;
    if (this.stWait <= 0 && !this.winding && this.st < cap) this.st = Math.min(cap, this.st + (this.blocking ? 5 : 18) * this.regenMul * dt);
    if (this.st > cap) this.st = Math.max(cap, this.st - 30 * dt);
    this.calm = this.creatures.hunting ? 0 : this.calm + dt;       // seconds since anything was after you

    this.show(dt, w, bright);
  }

  // The blow arrives: who is in the way?
  land(w) {
    const m = blowOf(w, this.move), wp = w.weapon, P = this.player;
    const type = this.move === 'low' && wp.thrust ? wp.thrust : wp.type;
    const me = { x: P.pos.x, y: P.pos.y, z: P.pos.z, eyeY: P.eyeY };
    const hits = this.creatures.inArc(me, P.yaw, wp.reach + m.reach + 0.3, m.arc);
    const held = this.inv.hands[this.hand], might = held && held.def === w ? held.might : 1;      // the weapon's level
    const blow = () => wp.damage * might * m.dmg * (0.35 + 2.0 * this.power) * (this.tired ? 0.5 : 1) * (0.9 + Math.random() * 0.2);
    // nothing alive in the way: the blow may land on an urn
    if (!hits.length && this.onNone) this.onNone(wp.reach + m.reach + 0.3);
    if (!hits.length && this.onMiss) this.onMiss(me, P.yaw, wp.reach + m.reach + 0.2, m.arc, blow(), type, KIND[type]);
    if (hits.length) this.wear();
    for (const c of m.all ? hits : hits.slice(0, 1)) {
      const dmg = blow();
      const bare = w === FISTS, res = this.creatures.hurt(c, dmg, type, me.x, me.z, 0.5 + this.power, bare);
      if (!res) continue;
      const bones = c.def.look && c.def.look.detail === 'bones';
      play(res.weak <= 0.6 ? 'glance' : bones ? (res.weak >= 1.5 ? 'crack' : 'bone') : 'hit');
      if (this.onHit) this.onHit(c, res);
      const name = c.def.name.toLowerCase(), key = c.def.id + (bare ? 'bare' : type), what = bare ? 'Your fists' : KIND[type] + ' blows';
      const torch = this.inv.hands[this.hand];
      if (wp.fire && torch && torch.lit && !res.killed && ((c.def.weak || {}).fire ?? 1) > 0) {
        if (!(c.burn > 0)) this.ui.say(`The ${name} catches fire.`);
        c.burn = 5; this.creatures.rouse(c, 3);
      }
      if (res.killed) this.ui.say(`The ${name} is dead.`);
      else if (!this.told.has(key) && (res.weak <= 0.6 || res.weak >= 1.5)) {
        this.told.add(key);
        this.ui.say(res.weak <= 0.2 ? `${what} do almost nothing to the ${name}. Try something heavy.`
          : res.weak < 1 ? `${what} do little to the ${name}.` : `${what} hurt the ${name} badly.`);
      }
    }
  }

  // A weapon that can break (a bone) loses some of its life with each blow that lands, and snaps at the end of it.
  wear() {
    const it = this.inv.hands[this.hand];
    if (!it || !it.def.durability || !it.def.weapon) return;
    it.n--;
    this.inv.version++;
    if (it.n <= 0) {
      this.inv.hands[this.hand] = null; this.winding = false; this.inv.version++;
      play('crack'); this.ui.say(`Your ${it.def.name.toLowerCase()} snaps.`);
    }
  }

  // How much of a blow your armour takes (0 to 0.6): what you wear on your body and your head, added up.
  armour() { let a = 0; for (const it of [this.inv.body[0], this.inv.head[0]]) if (it) a += it.def.armour || 0; return Math.min(0.6, a); }
  // Harm that is not a blow (drowning, fire, a fall). cause is passed on to onDeath.
  harm(dmg, cause) {
    if (this.dead) return;
    if (cause === 'burned') dmg *= 1 - this.armour() * 0.5;      // armour is half as much use against fire
    this.hp -= dmg; this.hurtT = 0.5; this.calm = 0;
    play('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.winding = false; play('death'); this.onDeath(null, cause); }
  }

  // A creature's blow arrives.
  takeHit(c, dmg) {
    if (this.dead) return;
    const P = this.player, dx = c.x - P.pos.x, dz = c.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    const front = (dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d > 0.3;
    if (this.blocking && front) {
      if (this.blockT < 0.4) {                        // a guard raised at the last moment turns the blow aside
        play('parry'); this.creatures.stagger(c, 0.9);
        this.st = Math.max(0, this.st - 4); this.stWait = 0.5;
        return;
      }
      const stopped = dmg * this.guard().block;
      dmg -= stopped;
      this.st = Math.max(0, this.st - stopped * 2 - 2); this.stWait = 0.9;
      play('block');
      if (this.st <= 0) this.ui.say('Your guard is broken.');
    }
    dmg *= 1 - this.armour();                       // what you wear takes its share of the blow
    if (dmg < 0.5) return;
    this.hp -= dmg; this.hurtT = 0.5; this.calm = 0;
    this.jolt(-dx / d, -dz / d, dmg);
    play('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.winding = false; play('death'); this.onDeath(c); }
  }

  // Being hit is felt: the view flashes red and is knocked away from the blow, and you are shoved back a little
  // (never over an edge: where the floor drops away behind you, you stagger on the spot instead).
  // kick runs from 1 down to 0; the game turns it into the flash and the jerk of the head.
  jolt(ax, az, dmg) {
    const k = Math.min(1, 0.45 + dmg / 15), P = this.player, L = P.level;
    this.kick = k; this.kickT = 0;
    // which way the head is knocked, seen from where you look: positive = the blow came from the left
    this.kickSide = -(ax * Math.cos(P.yaw) - az * Math.sin(P.yaw));
    const shove = 3.2 * k, bx = P.pos.x + ax * 0.7, bz = P.pos.z + az * 0.7;
    if (!P.swimming && L.floorAt(bx, bz) > P.pos.y - 0.6) { P.vx += ax * shove; P.vz += az * shove; }
  }

  // The weapon in the corner of the view.
  // The texture for a picture, made once.
  tex(key, image) {
    if (!this.maps[key]) {
      const t = this.maps[key] = new THREE.CanvasTexture(image);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    }
    return this.maps[key];
  }
  // Shows the sleeve that goes with this hand picture, and hides the others.
  sleeveFor(mesh, key, pic) {
    const all = mesh.userData.sleeves || (mesh.userData.sleeves = {});
    if (pic && !(key in all)) { all[key] = this.makeSleeve(pic); if (all[key]) mesh.add(all[key]); }
    for (const k in all) if (all[k]) { all[k].visible = !!pic && k === key; all[k].material.color.copy(mesh.material.color); }
  }
  makeHand() {
    const mesh = new THREE.Mesh(this.geoHeld, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthTest: false, fog: false }));
    mesh.renderOrder = 10;
    const thing = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, depthTest: false, fog: false }));
    thing.position.set(-0.02, 0.17, 0); thing.renderOrder = 11;
    mesh.add(thing);
    this.camera.add(mesh);
    return { mesh, thing, pose: [0.3, -0.7, -0.72, 0, 0] };
  }

  // The two hands in the view. Hand 1 is your right hand and hand 0 your left, each holding what is in that hand's place.
  // The pictures are all right hands (art/held); the left hand is one turned over. A thing with no hand picture of its
  // own is shown above a closed fist. An empty left hand stays out of sight unless you guard with it.
  show(dt, w, bright) {
    this.mesh.visible = false;                    // the old single picture is no longer used
    const fist = art.held.fist;
    if (!fist) return;
    if (!this.h) this.h = [this.makeHand(), this.makeHand()];
    const hands = this.inv.hands, guard = this.guard();
    let blockHand = hands.findIndex(it => it && it.def === guard);
    if (blockHand < 0) blockHand = !hands[0] ? 0 : !hands[1] ? 1 : 0;
    const edge = Math.max(0.2, 0.5 * this.camera.aspect - 0.1);       // keep the hands in sight on a narrow screen
    for (let i = 0; i < 2; i++) {
      const H = this.h[i], it = hands[i], side = i === 1 ? 1 : -1;
      const acting = this.hand === i && (this.swing > 0 || this.winding), guarding = this.blocking && blockHand === i;
      if (!it && i === 0 && !acting && !guarding) { H.mesh.visible = false; H.pose[1] = -0.7; continue; }
      const pic = it && (it.def.art || it.def.id);       // an item may borrow another's pictures ("art" in data/items.json)
      const lit = it && it.lit && art.held[pic + '_lit'], own = it ? (lit || art.held[pic]) : fist;
      const key = (it ? it.def.id : 'fist') + (lit ? ':lit' : '') + (own ? '' : ':fist');
      const map = this.tex(key, own || fist);
      if (H.mesh.material.map !== map) { H.mesh.material.map = map; H.mesh.material.needsUpdate = true; }
      H.thing.visible = !own;
      if (!own) {
        const imap = this.tex('icon:' + it.def.id, iconCanvas(it.def));
        if (H.thing.material.map !== imap) { H.thing.material.map = imap; H.thing.material.needsUpdate = true; }
      }
      let to = it && it.def.light && !it.def.weapon ? HELD.light : HELD.ready, snap = false;      // a light is carried higher, hanging straight
      if (this.hand === i && this.swing > 0) { snap = true; to = HELD[this.move].swing(1 - this.swing / SWING); }
      else if (this.hand === i && this.winding) to = HELD[this.move].wind(this.charge);
      else if (guarding) to = HELD.block;
      else to = [to[0], to[1] + REST_DROP, to[2], to[3], to[4]];      // at rest and winding up, the hands hang low in the view
      const k = snap ? 1 : Math.min(1, dt * 16);
      H.pose = H.pose.map((v, n) => lerp(v, to[n], k));
      H.mesh.visible = true;
      H.mesh.position.set(side * Math.max(-edge, Math.min(edge, H.pose[0])), H.pose[1], H.pose[2]);
      H.mesh.rotation.set(H.pose[4], 0, side * H.pose[3]);
      const hs = 0.64 * (it && it.def.heldScale || 1);      // a weapon may be drawn larger in the hand ("heldScale" in data/items.json)
      H.mesh.scale.set(side * hs, hs, 1);
      const glow = it && it.lit ? Math.max(0.85, Math.min(1, 0.22 + bright)) : Math.min(1, 0.22 + bright);      // a burning light is not dimmed
      H.mesh.material.color.setScalar(glow);
      H.thing.material.color.setScalar(glow);
      this.sleeveFor(H.mesh, key, own || fist);
    }
  }
}
