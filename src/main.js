import * as THREE from 'three';
import { Level } from './level.js';
import { buildSky } from './sky.js';
import { Terrain } from './terrain.js';
import { Beams, Ladders, Windows, Shafts } from './beams.js';
import { towerMaterials, glassTexture, towerTick } from './towerart.js';
import { People } from './people.js';
import { Shop } from './shop.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { standinMaterials, standinTorch, egyptianTorch, standinDoor } from './standin.js';
import { Item, Inventory, WorldItems } from './items.js';
import { UI } from './ui.js';
import { runIntro } from './intro.js';
import { Creatures } from './creatures.js';
import { Fight, MOVES } from './fight.js';
import { Survival } from './survival.js';
import { Menu } from './menu.js';
import { GameMap } from './map.js';
import { Target } from './target.js';
import { Scenes } from './scenes.js';
import { loadArt } from './art.js';
import { play, wind } from './sound.js';
import { buildProps, strikeUrn } from './props.js';
import { loadModels } from './models.js';
import { Gates, Fireballs, Lifts, buildSpikes, onSpikes } from './hazards.js';
import { getRun, setRun, clearRun, writeSlot, readSlot, newest, toFile, fromFile } from './save.js';

const LOAD = window.loading || { set() {}, name() {}, finish: async () => {} };      // the loading page (see index.html)
const LEVELS = ['test', 'shaft', 'hub'];
const REALMS = ['ptah', 'nut', 'thoth', 'sekhmet', 'anubis', 'osiris', 'sobek', 'ra'];      // the levels behind the hall's eight doors
// The game so far (see save.js). Without ?intro=0 in the address a new game begins at the title.
const params = new URLSearchParams(location.search);
const fresh = params.get('intro') !== '0';
if (fresh) clearRun();
let run = getRun();
const wanted = params.get('level');
if (run && wanted && wanted !== run.level) run = { ...run, from: run.level, level: wanted, pos: null };   // a jump made for testing
const LEVEL = run ? run.level : (wanted || 'test');
const go = () => { location.search = '?intro=0' + (params.get('nosave') === '1' ? '&nosave=1' : '') + (params.get('sound') === '1' ? '&sound=1' : ''); };
const TORCH_LIGHTS = 5;            // how many wall torches cast light at once (the nearest ones)
const DARK = { color: 0x000000, density: 0.045 };
const WET = { color: 0x06323a, density: 0.22 };

// The picture is drawn small and scaled up with hard pixels. RES is its height in pixels.
const RES_STEPS = [160, 200, 240, 300, 360, 480];
let RES = +new URLSearchParams(location.search).get('res') || RES_STEPS[RES_STEPS.length - 1];      // the game starts at the finest picture

const canvas = document.getElementById('view');
// antialias: the picture is still small and scaled up with hard pixels, but thin far things (the rays of the White Tower, seen
// across the desert) are smoothed into it instead of sparkling as you move.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: params.get('aa') !== '0', powerPreference: 'high-performance' });      // (?aa=0: without, to compare)
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(DARK.color);
scene.fog = new THREE.FogExp2(DARK.color, DARK.density);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 150);
camera.rotation.order = 'YXZ';
scene.add(camera);

