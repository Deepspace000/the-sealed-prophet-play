// Things you can carry: what the player holds (Inventory) and what lies in the level (WorldItems).
// Item kinds are listed in data/items.json.
import * as THREE from 'three';
import { art } from './art.js';

export class Item {
  constructor(def) {
    this.def = def;
    if (def.holds) this.inside = new Array(def.holds).fill(null);
    // n: how much is left: matches in the box, drinks in the canteen, or seconds of burning in a light
    if (def.count) this.n = def.count;
    else if (def.drinks) this.n = def.drinks;
    else if (def.light) this.n = def.light.start ?? def.light.burn;
    else if (def.durability) this.n = def.durability;       // blows it can take before it breaks
    this.lit = false;
  }
  get weight() {
    let w = this.def.weight;
    if (this.inside) for (const it of this.inside) if (it) w += it.weight;
    return w;
  }
  contains(other) {
    return !!this.inside && this.inside.some(it => it && (it === other || it.contains(other)));
  }
}

// Places to keep things: two hands, four belt places (small things only), your back (a knapsack),
// the knapsack's own places ("pack"), and whichever bag is open ("bag").
// "held" is the thing you have picked up and are moving about.
export class Inventory {
  constructor() {
    this.hands = [null, null];
    this.belt = [null, null, null, null];
    this.back = [null];
    this.held = null;
    this.open = null;
    this.capacity = 25;       // kilograms carried before you slow down
    this.version = 0;         // goes up whenever something changes
  }
  arr(area) {
    if (area === 'pack') return this.back[0] ? this.back[0].inside : null;
    if (area === 'bag') return this.open ? this.open.inside : null;
    return this[area];
  }
  fits(item, area) {
    if (area === 'back') return item.def.wear === 'back';
    if (area === 'belt') return item.def.size <= 1;
    if (area === 'pack') return item.def.size <= this.back[0].def.maxSize;
    if (area === 'bag') return item.def.size <= this.open.def.maxSize;
    return true;
  }
  lifted(item) {              // an open bag closes when it, or the bag it is in, is picked up
    if (this.open && (item === this.open || item.contains(this.open))) this.open = null;
  }
  // Click on a place: pick up, put down, swap, or drop into a bag. Returns 'no' if it will not fit.
  click(area, i) {
    const arr = this.arr(area);
    if (!arr) return;
    const cur = arr[i];
    this.version++;
    if (!this.held) {
      if (cur) { arr[i] = null; this.held = cur; this.lifted(cur); }
      return;
    }
    if (cur && cur.inside) {
      const j = cur.inside.indexOf(null);
      if (j >= 0 && this.held.def.size <= cur.def.maxSize) { cur.inside[j] = this.held; this.held = null; return; }
    }
    if (!this.fits(this.held, area)) return 'no';
    arr[i] = this.held;
    this.held = cur || null;
    if (cur) this.lifted(cur);
  }
  toggleOpen(item) { this.open = this.open === item ? null : item; this.version++; }
  // Every thing carried, bags within bags included, as [item, the list it sits in, its place in that list].
  *all() {
    function* walk(arr) {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it) continue;
        yield [it, arr, i];
        if (it.inside) yield* walk(it.inside);
      }
    }
    for (const a of ['hands', 'belt', 'back']) yield* walk(this[a]);
    if (this.held) { yield [this.held, null, -1]; if (this.held.inside) yield* walk(this.held.inside); }
  }
  remove(item) {
    for (const [it, arr, i] of this.all()) {
      if (it !== item) continue;
      if (arr) arr[i] = null; else this.held = null;
      this.lifted(item); this.version++;
      return true;
    }
    return false;
  }
  // Take something from the world. Returns where it went, or null if there is no room.
  // A weapon, a shield or a light goes into an empty hand if there is one. Everything else goes into the pack first,
  // then the belt, then any other bag, and into an empty hand only if there is nowhere else.
  // What you already hold in your hands is never moved to make room.
  add(item) {
    const tryArea = area => {
      const arr = this.arr(area);
      if (!arr || !this.fits(item, area)) return false;
      const i = arr.indexOf(null);
      if (i < 0) return false;
      arr[i] = item; this.version++;
      return true;
    };
    const d = item.def;
    if (d.wear === 'back' && tryArea('back')) return 'back';
    if ((d.weapon || d.block || d.light) && tryArea('hands')) return 'hands';
    for (const area of ['pack', 'belt']) if (tryArea(area)) return area;
    for (const [bag] of this.all()) {                 // any other bag you carry
      if (!bag.inside || bag === item || d.size > bag.def.maxSize) continue;
      const i = bag.inside.indexOf(null);
      if (i >= 0) { bag.inside[i] = item; this.version++; return 'bag'; }
    }
    return tryArea('hands') ? 'hands' : null;
  }
  get weight() {
    let w = this.held ? this.held.weight : 0;
    for (const area of ['hands', 'belt', 'back']) for (const it of this[area]) if (it) w += it.weight;
    return w;
  }
}

