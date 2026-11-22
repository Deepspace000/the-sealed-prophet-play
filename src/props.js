// Scenery that stands in a level: big clay urns (real 3D shapes, lit by the lamp and the torches),
// and what is left of the dead: a heap of human bones, or the carcass of a jackal.
// A level lists them under "props":  { "id": "urn", "cell": [column, row], "at": [east, south], "kind": ..., "size": ..., "turn": ... }
//   kind: "whole", "broken" (the top is smashed off, pieces lie round it) or "tipped" (lying on its side)
//   size: its height in metres (1.1 if left out). turn: which way round it stands, in turns of a circle (0..1).
//   inside: the id of a thing hidden in it, which falls out when it is smashed.
// A whole or tipped urn can be smashed: one crushing blow does it, cutting and stabbing blows take many.
// { "id": "remains", "cell": ..., "at": ..., "kind": "bones" or "jackal" } lies on the floor. It cannot be picked up;
// put the dead one's belongings beside it as items, close together, so the place tells what happened.
import * as THREE from 'three';
import { art } from './art.js';
import { play } from './sound.js';
import { modelMesh } from './models.js';

// The outline of an urn one metre tall: [how wide, how high] from the foot to the lip.
const OUTLINE = [[0.13, 0], [0.19, 0.03], [0.3, 0.2], [0.36, 0.42], [0.37, 0.58], [0.32, 0.75], [0.21, 0.87], [0.155, 0.92], [0.165, 0.97], [0.21, 1]];
const SEG = 12;
const widthAt = h => {
  for (let i = 1; i < OUTLINE.length; i++) {
    if (h <= OUTLINE[i][1]) {
      const t = (h - OUTLINE[i - 1][1]) / (OUTLINE[i][1] - OUTLINE[i - 1][1] || 1);
      return OUTLINE[i - 1][0] + (OUTLINE[i][0] - OUTLINE[i - 1][0]) * t;
    }
  }
  return OUTLINE[OUTLINE.length - 1][0];
};