function resize() {
  renderer.setSize(Math.round(RES * innerWidth / innerHeight), RES, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

LOAD.set(0.03);
const data = await (await fetch(`levels/${LEVEL}.json`)).json();
// A level that has been rebuilt since the save was made ("rev" in its file) starts again from its door: the old places no longer fit.
const REV = data.rev || 0;
let rebuilt = false;
if (run && run.levels && run.levels[LEVEL] && (run.levels[LEVEL].rev || 0) !== REV) {
  const levels = { ...run.levels }; delete levels[LEVEL];
  run = { ...run, levels, pos: null, from: run.from || 'hub' };
  rebuilt = true;
}
// The hall's false doors are for the eight realms. A spot with a "realm" becomes a real door as soon as levels/<realm>.json exists,
// so each realm can be added by dropping its level file in, with no change to the hall.
// The Sealed Prophet's ghost opens them one at a time (see data/prophet.json); which are open is kept in the save.
const unlocked = new Set(run && run.prophet && run.prophet.unlocked || []);
let heard = run && run.prophet ? run.prophet.heard : 0;           // how many of his visits have been told
// Where each person's story has got to (flags.trader: 'caged' or 'hub'), and what a shop has sold. Kept in the save.
const flags = { ...(run && run.flags) };
// Names of places. The first time you come to a place you do not know what it is called: it is an "Unknown area". Come back to
// it, and it has its name. The realms the ghost opens are named by him, so you know those from the start. (visits: how many
// times you have arrived in each place, kept in the save. An older save without them: the places in it keep their names.)
const visits = run && run.visits ? { ...run.visits } : Object.fromEntries(Object.keys((run && run.levels) || {}).map(k => [k, 2]));
if (!run || !run.pos) visits[LEVEL] = (visits[LEVEL] || 0) + 1;      // a new game, or you came in through a door: one more visit
const known = id => unlocked.has(id) || (visits[id] || 0) >= 2;
const REAL_NAME = data.name || LEVEL;
data.name = known(LEVEL) ? REAL_NAME : 'Unknown area';
for (const s of data.spots || []) if (s.to && s.textUnknown && !known(s.to)) s.text = s.textUnknown;     // a door that would name a place you do not know yet
LOAD.name(known(LEVEL) ? REAL_NAME.toUpperCase() : 'LOADING GAME');      // (a place you do not know yet is not named on the loading page)
const setDoor = s => {
  const name = s.realm[0].toUpperCase() + s.realm.slice(1);
  if (!unlocked.has(s.realm)) return;
  if (s.exists) { s.to = s.realm; s.text = `The door of ${name}.`; }
  else s.text = `The door of ${name}. It is unlocked, but nothing lies beyond it yet.`;
};
await Promise.all((data.spots || []).filter(s => s.realm && !s.to).map(async s => {
  try { s.exists = (await fetch(`levels/${s.realm}.json`, { method: 'HEAD' })).ok; } catch (e) { s.exists = false; }
  setDoor(s);
}));
LOAD.set(0.1);
await loadArt(p => LOAD.set(0.1 + 0.55 * p));
LOAD.set(0.66);
const level = new Level(data);
if (data.fog != null) scene.fog.density = DARK.density = data.fog;      // how fast things fade into the dark
const MATS = standinMaterials();
if (data.sky) Object.assign(MATS, towerMaterials(data.sky));        // the White Tower's gilded walls (src/towerart.js)
// Under the ground in a level with a sky (cells with "dark": true use these): the same old stone, but the sun and the sky's
// light do not reach it. Only your lamp and the torches do. (underWall, underFloor, underCeil)
if (data.sky) {
  const C = THREE.ShaderChunk.lights_fragment_begin
    .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= 0.0;')
    .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * 0.02;')
    .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * 0.1;');
  for (const [name, from] of [['underWall', 'wall'], ['underFloor', 'floor'], ['underCeil', 'ceil']]) {
    const m = MATS[from].clone();
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', C); };
    m.customProgramCacheKey = () => 'under';
    MATS[name] = m;
  }
}
scene.add(level.build(MATS));
buildSpikes(scene, level);                 // beds of spikes (cells with "spikes": true)
// An open sky (a level with "sky", see src/sky.js): a dome, sunlight, drifting clouds, and a haze the colour of the horizon instead of the dark.
let skyFx = null;
if (data.sky) {
  DARK.color = new THREE.Color(data.sky.hazeColor || data.sky.horizon).getHex(); DARK.density = data.sky.haze ?? 0.004;
  scene.background.setHex(DARK.color); scene.fog.color.setHex(DARK.color); scene.fog.density = DARK.density;
  camera.far = data.sky.far || 900; camera.updateProjectionMatrix();
  skyFx = buildSky(scene, data.sky, MATS, { x: level.w * level.size / 2, z: level.h * level.size / 2 });
}
const TORCH = data.torchColor ? parseInt(data.torchColor.slice(1), 16) : null;      // a level may light its torches another colour ("torchColor": "#ff2a1a")

// Light: a faint glow everywhere, the lamp you carry, and the nearest wall torches.
scene.add(new THREE.AmbientLight(0x8090b0, data.ambient ?? 0.06));
const lamp = new THREE.PointLight(0xffd9a6, 14, 13, 2);
lamp.position.set(0.25, -0.2, 0);
camera.add(lamp);

const WALL_TURN = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };      // the torch faces into the room
const torches = level.torchPositions().map(pos => {
  const mesh = egyptianTorch(TORCH ?? undefined);
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.rotation.y = WALL_TURN[pos.wall] ?? 0;
  scene.add(mesh);
  return { ...pos, mesh, phase: Math.random() * 10 };
});
const torchLights = [];
for (let i = 0; i < Math.min(TORCH_LIGHTS, torches.length); i++) {
  const l = new THREE.PointLight(TORCH ?? 0xff9a3c, 0, 12, 2);
  scene.add(l);
  torchLights.push(l);
}

for (const l of data.lights || []) {          // fixed lights: { cell, y, color, power, range }, e.g. the glow of a gem
  const pl = new THREE.PointLight(parseInt((l.color || '#ffcc88').slice(1), 16), l.power ?? 20, l.range ?? 16, 2);
  pl.position.set((l.cell[0] + 0.5) * level.size, l.y, (l.cell[1] + 0.5) * level.size);
  scene.add(pl);
}
LOAD.set(0.75);
await loadModels((data.props || []).filter(p => p.id === 'model').map(p => p.name));
const props = buildProps(scene, level, data.props || [], run && run.levels && run.levels[LEVEL] && run.levels[LEVEL].urns);      // big clay urns: you walk round them
for (const f of props.fires) {      // a fire on a brazier burns and gives light like a wall torch
  const mesh = standinTorch(TORCH ?? undefined);
  mesh.position.set(f.x, f.y - 0.3, f.z);
  mesh.scale.setScalar(2.4);
  scene.add(mesh);
  torches.push({ ...f, mesh, phase: Math.random() * 10 });
}
const player = new Player(level);
const input = new Input(canvas);

// Things: what you carry, and what lies about the level.
LOAD.set(0.86);
const defs = (await (await fetch('data/items.json')).json()).items;
for (const id in defs) defs[id].id = id;
const make = id => { if (!defs[id]) throw new Error(`No item called "${id}"`); return new Item(defs[id]); };
const inv = new Inventory();
const peopleDefs = (await (await fetch('data/people.json')).json()).people;
const world = new WorldItems(scene, level);
// Things are written into a save as plain data and made again from it.
const pack = it => it && { id: it.def.id, n: it.n, lit: it.lit || undefined, lvl: it.lvl > 1 ? it.lvl : undefined, inside: it.inside && it.inside.map(pack) };
const unpack = o => {
  if (!o || !defs[o.id]) return null;
  const it = make(o.id);
  if (o.n != null) it.n = o.n;
  it.lit = !!o.lit;
  if (o.lvl && it.def.weapon) it.lvl = o.lvl;
  if (it.inside && o.inside) o.inside.forEach((c, i) => { if (i < it.inside.length) it.inside[i] = unpack(c); });
  return it;
};
const saved = run && run.levels && run.levels[LEVEL];      // this level as you left it, if you have been here before
if (run) for (const a of ['hands', 'belt', 'back', 'body', 'head']) (run.inv[a] || []).forEach((o, i) => { if (i < inv[a].length) inv[a][i] = unpack(o); });
else for (const id of data.carry || []) inv.add(make(id));
// ?kit=1 (for a test link): in a game already going, you are also given whatever of this level's "carry" you do not have
if (run && params.get('kit') === '1') for (const id of data.carry || []) if (![...inv.all()].some(e => e[0].def.id === id)) inv.add(make(id));
const ui = new UI(inv, () => dropHeld(), it => useThing(it));
if (rebuilt) setTimeout(() => ui.say('This place has been rebuilt since you were last here. You start it again from its door.'), 1500);
// Doors that need keys, levers, doors that slide, and fireballs from the walls (see hazards.js).
const gates = new Gates({ scene, level, gates: data.gates, levers: data.levers, buttons: data.buttons, wallMat: MATS[data.liftTex || 'wall'], saved: saved && saved.gates, say: t => ui.say(t),
  findKey: id => [...inv.all()].map(e => e[0]).find(it => it.def.key === id) || null, takeKey: it => inv.remove(it) });
const fireballs = new Fireballs({ scene, level, shooters: data.shooters });
const lifts = new Lifts({ scene, level, lifts: data.lifts, mat: MATS[data.liftTex || 'wall'] });        // platforms that rise and sink in a void
const beams = new Beams({ scene, level, beams: data.beams, mat: MATS.whiteplain });      // rays of white stone to walk on (src/beams.js)
const ladders = new Ladders({ scene, level, ladders: data.ladders });
const windows = new Windows({ scene, windows: data.windows, texture: glassTexture, level });
new Shafts({ scene, level, shafts: data.shafts, sun: data.sky && data.sky.sun && data.sky.sun.dir });      // light down holes in a roof            // long stained glass windows
const terrain = data.terrain ? new Terrain({ scene, level, terrain: data.terrain, mat: MATS[data.terrain.mat || 'sand'] }) : null;      // dunes (src/terrain.js)
player.extraFloor = (x, z, lim) => Math.max(lifts.topAt(x, z, lim), beams.topAt(x, z, lim), terrain ? terrain.topAt(x, z, lim) : -Infinity);      // lifts, beams and dunes hold you up too (lim: none higher than this)
player.ladderAt = (x, z, y, yaw) => ladders.at(x, z, y, yaw);
// Where a thing lies: the floor, or a room's roof or a ray or a lift if it was left up there (near: the height it was left at).
world.ground = (x, z, near) => {
  const f = level.floorAt(x, z, near);
  return near == null ? f : Math.max(f, player.extraFloor(x, z, near + 0.6));
};
// The things lying in the level: as you left them, or as the level puts them the first time.
if (saved) {
  for (const o of saved.items) { const it = unpack(o); if (it) world.place(it, o.x, o.z, o.gy); }
} else for (const it of data.items || []) {
  if (it.starter && run) continue;              // starter things are only there if you arrive with nothing
  if (it.spare && [...inv.all()].some(e => e[0].def.id === it.id)) continue;      // a spare is only there if you do not have one already (the knapsack in the hall)
  const at = it.at || [0.5, 0.5];
  const thing = make(it.id);
  if (it.lvl && thing.def.weapon) thing.lvl = it.lvl;                // a weapon lying in a level may be of a higher level ("lvl")
  (it.inside || []).forEach((id, i) => { if (thing.inside && i < thing.inside.length) thing.inside[i] = make(id); });     // what is in a bag
  world.place(thing, (it.cell[0] + at[0]) * level.size, (it.cell[1] + at[1]) * level.size, it.y);      // y: on a room's roof or a ray, not the floor below
}
const USE = { keys: 'Press F to use it.', pad: 'Press X to use it.', touch: 'Tap to use it.' };
// The great seal in the hall has a socket for the relic of each realm. Carry one back and set it in. Which are set is kept in the save.
const placed = new Set(run && run.relics || []);
if (props.seal) for (const god of placed) props.seal.fill(god, defs['relic_' + god] && defs['relic_' + god].icon[0]);
const nearSeal = () => !!props.seal && Math.hypot(player.pos.x - props.seal.x, player.pos.z - props.seal.z) < 2.4 && Math.abs(player.pos.y - props.seal.y) < 1.4;
const relicsCarried = () => [...inv.all()].map(e => e[0]).filter(it => it.def.relic && !placed.has(it.def.relic));
function setRelics() {            // returns true if it set any
  if (!nearSeal()) return false;
  const mine = relicsCarried();
  if (!mine.length) return false;
  for (const it of mine) { inv.remove(it); placed.add(it.def.relic); props.seal.fill(it.def.relic, it.def.icon[0]); }
  play('smash');
  ui.say(placed.size >= 8 ? 'The eighth gem is set. Far above, something heavy grinds and begins to move.'
    : `${mine.length > 1 ? 'You set the gems' : 'You set the ' + mine[0].def.name.toLowerCase()} in the seal. ${placed.size} of 8 are in.`);
  return true;
}

let dropWords = '';                 // said once you land, after coming in through a hole in the roof
// Where you stand: as saved, or just inside the door you came through, or the level's own starting place.
if (run && run.pos) {
  Object.assign(player.pos, { x: run.pos.x, y: run.pos.y, z: run.pos.z });
  player.yaw = run.pos.yaw; player.pitch = run.pos.pitch;
  const lift = lifts.topAt(run.pos.x, run.pos.z);                 // saved standing on a lift: you are set down on it, wherever it now is
  if (lift > -Infinity) player.pos.y = Math.max(lift, level.floorAt(run.pos.x, run.pos.z));
} else if (run && run.via && (data.spots || []).some(sp => sp.landing === run.via)) {
  // You come in from above: dropped through the shaft over this spot, falling from near its top.
  const sp = data.spots.find(s => s.landing === run.via), c = level.cellCentre(sp.cell[0], sp.cell[1]);
  Object.assign(player.pos, { x: c.x, y: level.ceilAt(c.x, c.z) - 1.8, z: c.z });
  player.onGround = false; player.vy = -4;
  player.yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[sp.face] ?? player.yaw;
  dropWords = sp.landText || '';
} else if (run && run.from) {
  const door = (data.spots || []).find(sp => sp.to === run.from);
  if (door) {
    const at = door.arrive || door.cell;                 // "arrive": where you come in, if not the door's own cell (a flooded passage: past the water)
    const c = level.cellCentre(at[0], at[1]);
    Object.assign(player.pos, { x: c.x, y: level.floorAt(c.x, c.z), z: c.z });
    if (door.wall) player.yaw = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[door.wall];      // your back to the door
    else player.yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[door.face] ?? player.yaw;   // a flooded passage: the way it says
  }
}
player.eyeY = player.pos.y + 1.55;

// People you can speak to (src/people.js), and a shop for one who keeps one (src/shop.js).
const people = new People({ scene, level, people: data.people, defs: peopleDefs, flags });
const shop = new Shop({ defs, inv, make, say: t => ui.say(t), flags, weapon: () => { const w = inv.hands[fight.mainHand()]; return w && w.def.weapon ? w : null; } });
function talk() {                         // F (or a tap) on someone in front of you. Returns true if there was someone.
  const p = people.near(player);
  if (!p) return false;
  if (p.id === 'trader' && p.when === 'caged') {
    if (gates.opened.has('trader') || gates.group('trader').some(g => g.t < 0.05)) {       // his door is open: he is free
      scenes.show('trader_freed'); flags.trader = 'hub'; people.leave(p);
    } else scenes.show('trader_caged');
  } else if (p.def.stock) {
    if (!flags[p.id + '_met']) { flags[p.id + '_met'] = true; scenes.show('trader_hall'); shopNext = p; }
    else shop.open(p, input.device === 'pad');
  }
  return true;
}
let shopNext = null;                      // a shop to open once the words before it are read

// Creatures, and the fighting.
LOAD.set(0.93);
const kinds = (await (await fetch('data/creatures.json')).json()).creatures;
for (const id in kinds) kinds[id].id = id;
const creatures = new Creatures(scene, level, kinds, {
  onStrike: (c, dmg, type) => fight.takeHit(c, dmg, type),
  onDeath: () => {},
  drop: (id, x, z, y) => world.place(make(id), x, z, y),
  extraFloor: (x, z, lim) => player.extraFloor(x, z, lim),       // walkers can stand on beams and lifts too
  pushPlayer: (dx, dz) => {
    const p = player.pos;
    if (!player.fits(p.x + dx, p.z + dz, p.y, 0.25)) return false;
    p.x += dx; p.z += dz;
    return true;
  },
});
(data.creatures || []).forEach((c, n) => {
  const at = c.at || [0.5, 0.5];
  let was = saved && saved.creatures[n];
  // (one saved where it can no longer be, such as over a shut gate, starts again from its place in the level)
  if (was && !was.dead && level.cellAt(was.x, was.z).solid) was = null;
  const cr = creatures.spawn(c.id, was ? was.x : (c.cell[0] + at[0]) * level.size, was ? was.z : (c.cell[1] + at[1]) * level.size, n,
    !!(was && was.dead), c.y);         // y: a height to put it at (a flyer, or one on top of a cap); without it, the floor
  if (was) {
    // health is kept as a share of the most it can have, so a creature made tougher since the save is tougher in it too
    // (an older save has no "max": a creature in it is taken to have been unhurt)
    cr.y = was.y; cr.hp = was.dead ? 0 : was.max ? Math.min(cr.max, was.hp / was.max * cr.max) : cr.max; cr.fled = !!was.fled; cr.skinned = !!was.skinned;
    if (!was.dead && was.awake && cr.state === 'still') cr.state = 'idle';
  }
});
const fight = new Fight({ camera, player, inv, creatures, ui });
// The creature you are fighting is marked, and numbers rise from it when it is hit.
const target = new Target({ camera, creatures, player, fight });
fight.onHit = (c, res) => target.float(c, res.real >= 0.5 ? String(Math.round(res.real)) : '0', res.weak >= 1.5 ? 'big' : res.weak <= 0.6 ? 'dull' : '');
fight.onNone = reach => target.whiff(reach);
// A blow that meets no creature may break an urn. Crushing blows smash clay at once; others only chip it.
const chipped = new Set();
fight.onMiss = (me, yaw, reach, half, dmg, type, kind) => {
  const hit = strikeUrn(props.solid, me, yaw, reach, half, dmg, type);
  if (!hit) return;
  fight.noise = 1;
  if (hit.broke) {
    ui.say('The urn breaks.');
    if (hit.urn.inside) world.place(make(hit.urn.inside), hit.urn.x + 0.25, hit.urn.z + 0.2);
  } else if (!chipped.has(type)) { chipped.add(type); ui.say(`${kind} blows only chip the clay. Something heavy would break it.`); }
};
const life = new Survival({ inv, fight, ui, onSleep: () => sleep(), onMap: () => openMap() });
// Text scenes: your thoughts the first time you meet an enemy, a body, water, a hidden room. ?scenes=0 turns them off for tests.
const scenes = new Scenes({
  data: (await (await fetch('data/scenes.json')).json()).scenes, seen: run && run.seen, off: params.get('scenes') === '0',
  level, player, creatures, brightnessAt: (x, y, z) => brightnessAt(x, y, z), areas: data.scenes || [], outdoors: !!data.sky,
  remains: (data.props || []).filter(p => p.id === 'remains' && p.kind === 'bones')
    .map(p => ({ x: (p.cell[0] + (p.at ? p.at[0] : 0.5)) * level.size, z: (p.cell[1] + (p.at ? p.at[1] : 0.5)) * level.size })),
});
let played = 0;                 // seconds of play in this game
if (run) {
  fight.hp = run.hp ?? fight.hpMax;
  life.food = run.food ?? life.food; life.rest = run.rest ?? life.rest;
  played = run.played || 0;
}
const fade = (to, sec) => {
  const b = document.getElementById('black');
  b.style.display = 'block'; b.className = ''; b.style.transition = `opacity ${sec}s`;
  requestAnimationFrame(() => { b.style.opacity = to; });
};
// Dying takes you back to your newest save.
fight.onDeath = (c, cause) => {
  leaving = true;
  document.getElementById('dead').textContent = { drowned: 'YOU DROWNED', impaled: 'YOU WERE IMPALED', burned: 'YOU WERE BURNED', fell: 'YOU FELL' }[cause] || 'YOU ARE DEAD';
  document.getElementById('black').style.opacity = 0;
  fade(1, 2);
  document.getElementById('dead').style.display = 'flex';
  setTimeout(() => { const v = newest(); if (v) setRun(v.run); else clearRun(); go(); }, 4200);
};

// The game so far, as plain data: what goes into a save.
function capture() {
  if (inv.held && !inv.add(inv.held)) dropHeld();
  inv.held = null;
  const levels = { ...(run && run.levels) };
  levels[LEVEL] = {
    rev: REV, items: world.list.map(e => ({ ...pack(e.item), x: e.x, z: e.z, gy: e.ground })),
    urns: props.solid.filter(u => u.smashed).map(u => u.n), gates: gates.pack(),
    creatures: creatures.list.map(c => ({ x: c.x, y: c.y, z: c.z, hp: c.hp, max: c.max, dead: c.state === 'dead', skinned: c.skinned || undefined, fled: c.fled, awake: c.state !== 'still' })),
  };
  return {
    v: 1, level: LEVEL, from: null,
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch },
    inv: { hands: inv.hands.map(pack), belt: inv.belt.map(pack), back: inv.back.map(pack), body: inv.body.map(pack), head: inv.head.map(pack) },
    relics: [...placed], prophet: { heard, unlocked: [...unlocked] }, flags, hp: fight.hp, food: life.food, rest: life.rest, played, levels, maps: map.pack(), seen: scenes.pack(), visits,
  };
}
const loadRun = r => { leaving = true; setRun(r); fade(1, 0.5); setTimeout(go, 550); };
const menu = new Menu({
  sleep: () => sleep(),
  save: slot => !fight.dead && writeSlot(slot, capture(), data.name || LEVEL),
  load: slot => { const v = readSlot(slot); if (v) loadRun(v.run); },
  toFile: () => toFile(capture(), data.name || LEVEL),
  fromFile: async file => { const r = await fromFile(file); if (r) loadRun(r); else menu.say('That file is not a save from this game.'); },
  // Leaving. The game keeps its own save first, so CONTINUE on the title brings you back to this moment.
  toTitle: () => {
    if (!fight.dead) writeSlot('auto', capture(), data.name || LEVEL);
    leaving = true; clearRun(); fade(1, 0.5);
    setTimeout(() => { location.search = params.get('nosave') === '1' ? '?nosave=1' : ''; }, 550);
  },
  toDesktop: () => {
    if (!fight.dead) { const r = capture(); setRun(r); writeSlot('auto', r, data.name || LEVEL); }
    window.close();                 // works when the game runs as its own window; a browser tab will not let itself be shut
    setTimeout(() => menu.say('The game is saved. You can close this window now.'), 300);
  },
});
document.getElementById('settingsBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (fight.dead || asleep > 0 || leaving || map.open) return;
  menu.pad = false; menu.toggle();
});

