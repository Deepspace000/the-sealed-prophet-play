// People: someone standing in a level whom you can speak to (F, X, or a tap). They are not creatures: they do not fight or
// wander. Who they are is in data/people.json; where they stand is in a level's "people": { id, cell, at, when }.
// "when" says in which part of their story they stand there (the game keeps that in the save, as flags[id]); someone whose
// story is somewhere else is not there. A level may name the first part ("caged"): with no flag yet, that is where they are.
import * as THREE from 'three';
import { creatureFrames } from './standin_creatures.js';

export class People {
  constructor({ scene, level, people = [], defs = {}, flags = {} }) {
    this.scene = scene; this.level = level; this.list = [];
    for (const p of people) {
      const def = defs[p.id];
      if (!def) continue;
      const now = flags[p.id] || def.start;
      if (now !== p.when) continue;
      const frames = creatureFrames({ id: 'person_' + p.id, look: def.look });
      const tex = new THREE.CanvasTexture(frames.idle); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, fog: true, transparent: true }));
      spr.center.set(0.5, 0);
      const at = p.at || [0.5, 0.5], s = level.size, x = (p.cell[0] + at[0]) * s, z = (p.cell[1] + at[1]) * s;
      const y = p.y ?? level.floorAt(x, z), h = def.height || 1.75, img = frames.idle;
      spr.scale.set(h * img.width / img.height, h, 1);
      spr.position.set(x, y, z);
      scene.add(spr);
      this.list.push({ ...p, def, spr, x, y, z, fade: 0 });
    }
  }
  // The person in front of you and near enough to speak to (reach: metres; some can be spoken to through bars).
  near(P) {
    let best = null, bd = Infinity;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (const p of this.list) {
      if (p.fade) continue;
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > (p.reach ?? 2.6) || Math.abs(p.y - P.pos.y) > 2.2) continue;
      if (d > 0.8 && (dx * fx + dz * fz) / d < 0.5) continue;           // you must be facing them
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  leave(p) { p.fade = 1; }                                             // they go: fade away
  update(dt, brightnessAt) {
    for (const p of this.list) {
      const b = brightnessAt(p.x, p.y + 1, p.z);
      p.spr.material.color.setScalar(Math.min(1.1, b * 1.2 + 0.15));
      if (p.fade) {
        p.fade = Math.max(0.001, p.fade - dt * 0.6);
        p.spr.material.opacity = p.fade;
        if (p.fade <= 0.001) { this.scene.remove(p.spr); this.list = this.list.filter(q => q !== p); }
      }
    }
  }
}