// ---- stand-in pictures: a coloured shape, 16 pixels square. To be replaced by real art. ----
const SHAPES = {
  disc: (x, y) => x * x + y * y < 0.5,
  box: (x, y) => Math.abs(x) < 0.7 && Math.abs(y) < 0.5,
  bag: (x, y) => x * x + (y - 0.2) * (y - 0.2) < 0.45 || (Math.abs(x) < 0.22 && y < -0.3 && y > -0.85),
  stick: (x, y) => Math.abs(x + y) < 0.24 && Math.abs(x - y) < 1.3,
  bottle: (x, y) => (Math.abs(x) < 0.42 && y > -0.3 && y < 0.85) || (Math.abs(x) < 0.2 && y <= -0.3 && y > -0.85),
  ring: (x, y) => { const r = x * x + y * y; return r > 0.16 && r < 0.62; },
  tool: (x, y) => (Math.abs(x + y) < 0.2 && Math.abs(x - y) < 1.3) || (Math.abs(x - y - 1.0) < 0.26 && Math.abs(x + y) < 1.0),
};
const iconCache = {};
// "art" in data/items.json: the thing uses the pictures of another (an old, worn sword drawn as the curved sword)
export const artId = def => def.art || def.id;
export function iconCanvas(def) {
  if (art.items[artId(def)]) return art.items[artId(def)];        // a real picture
  if (iconCache[def.id]) return iconCache[def.id];
  const S = 16, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), [hex, shape] = def.icon || ['#999999', 'box'];
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const inside = (px, py) => SHAPES[shape]((px + 0.5) / S * 2 - 1, (py + 0.5) / S * 2 - 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const k = edge ? 0.45 : (x + y < S - 3 ? 1.15 : 0.9);
    g.fillStyle = `rgb(${rgb.map(v => Math.min(255, v * k) | 0).join(',')})`;
    g.fillRect(x, y, 1, 1);
  }
  return (iconCache[def.id] = c);
}
const urlCache = {};
export const hasArt = def => !!art.items[artId(def)];
export const iconURL = def => hasArt(def) ? art.items[artId(def)].src : urlCache[def.id] || (urlCache[def.id] = iconCanvas(def).toDataURL());

let halo = null;                               // a soft round glow, made once
const haloTex = () => halo || (halo = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.25, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})());

export class WorldItems {
  constructor(scene, level) { this.scene = scene; this.level = level; this.list = []; this.spare = []; }
  place(item, x, z) {
    const real = hasArt(item.def), tex = new THREE.CanvasTexture(iconCanvas(item.def));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = real ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const glow = item.def.glow;              // "glow": a colour. The thing shines: no fog dims it, a soft halo and a little light round it
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: !glow, alphaTest: real ? 0.4 : 0 }));
    // bigger things look bigger; a long thing gives the size of its picture in metres as "floor"
    const big = item.def.floor || (real ? 0.34 + 0.1 * Math.min(3, item.def.size || 1) : 0.46);
    const y = this.level.floorAt(x, z) + big * 0.5;
    spr.scale.set(big, big, 1);
    spr.position.set(x, y, z);
    if (glow) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      halo.scale.set(2.6, 2.6, 1); halo.position.z = -0.01; halo.renderOrder = -1;
      const light = this.spare.pop() || new THREE.PointLight(glow, 2.2, 4.5, 2);       // a put-out one is used again if there is one
      light.color.set(glow); light.intensity = 2.2; light.position.set(0, 0, 0);
      spr.add(halo, light);
    }
    this.scene.add(spr);
    const e = { item, spr, x, y, z };
    this.list.push(e);
    return e;
  }
  remove(e) {
    // a glowing thing's light stays in the scene, put out: taking a light away makes three.js rebuild every shader (a freeze)
    const light = e.spr.children.find(o => o.isPointLight);
    if (light) { light.intensity = 0; light.position.copy(e.spr.position); this.scene.add(light); this.spare.push(light); }
    this.scene.remove(e.spr);
    e.spr.material.map.dispose(); e.spr.material.dispose();
    this.list.splice(this.list.indexOf(e), 1);
  }
  // The thing nearest to the line from the eye along dir, within reach and not behind a wall.
  target(eye, dir, reach = 2.6, tol = 0.2) {
    let best = null, bestA = tol;
    for (const e of this.list) {
      const dx = e.x - eye.x, dy = e.y - eye.y, dz = e.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > reach) continue;
      const a = Math.acos(Math.min(1, (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1)));
      if (a >= bestA) continue;
      let clear = true;
      for (let t = 0.2; t < 0.9 && clear; t += 0.2) {
        const x = eye.x + dx * t, y = eye.y + dy * t, z = eye.z + dz * t;
        if (this.level.floorAt(x, z) > y || this.level.ceilAt(x, z) < y) clear = false;
      }
      if (clear) { best = e; bestA = a; }
    }
    return best;
  }
  light(brightnessAt) {
    for (const e of this.list) e.spr.material.color.setScalar(brightnessAt(e.x, e.y, e.z));
  }
}