// The map in your notebook: a page for each level.
const map = new GameMap({
  id: LEVEL, level, data, pages: run && run.maps, order: [...LEVELS, ...REALMS],
  realName: REAL_NAME, nameOf: (id, real) => known(id) ? real : 'Unknown area',          // a page is headed with the place's name only once you know it
  load: async id => { const d = await (await fetch(`levels/${id}.json`)).json(); return { level: new Level(d), data: d }; },
});
let bookAt = -1, book = false;
const hasBook = () => {              // the notebook is the map: without it nothing is drawn and nothing can be read
  if (bookAt !== inv.version) { bookAt = inv.version; book = [...inv.all()].some(e => e[0].def.map) || !!(inv.held && inv.held.def.map); }
  return book;
};
function openMap() {
  if (fight.dead || asleep > 0 || leaving || menu.open) return;
  if (!hasBook()) return ui.say('You need your notebook to see the map.');
  ui.closeAll();
  map.show({ x: player.pos.x / level.size, z: player.pos.z / level.size, yaw: player.yaw }, input.device);
}

// Sleeping. You need a bedroll and a quiet place.
let asleep = 0;
function sleep() {
  if (fight.dead || asleep > 0 || leaving) return;
  const p = player.pos, water = level.waterAt(p.x, p.z);
  if (![...inv.all()].some(e => e[0].def.sleep)) return ui.say('You need a bedroll to sleep.');
  if (!player.onGround || (water != null && p.y < water)) return ui.say('You cannot sleep here.');
  if (creatures.hunting) return ui.say('You cannot sleep. Something is after you.');
  const awake = c => c.state !== 'dead' && c.state !== 'still';
  if (creatures.list.some(c => awake(c) && Math.hypot(c.x - p.x, c.z - p.z) < 9 && Math.abs(c.y - p.y) < 4)) {
    return ui.say('You cannot sleep. Something is moving close by.');
  }
  asleep = 3.4;
  ui.closeAll();
  document.getElementById('black').style.opacity = 0;
  fade(1, 0.9);
  setTimeout(() => {
    // anything awake and not far off may find you
    const near = creatures.list.filter(c => awake(c) && Math.hypot(c.x - p.x, c.z - p.z) < 30);
    const waker = near.length && Math.random() < 0.35 ? near[Math.floor(Math.random() * near.length)] : null;
    for (const e of inv.all()) e[0].lit = false;
    inv.version++;
    life.slept(!!waker);
    if (waker) { waker.last = { x: p.x, z: p.z }; creatures.rouse(waker, 5); }
    ui.say(waker ? 'Something wakes you.' : 'You sleep. You feel rested.');
    fade(0, 1.2);
    setTimeout(() => { if (!leaving) document.getElementById('black').style.display = 'none'; }, 1300);
  }, 2000);
}
function useThing(it) {
  if (fight.dead || asleep > 0) return;
  const water = level.waterAt(player.pos.x, player.pos.z);
  life.use(it, water != null && player.pos.y < water);
}