// cut: null for a whole urn, or how high up (0..1) it is broken off. The break is ragged.
function urnShape(seed, cut) {
  const rnd = n => { const h = Math.sin(seed * 91.7 + n * 47.3) * 43758.5453; return h - Math.floor(h); };
  const n = OUTLINE.length, pos = [], uv = [], idx = [];
  for (let j = 0; j <= SEG; j++) {
    const a = j / SEG * Math.PI * 2;
    const top = cut == null ? 1 : Math.max(0.1, cut + (rnd(j % SEG) - 0.5) * 0.45);
    for (let i = 0; i < n; i++) {
      const h = Math.min(OUTLINE[i][1], top), r = widthAt(h);
      pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
      uv.push(j / SEG * 3, h);
    }
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = (j + 1) * n + i;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const c = pos.length / 3;                      // the bottom
  pos.push(0, 0.02, 0); uv.push(0.5, 0);
  for (let j = 0; j < SEG; j++) idx.push(c, j * n, (j + 1) * n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Fired clay: uneven, stained darker toward the foot, with painted bands round the shoulder.
function clay() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 1 - y / S, n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, r = n - Math.floor(n);
    let k = 0.72 + 0.22 * v + (r - 0.5) * 0.22 + 0.06 * Math.sin(x * 0.4 + y * 0.9);
    let col = [176, 104, 62];
    if ((v > 0.7 && v < 0.725) || (v > 0.8 && v < 0.815)) col = [58, 36, 26];                       // lines round the shoulder
    else if (v > 0.725 && v < 0.8 && ((x + Math.abs(((y * 2) % 10) - 5)) % 8) < 2) col = [58, 36, 26];      // a zigzag between them
    else if (v > 0.44 && v < 0.455) col = [214, 196, 150];
    if (r > 0.93) k *= 0.6;                                                                       // pits and chips
    g.fillStyle = `rgb(${col.map(q => Math.max(0, Math.min(255, q * k)) | 0).join(',')})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const REMAINS = { bones: ['remains_dead', 0.85], jackal: ['jackal_dead', 1.9] };      // picture, and how tall its whole frame stands

// Builds (or builds again, after it is smashed) the meshes of one urn.
function shape(u) {
  const { grp, size, seed, mat } = u;
  const rnd = k => { const h = Math.sin(seed * 31.3 + k * 17.7) * 43758.5453; return h - Math.floor(h); };
  for (const c of [...grp.children]) { grp.remove(c); if (c.geometry) c.geometry.dispose(); }
  grp.rotation.y = (u.turn ?? rnd(1)) * Math.PI * 2;
  const broken = u.kind === 'broken';
  const urn = new THREE.Mesh(urnShape(seed, broken ? (u.low ? 0.16 + rnd(2) * 0.14 : 0.35 + rnd(2) * 0.3) : null), mat);
  urn.scale.setScalar(size);
  if (u.kind === 'tipped') { urn.rotation.z = Math.PI / 2 - 0.06; urn.position.set(size * 0.45, size * 0.36, 0); }
  grp.add(urn);
  if (!broken) {                                 // the dark inside of the mouth
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.15, SEG), u.dark);
    mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.955;
    urn.add(mouth);
  } else {                                       // pieces on the floor round it
    for (let i = 0; i < (u.low ? 9 : 5); i++) {
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.07 + rnd(10 + i) * 0.1, 3 + (i % 3), rnd(20 + i) * 6), mat);
      const a = rnd(30 + i) * Math.PI * 2, d = size * (0.36 + rnd(40 + i) * (u.low ? 0.7 : 0.4));
      sh.position.set(Math.cos(a) * d, 0.02 + rnd(50 + i) * 0.03, Math.sin(a) * d);
      sh.rotation.set(-Math.PI / 2 + (rnd(60 + i) - 0.5) * 0.5, 0, rnd(70 + i) * 6);
      grp.add(sh);
    }
  }
  u.r = size * (u.kind === 'tipped' ? 0.5 : broken && u.low ? 0.26 : 0.36);
}

// Hitting an urn. Clay breaks at once under a crushing blow; a cutting or stabbing blow only chips it, so it takes many.
const URN_HP = 100, URN_TAKES = { crush: 14, cut: 2.2, stab: 1.3 };
// me: { x, y, z }, yaw: the way you face, reach in metres, half: half the width of the swing, dmg and type of the blow.
// Returns null if no urn was in the way, or { urn, broke }.
export function strikeUrn(urns, me, yaw, reach, half, dmg, type) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = null, bestD = Infinity;
  for (const u of urns) {
    if (u.kind === 'broken' || Math.abs(u.y - me.y) > 1.4) continue;
    const dx = u.x - me.x, dz = u.z - me.z, d = Math.hypot(dx, dz);
    if (d - u.r > reach || d >= bestD) continue;
    const off = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
    if (off > half + Math.atan2(u.r, d)) continue;
    best = u; bestD = d;
  }
  if (!best) return null;
  best.hp -= dmg * (URN_TAKES[type] || 1);
  if (best.hp > 0) { play('chip'); return { urn: best, broke: false }; }
  best.kind = 'broken'; best.smashed = true; best.low = true;
  shape(best);
  play('smash');
  return { urn: best, broke: true };
}

// Puts the level's props into the scene. Returns { solid: what the player must walk round, as [{ x, y, z, r }],
// flat: the flat pictures, which the game must shade itself, as [{ spr, x, y, z }],
// fires: where a fire burns on a brazier, as [{ x, y, z }] }.
// smashed: the numbers of the urns the player has already broken (from a save).
export function buildProps(scene, level, list, smashed) {
  if (!list.length) return { solid: [], flat: [], fires: [], seal: null };
  const mat = new THREE.MeshLambertMaterial({ map: clay(), side: THREE.DoubleSide, flatShading: true });
  const dark = new THREE.MeshBasicMaterial({ color: 0x050302 });
  const solid = [], flat = [], fires = [];
  let seal = null;
  list.forEach((p, n) => {
    const at = p.at || [0.5, 0.5], x = (p.cell[0] + at[0]) * level.size, z = (p.cell[1] + at[1]) * level.size;
    if (level.cellAt(x, z).solid) throw new Error(`Prop ${n} (${p.id}) is placed inside solid rock`);
    if (p.id === 'remains') {
      const [pic, tall] = REMAINS[p.kind] || REMAINS.bones, im = art.creatures[pic];
      if (!im) return;
      const tex = new THREE.CanvasTexture(im);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: true, alphaTest: 0.5 }));
      spr.center.set(0.5, 0);
      spr.scale.set(tall * im.width / im.height, tall, 1);
      const y = level.floorAt(x, z);
      spr.position.set(x, y - 0.03, z);
      scene.add(spr);
      flat.push({ spr, x, y: y + 0.3, z });
      return;
    }
    if (p.id === 'seal') {                         // a ring of empty sockets laid on the floor, one for each relic (see DESIGN.md)
      const y = level.floorAt(x, z) + (p.lift || 0), n8 = p.sockets || 8, R = p.radius || 0.78;
      const rim = new THREE.MeshBasicMaterial({ color: 0xc9a444 }), hole = new THREE.MeshBasicMaterial({ color: 0x050302 });
      const grp = new THREE.Group(), gods = p.gods || [], at8 = {};
      for (let i = 0; i < n8; i++) {
        const a = (i - 0.5) / n8 * Math.PI * 2, s = new THREE.Group();      // clockwise from the north-west: each socket points at its god's door
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), rim);
        const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.056, 20), hole);
        s.add(ring, pit);
        s.position.set(Math.sin(a) * R, 0.025, -Math.cos(a) * R);
        grp.add(s);
        if (gods[i]) at8[gods[i]] = s;
      }
      grp.position.set(x, y, z);
      scene.add(grp);
      // fill(god, colour): a gem sits in that god's socket
      seal = { x, y, z, fill: (god, colour) => {
        const s = at8[god];
        if (!s || s.userData.full) return;
        s.userData.full = true;
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshBasicMaterial({ color: new THREE.Color(colour || '#ffffff') }));
        gem.scale.y = 1.35; gem.position.y = 0.1;
        s.add(gem);
      } };
      return;
    }
    if (p.id === 'model') {                        // a statue, a pillar or other piece of scenery (see models.js)
      const mesh = modelMesh(p.name, p.size);
      if (!mesh) return;
      const y = level.floorAt(x, z) + (p.lift || 0);
      mesh.position.set(x, y, z);
      mesh.rotation.y = (p.turn || 0) * Math.PI * 2;
      const wide = p.wide || 1, tall = mesh.scale.y;
      mesh.scale.set(tall * wide, tall, tall * wide);
      scene.add(mesh);
      if (p.fire) fires.push({ x, y: y + mesh.userData.height + 0.12, z });
      const r = p.solid ?? mesh.userData.radius * 0.8 * wide;
      if (r > 0) solid.push({ n, x, y, z, r, kind: 'broken', tall: true });
      return;
    }
    if (p.id !== 'urn') return;
    const y = level.floorAt(x, z), size = p.size || 1.1, seed = n + 1;
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    const u = { n, x, y, z, size, seed, grp, kind: p.kind || 'whole', inside: p.inside || null, hp: URN_HP, smashed: false,
      turn: p.turn, mat, dark, r: 0 };
    if (smashed && smashed.includes(n) && u.kind !== 'broken') { u.kind = 'broken'; u.smashed = true; u.low = true; }
    shape(u);
    scene.add(grp);
    solid.push(u);
  });
  return { solid, flat, fires, seal };
}