// Spots: places that say something when you stand there, some with a door that leads to another level.
const WALL = { N: [0, -1, 0], S: [0, 1, Math.PI], E: [1, 0, -Math.PI / 2], W: [-1, 0, Math.PI / 2] };
const spots = (data.spots || []).map(s => {
  if (s.wall) {
    const [ox, oz, turn] = WALL[s.wall], door = standinDoor(!!s.to);
    s.mesh = door;
    door.position.set((s.cell[0] + 0.5 + ox * 0.49) * level.size, level.cell(s.cell[0], s.cell[1]).floor + 1.22,
      (s.cell[1] + 0.5 + oz * 0.49) * level.size);
    door.rotation.y = turn;
    scene.add(door);
  }
  return s;
});
// A place's words are shown once, when you first walk into it, and stay a few seconds. (Doors keep their words: they carry the "go on" prompt.)
const seenSpots = new Set();
let spotWords = '', spotWordsT = 0, lastSpot = null;
const spotHere = () => {
  const cx = Math.floor(player.pos.x / level.size), cz = Math.floor(player.pos.z / level.size);
  return spots.find(s => s.cell[0] === cx && s.cell[1] === cz);
};
// The Sealed Prophet. His ghost hangs over his sarcophagus (the level's "prophet" place) once there is something to tell. Go near and a
// short cutscene plays (the view turns to him, bars close in, he fades up out of the dark), then he speaks: his story, and the door to
// go to next, which he opens. He has something new to say after each gem you set in the seal.
const prophetStages = data.prophet ? (await (await fetch('data/prophet.json')).json()).stages : null;
// A save from before he spoke of the trader: he tells you now, once, when you come into the hall.
if (prophetStages && !flags.trader_told && flags.trader !== 'hub') {
  const ni = prophetStages.findIndex(st => st.realm === 'nut');
  if (ni >= 0 && heard > ni) { flags.trader_told = true; setTimeout(() => { if (!scenes.open) scenes.show('trader_told'); else flags.trader_told = false; }, 2500); }
}
let cut = null, ghost = null, ghostA = 0, pw = null;
if (prophetStages) {
  const at = data.prophet.at || [0.5, 0.5], px = (data.prophet.cell[0] + at[0]) * level.size, pz = (data.prophet.cell[1] + at[1]) * level.size;
  pw = { x: px, z: pz, y: level.floorAt(px, pz) };
  prophetStages.forEach((st, i) => { scenes.data['prophet_' + i] = { title: st.title, lines: st.lines }; });
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192;
  const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 192);
  grd.addColorStop(0, 'rgba(210,235,255,.95)'); grd.addColorStop(0.55, 'rgba(150,190,230,.6)'); grd.addColorStop(1, 'rgba(120,160,210,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(64, 6); g.bezierCurveTo(100, 6, 108, 50, 104, 84); g.bezierCurveTo(112, 130, 124, 170, 128, 192);
  g.lineTo(0, 192); g.bezierCurveTo(4, 170, 16, 130, 24, 84); g.bezierCurveTo(20, 50, 28, 6, 64, 6); g.fill();
  g.fillStyle = 'rgba(5,10,25,.9)'; g.beginPath(); g.ellipse(64, 50, 22, 28, 0, 0, 7); g.fill();        // the hood's hollow
  g.fillStyle = 'rgba(190,255,250,1)'; g.fillRect(50, 46, 7, 5); g.fillRect(71, 46, 7, 5);                     // eyes
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  ghost.scale.set(1.5, 2.25, 1); ghost.visible = false;
  // His picture (art/prophet_ghost.png, made in Google Gemini, see tools/make_ghost.py). The drawn hood above stands in until it loads.
  new THREE.TextureLoader().load('art/prophet_ghost.png', t => {
    t.colorSpace = THREE.SRGBColorSpace;
    ghost.material.map = t; ghost.material.needsUpdate = true;
    const h = 2.6; ghost.scale.set(h * t.image.width / t.image.height, h, 1);
  });
  scene.add(ghost);
}
const turnTo = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function unlockRealm(realm) {
  unlocked.add(realm);
  const s = spots.find(sp => sp.realm === realm);
  if (!s) return;
  const was = !!s.to;
  setDoor(s);
  if (s.mesh && s.to && !was) {                       // the closed door picture is swapped for an open one
    const open = standinDoor(true);
    open.position.copy(s.mesh.position); open.rotation.copy(s.mesh.rotation);
    scene.remove(s.mesh); scene.add(open); s.mesh = open;
  }
}
function prophetTick(dt) {
  if (!pw) return;
  const pend = heard < prophetStages.length && placed.size >= heard;
  const d = Math.hypot(player.pos.x - pw.x, player.pos.z - pw.z);
  const want = cut ? Math.min(0.9, cut.t / 1.2) : pend && d < 12 ? 0.2 + 0.08 * Math.sin(time * 2.1) : 0;       // a faint glimmer calls you
  ghostA += (want - ghostA) * Math.min(1, dt * 3);
  ghost.visible = ghostA > 0.01;
  ghost.material.opacity = ghostA * (0.88 + 0.12 * Math.sin(time * 9));
  ghost.position.set(pw.x, pw.y + 1.9 + Math.sin(time * 1.3) * 0.08, pw.z);
  if (cut) {
    cut.t += dt;
    const dx = pw.x - player.pos.x, dz = pw.z - player.pos.z, h = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, dt * 3.5);
    player.yaw += turnTo(player.yaw, Math.atan2(-dx, -dz)) * k;
    player.pitch += (Math.atan2(ghost.position.y - player.eyeY, h) - player.pitch) * k;
    if (cut.t >= cut.dur) {
      const i = cut.id, st = prophetStages[i];
      cut = null; heard++;
      document.getElementById('cutBars').classList.remove('on');
      if (st.realm) unlockRealm(st.realm);
      if (st.realm === 'nut') flags.trader_told = true;          // his words about the trader are in this visit
      scenes.show('prophet_' + i);
    }
  } else if (pend && d < 3 && Math.abs(turnTo(player.yaw, Math.atan2(player.pos.x - pw.x, player.pos.z - pw.z))) < 0.45 && !scenes.open && !fight.dead && !creatures.hunting && asleep <= 0 && !leaving && !map.open && !menu.open) {
    ui.closeAll();
    cut = { t: 0, id: heard, dur: heard === 0 ? 4.6 : 2.6 };         // the first meeting is the longer one
    document.getElementById('cutBars').classList.add('on');
    play('groan');
  }
}
document.getElementById('cutSkip').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (cut) cut.t = cut.dur; });
let leaving = false;
// The mouse turns your head while the pointer is held; these are the times it is given back (see input.js).
input.uiOpen = () => ui.open || !!inv.open || menu.open || map.open || !!scenes.open || shop.isOpen || fight.dead || leaving;
// The cursor/camera switch above PACK. It shows which one the mouse is doing; pressed with the cursor, it closes the pack and
// takes the pointer back for the camera. (With the camera on the cursor is hidden, so Esc is the way back to it.)
ui.camera = () => input.locked();
// In cursor mode a press on a corpse that can be skinned works at it, instead of taking the pointer for the camera.
input.holdHere = (x, y) => !fight.dead && !cut && !!creatures.skinnable(camera.position, dirAt(x, y));
ui.onMode = () => {
  if (input.locked()) { input.selfExit = false; document.exitPointerLock(); return; }
  ui.closeAll();
  if (menu.open || map.open || scenes.open || fight.dead || leaving) return;
  input.engaged = true; input.relock();
};
const SKIN_TIME = 1.8;            // seconds to hold a button to take something from a corpse
const skinning = { c: null, t: 0 };
let autoArmed = false, autoStay = 0;           // a flooded passage takes you on only after you have been somewhere else first
function travel(to, via) {            // via: arrive at the spot in that level whose "landing" is this, not at the door (a hole you drop through)
  if (leaving) return;
  leaving = true;
  setRun({ ...capture(), level: to, from: LEVEL, pos: null, via: via || null });
  document.getElementById('black').style.opacity = 0;
  fade(1, 0.7);
  setTimeout(go, 800);
}
const SET = { keys: 'Press F to set your gems in.', pad: 'Press X to set your gems in.', touch: 'Tap to set your gems in.' };
const GO = { keys: 'Press F to go on.', pad: 'Press X to go on.', touch: 'Tap to go on.' };

const viewDir = new THREE.Vector3(), ray = new THREE.Raycaster();
function dirAt(px, py) {            // the direction through a point on the screen
  ray.setFromCamera({ x: px / innerWidth * 2 - 1, y: 1 - py / innerHeight * 2 }, camera);
  return ray.ray.direction;
}
function pickUp(dir, tol) {          // returns true if there was something there to pick up
  const e = world.target(camera.position, dir, 2.6, tol);
  if (!e) return false;
  if (e.item.def.relic && creatures.list.some(c => c.def.boss && c.state !== 'dead')) { ui.say('The colossus stands between you and the gem.'); return true; }
  const where = inv.add(e.item), name = e.item.name;
  if (!where) { ui.say(`You have nowhere to put the ${name.toLowerCase()}.`); return true; }
  world.remove(e);
  const put = { pack: ' It is in your pack.', belt: ' It is on your belt.', bag: ' It is in a bag.' }[where] || '';
  ui.say(where === 'back' || where === 'body' || where === 'head' ? `You put on the ${name.toLowerCase()}.` : `Picked up: ${name}.${put}`);
  if (e.item.def.relic && e.item.def.relic === LEVEL) finishRealm();
  return true;
}
// A realm is finished when you take its relic (the item "relic_<realm>", where <realm> is the level's own name). The way back
// to the hall then opens: after a moment you are drawn back through the door you came in by.
let finishing = false;
function finishRealm() {
  if (finishing || LEVEL === 'hub') return;
  finishing = true;
  // A realm with a gate named "wayup" (mode "button": it looks like plain wall) has its own way back: that wall slides open, and
  // you walk out. Without one, you are drawn back to the hall through the door you came in by.
  if (gates.group('wayup').length) {
    setTimeout(() => {
      gates.opened.add('wayup'); gates.setGroup('wayup', true); gates.shake = 1; play('rumble');
      ui.say(data.wayupText || 'The gem is yours. Stone grinds behind you: part of the wall has slid back, and a stair goes up.');
    }, 1800);
    return;
  }
  setTimeout(() => ui.say('The gem is yours. The walls tremble, and the way back opens.'), 1800);
  setTimeout(() => { if (!fight.dead) travel('hub'); else finishing = false; }, 4600);
}
function dropHeld() {
  const it = inv.held;
  if (!it) return;
  let x = player.pos.x - Math.sin(player.yaw) * 0.9, z = player.pos.z - Math.cos(player.yaw) * 0.9;
  const f = world.ground(x, z, player.pos.y);
  // (not into a wall, and not over an edge: then at your feet)
  if (!(f <= player.pos.y + 0.6) || f < player.pos.y - 1.2 || level.ceilAt(x, z, player.pos.y) < f + 0.5) { x = player.pos.x; z = player.pos.z; }
  it.lit = false;
  world.place(it, x, z, player.pos.y);
  inv.held = null; inv.version++;
  ui.say(`Dropped: ${it.name}.`);
}
function brightnessAt(x, y, z) {    // roughly how well lit a spot is, for flat pictures that light does not reach
  // under an open sky it is daylight (a little less in a room); otherwise a faint glow, the lamp and the torches
  const here = level.cellAt(x, z), deep = here.dark && y < here.ceil;        // (under the ground, even in a level with a sky, it is dark)
  let b = data.sky && !deep ? (here.ceilTex === 'sky' || y >= here.ceil ? 1.0 : 0.8) : 0.07;
  const add = (l, power, range) => {
    const d2 = (x - l.x) ** 2 + (y - l.y) ** 2 + (z - l.z) ** 2;
    b += power / (Math.PI * (d2 + 0.5)) * Math.max(0, 1 - Math.sqrt(d2) / range);
  };
  if (lamp.visible) add(camera.position, lamp.intensity, lamp.distance);
  for (const l of torchLights) add(l.position, l.intensity, 12);
  return Math.min(1.15, b);
}
let loadState = 1;

document.getElementById('levelName').textContent = data.name || LEVEL;
const hud = {
  state: document.getElementById('state'),
  help: document.getElementById('help'),
  tint: document.getElementById('tint'),
  hp: document.getElementById('hpBar'), st: document.getElementById('stBar'), hurt: document.getElementById('hurt'), hit: document.getElementById('hit'),
  food: document.getElementById('foodBar'), rest: document.getElementById('restBar'), light: document.getElementById('lightBar'),
  air: document.getElementById('airBar'), airRow: document.getElementById('airRow'),
  skin: document.getElementById('skin'), skinBar: document.getElementById('skinBar'), skinName: document.getElementById('skinName'),
  lockHint: document.getElementById('lockHint'),
  wind: document.getElementById('wind'), windBar: document.getElementById('windBar'), windName: document.getElementById('windName'),
};
let clickUsed = false;
// How a creature looks to be doing, in plain words.
const health = c => c.state === 'dead' ? (c.def.skin && !c.skinned ? `It is dead. Hold a button to ${c.def.skin.verb} it.` : 'It is dead.') : c.hp < c.max * 0.35 ? 'It is badly hurt.'
  : c.hp < c.max * 0.8 ? 'It is hurt.' : (c.state === 'idle' || c.state === 'still') ? c.def.text : '';
// The controls text: one row per kind of thing, each in its own colour. [Key] becomes a key cap.
const HG = rows => rows.map(([c, l, t]) => `<div class="hg ${c}"><b class="hl">${l}</b><span>${t.replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>')}</span></div>`).join('');
const HELP = {
  keys: HG([
    ['c-move', 'MOVE', '[W] forward &nbsp; [S] back &nbsp; [A] [D] sidestep &nbsp; [Q] [E] turn &nbsp; [Shift] run &nbsp; [Space] jump, swim up &nbsp; both mouse buttons: walk forward'],
    ['c-look', 'LOOK', 'Move the mouse (click the view once to take the pointer) &nbsp; [Tab] switches between the cursor and the camera &nbsp; [Esc] gives the cursor back'],
    ['c-thing', 'THINGS', '[F] or left click: pick up what you look at &nbsp; [I] pack &nbsp; click what you carry for options &nbsp; [G] drop'],
    ['c-fight', 'FIGHT', '[Right button] right hand, [Left button] left hand: hold, then let go &nbsp; longer = harder &nbsp; [Wheel] chooses overhead, slash or thrust'],
    ['c-fight', '', '[C] guard &nbsp; [V] dodge &nbsp; [T] lock on'],
    ['c-live', 'SURVIVE', '[L] lamp &nbsp; click food to eat &nbsp; [M] map &nbsp; [B] sleep'],
    ['c-game', 'GAME', '[Esc] twice, or SETTINGS: menu &nbsp; [F5] quicksave &nbsp; [H] hide this'],
  ]),
  pad: HG([
    ['c-move', 'MOVE', 'Left stick walk &nbsp; [LB] run &nbsp; [A] jump, swim up'],
    ['c-look', 'LOOK', 'Right stick'],
    ['c-thing', 'THINGS', '[X] pick up &nbsp; [Y] pack &nbsp; in the pack: D-pad choose, [A] take or put, [X] options, [B] close'],
    ['c-fight', 'FIGHT', 'Hold [RT], then let go &nbsp; forward = thrust, back = overhead &nbsp; [LT] block &nbsp; [B] dodge &nbsp; press right stick: lock on'],
    ['c-live', 'SURVIVE', '[RB] lamp &nbsp; [X] on food: eat &nbsp; View: map'],
    ['c-game', 'GAME', 'Start: menu, sleep, save, load'],
  ]),
  touch: HG([
    ['c-move', 'MOVE', 'Drag on the left &nbsp; push fully to run'],
    ['c-look', 'LOOK', 'Drag on the right'],
    ['c-thing', 'THINGS', 'Tap to pick up &nbsp; tap what you carry for options &nbsp; tap the room to drop'],
    ['c-fight', 'FIGHT', 'Hold [HIT], then let go &nbsp; [BLOCK] &nbsp; [DODGE] &nbsp; [TARGET]'],
    ['c-live', 'SURVIVE', '[LAMP] &nbsp; tap food to eat &nbsp; [MAP]'],
    ['c-game', 'GAME', '[MENU]: sleep, save, load'],
  ]),
};
// The control text can be put away with its button (or H). On a phone it starts put away, as it would fill the screen.
let helpOn = false, time = 0, shownDevice = '';        // the controls start put away; the CONTROLS button (or H) shows them
try { const v = localStorage.getItem('tsp_help2'); if (v) helpOn = v === '1'; } catch (e) {}      // (a new name, so an old "shown" choice does not carry over)
const setHelp = on => { helpOn = on; if (params.get('nosave') !== '1') try { localStorage.setItem('tsp_help2', on ? '1' : '0'); } catch (e) {} };
document.getElementById('helpBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setHelp(!helpOn); });

function step(dt, forced) {
  input.charging = fight.winding;
  const inp = forced || input.read(dt);
  // The map. The game stands still while it is open.
  if (map.open) {
    if (inp.pressed.has('map') || inp.pressed.has('menu') || inp.pressed.has('back')) map.close();
    else map.control(inp, dt);
    renderer.render(scene, camera);
    return;
  }
  if (inp.pressed.has('map')) { openMap(); if (map.open) { map.control(inp, 0); return; } }
  // The menu. The game stands still while it is open.
  if (inp.pressed.has('quicksave') && !fight.dead && asleep <= 0 && !leaving && !menu.open && !map.open) {
    ui.say(writeSlot('quick', capture(), data.name || LEVEL) ? 'Quicksaved.' : 'The quicksave could not be written.');
  }
  if (inp.pressed.has('menu') && !shop.isOpen && !fight.dead && asleep <= 0 && !leaving) { menu.pad = input.device === 'pad'; menu.toggle(); }
  if (menu.open) {
    if (inp.pressed.has('left')) menu.nav(-1);
    if (inp.pressed.has('right')) menu.nav(1);
    if (input.device === 'pad' && inp.pressed.has('jump')) menu.press();
    if (inp.pressed.has('back')) menu.toggle();
    renderer.render(scene, camera);
    return;
  }
  // A text scene. The game stands still while it is up; F, Space, A or the button goes on.
  if (scenes.open) {
    if (inp.pressed.has('use') || inp.pressed.has('jump') || inp.pressed.has('back')) scenes.close();
    renderer.render(scene, camera);
    return;
  }
  if (shopNext) { const p = shopNext; shopNext = null; shop.open(p, input.device === 'pad'); }
  if (shop.isOpen) {                                     // trading: the game waits; B or Esc closes the shop
    if (inp.pressed.has('back') || inp.pressed.has('menu')) shop.close();
    else if (input.device === 'pad') {
      if (inp.pressed.has('left')) shop.nav(-1);
      if (inp.pressed.has('right')) shop.nav(1);
      if (inp.pressed.has('jump') || inp.pressed.has('use')) shop.press();
    }
    renderer.render(scene, camera);
    return;
  }
  time += dt; played += dt;
  if (asleep > 0) asleep -= dt;
  if (inp.pressed.has('lamp')) life.toggleLight(torches.some(t => t.d < 2.4));
  if (inp.pressed.has('sleep')) sleep();
  if (inp.pressed.has('help')) setHelp(!helpOn);
  if (inp.pressed.has('stance')) ui.say(`Next blow: ${MOVES[['low', 'mid', 'high'][input.stance]].name.toLowerCase()}.`);
  if (inp.pressed.has('nextLevel')) { travel(LEVELS[(LEVELS.indexOf(LEVEL) + 1) % LEVELS.length]); return; }
  for (const [act, d] of [['resDown', -1], ['resUp', 1]]) {
    if (!inp.pressed.has(act)) continue;
    const i = RES_STEPS.reduce((b, v, j) => Math.abs(v - RES) < Math.abs(RES_STEPS[b] - RES) ? j : b, 0);
    RES = RES_STEPS[Math.max(0, Math.min(RES_STEPS.length - 1, i + d))];
    resize(); shownDevice = '';
  }
  const pad = input.device === 'pad';
  let padPress = false;
  if (pad && ui.open) {              // with the pack open, A chooses instead of jumping
    padPress = inp.pressed.delete('jump');
    inp.jumpHeld = false;
  }
  const load = inv.weight / inv.capacity, ls = load > 1.3 ? 0 : load > 1 ? 0.5 : 1;
  if (ls !== loadState) {
    loadState = ls;
    if (ls < 1) ui.say(ls ? 'You are carrying too much. You move slowly.' : 'You are carrying too much to move.');
  }
  inp.slow = ls * (fight.blocking ? 0.5 : fight.winding ? 0.75 : 1);
  if (fight.dead || asleep > 0) { inp.attackHeld = inp.blockHeld = inp.mouseAttack = inp.handR = inp.handL = false; inp.mx = inp.mz = inp.lookX = inp.lookY = 0; inp.jumpHeld = false; inp.pressed.clear(); inp.clicks = []; }
  if (cut && (inp.pressed.has('use') || inp.pressed.has('jump') || inp.pressed.has('back') || (inp.clicks && inp.clicks.length))) cut.t = cut.dur;      // F, Space, B or a click skips the cutscene
  if (cut) { inp.attackHeld = inp.blockHeld = inp.mouseAttack = inp.handR = inp.handL = false; inp.mx = inp.mz = inp.lookX = inp.lookY = 0; inp.jumpHeld = false; inp.pressed.clear(); inp.clicks = []; }
  lifts.update(dt);
  lifts.carry(player);
  player.update(dt, inp);
  // A level with "fallDamage": a fall of more than six metres hurts, more the further it is; sixteen metres or more kills.
  if (player.landed) {
    const h = player.landed; player.landed = 0;
    if (data.fallDamage && h > 6 && !fight.dead) {
      if (h >= 16) { ui.say('You fall a long way.'); fight.harm(9999, 'fell'); }
      else { ui.say('You land hard.'); fight.harm(Math.round((h - 6) / 10 * fight.hpMax * 0.9), 'fell'); }      // (up to 90% of your health, at 16 m)
    }
  }
  if (dropWords && (player.onGround || player.swimming)) { ui.say(dropWords); dropWords = ''; }
  gates.update(dt, player);
  fireballs.update(dt, player, dmg => { ui.say('A fireball burns you.'); fight.harm(dmg, 'burned'); });
  if (!fight.dead && onSpikes(level, player)) { ui.say('The spikes take you.'); fight.harm(9999, 'impaled'); }
  if (inp.pressed.has('target') && !ui.open && !fight.dead) {
    const r = target.toggle();
    ui.say(r === 'on' ? `Locked on to the ${target.c.def.name.toLowerCase()}.` : r === 'off' ? 'Lock let go.' : 'Nothing to lock on to.');
  }
  target.steer(dt);
  for (const p of props.solid) {      // you cannot walk through an urn
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz), min = p.r + 0.28;
    if (d >= min || d < 0.001 || player.pos.y < p.y - 1.1 || player.pos.y > p.y + (p.tall ? 3 : 1.1)) continue;
    const nx = p.x + dx / d * min, nz = p.z + dz / d * min;
    if (player.fits(nx, nz, player.pos.y, 0.25)) { player.pos.x = nx; player.pos.z = nz; }
  }

  camera.position.set(player.pos.x + (Math.random() - 0.5) * 0.04 * gates.shake, player.eyeY + (Math.random() - 0.5) * 0.04 * gates.shake, player.pos.z);
  // a blow knocks the head: it snaps aside and back from where the blow came, shakes, and settles in a third of a second
  const kick = fight.kick, wob = kick * Math.sin(fight.kickT * 38);
  camera.rotation.set(player.pitch + 0.05 * kick + 0.02 * wob, player.yaw + 0.07 * kick * fight.kickSide, 0.11 * kick * (fight.kickSide || 1) + 0.03 * wob);
  camera.position.y -= 0.06 * kick;
  camera.updateMatrixWorld();
  camera.getWorldDirection(viewDir);

  const spot = spotHere();
  if (spot !== lastSpot) {
    lastSpot = spot;
    if (spot && spot.text && !(spot.to && !spot.auto) && !spot.seal && !seenSpots.has(spot.text)) { seenSpots.add(spot.text); spotWords = spot.text; spotWordsT = 6; }
  }
  if (spotWordsT > 0) { spotWordsT -= dt; if (spotWordsT <= 0) spotWords = ''; }
  if (!spot || !spot.auto) { autoArmed = true; autoStay = 0; }
  else if (autoArmed && spot.to && !fight.dead) {         // "delay": seconds to stand there first, so the load starts after you are out of the water, not in it
    autoStay += dt;
    if (autoStay >= (spot.delay || 0)) { travel(spot.to, spot.via); return; }
  }
  if (inp.pressed.has('bag')) ui.toggle();
  if (inp.pressed.has('mode')) ui.onMode();             // Tab: the cursor or the camera, like the switch above PACK
  if (pad && ui.open) {
    if (inp.pressed.has('left')) ui.nav(-1);
    if (inp.pressed.has('right')) ui.nav(1);
    if (padPress) ui.press();
    if (inp.pressed.has('use')) { if (inv.held) dropHeld(); else ui.openFocused(); }
    if (inp.pressed.has('back')) { if (ui.opts) ui.closeOpts(); else ui.toggle(); }
  } else {
    if (inp.pressed.has('use')) {
      if (setRelics()) { /* gems set in the seal */ } else if (inv.held) dropHeld(); else if (!pickUp(viewDir, 0.3) && !gates.use(player) && !talk() && spot && spot.to && !spot.auto) travel(spot.to);      // (a lever or a lock before speaking to someone)
    }
    if (inp.pressed.has('back')) inp.pressed.add('dodge');          // B dodges when the pack is shut
  }
  if (inp.pressed.has('drop')) dropHeld();
  // A click picks up, drops or goes through a door. If it did none of those, it is the start of a blow.
  for (const [cx, cy] of inp.clicks || []) {
    if (inv.held) { dropHeld(); clickUsed = true; }
    else if (pickUp(dirAt(cx, cy), 0.14) || setRelics() || (input.device === 'touch' && (gates.use(player) || talk()))) clickUsed = true;
    else if (spot && spot.to && !spot.auto && input.device === 'touch') { travel(spot.to); clickUsed = true; }      // with a mouse a click is a blow: doors are F
  }
  if (!inp.handL) clickUsed = false;

  // Hunger, tiredness, and the light you carry.
  life.update(dt, { underwater: player.underwater, hunting: creatures.hunting });
  const glow = life.light();
  // The lamp is dimmed to nothing rather than hidden: a light that comes and goes makes three.js rebuild every shader,
  // and the game would freeze for half a second each time the lantern is lit or put out.
  if (glow) {
    const flick = glow.flicker ? 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 6.1) : 1;
    const low = glow.left < 0.08 ? 0.55 + 0.45 * Math.sin(time * 13) ** 2 : 1;        // it gutters when nearly out
    lamp.intensity = glow.power * flick * low; lamp.distance = glow.range;
  } else lamp.intensity = 0;
  if (hasBook()) map.explore(player.pos.x, player.pos.z, player.eyeY, !!glow || torches.some(t => t.d < 9));

  // Creatures and the fight.
  const lit = Math.min(1, brightnessAt(player.pos.x, player.pos.y + 1, player.pos.z) * 1.6);
  const moving = Math.hypot(player.vx, player.vz);
  const noise = Math.max(fight.noise, !player.onGround || player.swimming ? 0.7 : moving > 4 ? 1 : moving > 1.5 ? 0.35 : 0);
  people.update(dt, brightnessAt);
  creatures.update(dt, { x: player.pos.x, y: player.pos.y, z: player.pos.z, eyeY: player.eyeY, r: 0.3, lit, noise, alive: !fight.dead },
    brightnessAt);
  let dodge = null;
  if (inp.pressed.has('dodge')) {                       // turn [sideways, forward] into a direction in the world
    const [sx, fz] = inp.dodgeDir || [0, -1], n = Math.hypot(sx, fz) || 1, sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    dodge = [(-sin * fz + cos * sx) / n, (-cos * fz - sin * sx) / n];
  }
  // Each hand strikes with whatever is in it (an empty hand punches). Two kinds of thing do not strike:
  // a shield is held up to guard, and a light (torch, lantern, lamp) is kept out of the fight, so its button
  // makes the other hand strike instead.
  const kind = i => { const it = inv.hands[i]; return !it || it.def.weapon ? 'strike' : (it.def.block || 0) >= 0.5 ? 'guard' : it.def.light ? 'light' : 'strike'; };
  const does = i => kind(i) !== 'light' ? [kind(i), i] : kind(1 - i) === 'light' ? ['strike', i] : [kind(1 - i), 1 - i];
  let strikeHand = -1, guardNow = inp.blockHeld;
  if (!ui.open) {
    for (const [held, i] of [[inp.handR, 1], [inp.handL && !clickUsed, 0]]) {
      if (!held) continue;
      const [what, hand] = does(i);
      if (what === 'guard') guardNow = true; else if (strikeHand < 0) strikeHand = hand;
    }
    if (inp.attackHeld && strikeHand < 0) strikeHand = fight.mainHand();
  }
  // Hold any button over a dead creature that has something to take (an animal's hide, a mummy's wrappings, a skeleton's
  // bone) and you work at it instead of striking. The bar fills, and the thing is yours.
  // With the cursor free, the corpse is the one under the cursor; with the camera, the one you look at.
  const skinDir = input.device === 'keys' && !input.locked() ? dirAt(...input.pointer).clone() : viewDir;
  const corpse = !fight.dead && !ui.open && !fight.winding && fight.swing <= 0 ? creatures.skinnable(camera.position, skinDir) : null;
  if (corpse && (strikeHand >= 0 || guardNow)) {
    strikeHand = -1; guardNow = false;
    if (skinning.c !== corpse) { skinning.c = corpse; skinning.t = 0; }
    skinning.t += dt;
    if (Math.random() < dt * 9) play('chip');
    if (skinning.t >= SKIN_TIME) {
      const sk = corpse.def.skin, it = make(sk.item);
      corpse.skinned = true; skinning.c = null; skinning.t = 0;
      if (!inv.add(it)) world.place(it, player.pos.x - Math.sin(player.yaw) * 0.6, player.pos.z - Math.cos(player.yaw) * 0.6, player.pos.y);
      ui.say(sk.done);
    }
  } else { skinning.c = null; skinning.t = 0; }
  fight.update(dt, { attack: strikeHand >= 0, hand: strikeHand, cancel: inp.cancelR, block: guardNow, dodge, aim: inp.aim },
    brightnessAt(player.pos.x, player.eyeY, player.pos.z));

  target.update(dt, inp.aim, ui.open || fight.dead);
  if (!fight.dead && asleep <= 0 && !leaving && !cut) scenes.check(dt);
  prophetTick(dt);
  const seen = world.target(camera.position, viewDir, 2.6, 0.3);
  const beast = seen ? null : creatures.target(camera.position, viewDir);
  const gateWords = seen || beast ? '' : gates.look(player, USE[input.device]);
  ui.setLook(seen ? seen.item.name : beast ? beast.def.name + '. ' + health(beast)
    : corpse ? (skinning.c ? '' : `${corpse.def.name}. It is dead. Hold a button to ${corpse.def.skin.verb} it.`)
    : gateWords ? gateWords
    : spot && spot.seal ? `A great seal is set in the stone. ${placed.size} of its eight sockets hold a gem.` + (relicsCarried().length && nearSeal() ? ' ' + SET[input.device] : '')
    : spot && spot.text && spot.to && !spot.auto ? spot.text + ' ' + GO[input.device]
    : spotWords);
  ui.update(dt, pad);
  hud.hp.style.width = (fight.hp / fight.hpMax * 100) + '%';
  hud.st.style.width = (fight.st / fight.stMax * 100) + '%';
  hud.food.style.width = life.food + '%'; hud.rest.style.width = life.rest + '%';
  const gz = life.gauge(), lr = document.getElementById('lightRow');
  lr.style.display = gz ? 'flex' : 'none';
  if (gz) {
    hud.light.style.width = gz.left * 100 + '%';
    lr.classList.toggle('off', !gz.lit); lr.classList.toggle('low', gz.left < 0.2);
    document.getElementById('lightMin').textContent = gz.mins + ' min';
  }
  const air = life.air ?? 1;
  hud.airRow.style.display = air < 1 ? 'flex' : 'none';
  hud.air.style.width = (air * 100) + '%'; hud.airRow.classList.toggle('out', air <= 0.3);
  const needClick = input.device === 'keys' && !input.locked() && !input.noLock && !input.uiOpen() && !cut;
  if (hud.lockHint.style.display !== (needClick ? 'block' : 'none')) hud.lockHint.style.display = needClick ? 'block' : 'none';
  hud.hurt.style.opacity = fight.dead ? 1 : Math.min(1, fight.hurtT * 2) * 0.9 + (fight.hp < fight.hpMax * 0.25 ? 0.25 : 0);
  hud.hit.style.opacity = fight.dead ? 0 : fight.kick * 0.55;           // the whole view flashes red for a moment
  hud.skin.style.opacity = skinning.c ? 1 : 0;
  if (skinning.c) { hud.skinBar.style.width = Math.min(100, skinning.t / SKIN_TIME * 100) + '%'; hud.skinName.textContent = skinning.c.def.skin.label; }
  hud.wind.style.opacity = fight.winding ? 1 : 0;
  if (fight.winding) {
    hud.windBar.style.width = (fight.charge * 100) + '%';
    const blowName = fight.blowName();
    if (hud.windName.textContent !== blowName) hud.windName.textContent = blowName;
  }

  // the nearest torches get the lights
  for (const t of torches) {
    t.d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z, t.y - player.eyeY);
    t.flick = 0.85 + 0.15 * Math.sin(time * 9 + t.phase) * Math.sin(time * 5.3 + t.phase * 2);
    t.mesh.userData.flame.scale.y = 0.8 + 0.4 * t.flick;
    t.mesh.userData.flame.scale.x = 0.92 + 0.16 * Math.sin(time * 7.3 + t.phase * 3);
  }
  const near = [...torches].sort((a, b) => a.d - b.d);
  torchLights.forEach((l, i) => {
    const t = near[i];
    l.position.set(t.x, t.y, t.z);
    l.intensity = 16 * t.flick * Math.max(0, Math.min(1, (26 - t.d) / 6));
  });

  world.light(brightnessAt);
  for (const f of props.flat) f.spr.material.color.setScalar(brightnessAt(f.x, f.y, f.z));

  const f = player.underwater ? WET : DARK;
  if (scene.fog.density !== f.density) {
    scene.fog.color.setHex(f.color); scene.fog.density = f.density; scene.background.setHex(f.color);
  }
  hud.tint.style.opacity = player.underwater ? 1 : 0;
  const state = player.underwater ? 'Under water' : player.swimming ? 'Swimming'
    : !player.onGround ? 'In the air' : 'Walking';
  if (hud.state.textContent !== state) hud.state.textContent = state;
  if (shownDevice !== input.device + helpOn) {
    shownDevice = input.device + helpOn;
    hud.help.innerHTML = helpOn ? HELP[input.device] + (input.device === 'keys'
      ? HG([['c-game', 'VIEW', `[-] [=] picture detail (now ${RES} lines)`]]) : '') : '';
    document.getElementById('helpBtn').textContent = helpOn ? 'HIDE CONTROLS' : 'CONTROLS';
  }

  if (skyFx) {
    skyFx.update(dt, camera, renderer.domElement.height);
    towerTick(dt); windows.update(dt);
    wind(Math.min(1, Math.max(0, player.pos.y / 140)));          // the wind is harder the higher you are
  }
  renderer.render(scene, camera);
}

// The opening plays first (add ?intro=0 to the address to go straight in). Then you come to in the dark.
step(0);
await LOAD.finish();
const black = document.getElementById('black');
let started = false;
if (!fresh) {
  black.style.display = 'none';
} else {
  const latest = newest(), cont = document.getElementById('continueBtn');
  if (latest) {                       // there is a save: offer to go on from it
    cont.style.display = 'block';
    cont.onclick = e => { e.stopPropagation(); loadRun(latest.run); };
  }
  const watched = await runIntro();
  input.keys.clear(); input.pressed.clear(); input.clicks.length = 0;
  black.style.transition = '';
  if (watched) {
    black.classList.add('wake');
    black.addEventListener('animationend', () => { black.style.display = 'none'; });
    setTimeout(() => ui.say('You wake in the dark. The way out is buried.'), 4500);
    setTimeout(() => ui.say({ keys: 'Press L to light your lantern.', pad: 'Press RB to light your lantern.',
      touch: 'Press LAMP to light your lantern.' }[input.device]), 8500);
  } else {
    black.style.display = 'none';
  }
}

// The game keeps a save of its own: when you come into a level, and when you leave the page.
started = true;
if (!run || !run.pos) writeSlot('auto', capture(), data.name || LEVEL);
addEventListener('pagehide', () => {
  if (!started || leaving || fight.dead) return;
  const r = capture();
  setRun(r); writeSlot('auto', r, data.name || LEVEL);
});

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) || 0;      // (|| 0: never a frame of NaN time)
  last = now;
  step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For testing from the console.
window.game = { gates, fireballs, lifts, unlockRealm, travel, THREE, scene, camera, renderer, level, player, input, lamp, torches, step, inv, world, ui, make, creatures, fight, life, menu, capture, sleep, map, openMap, target, scenes };
