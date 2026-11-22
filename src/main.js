import * as THREE from 'three';
import { Level } from './level.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { standinMaterials, standinTorch, standinDoor } from './standin.js';
import { Item, Inventory, WorldItems } from './items.js';
import { UI } from './ui.js';
import { runIntro } from './intro.js';
import { Creatures } from './creatures.js';
import { Fight, MOVES } from './fight.js';
import { Survival } from './survival.js';
import { Menu } from './menu.js';
import { GameMap } from './map.js';
import { Target } from './target.js';
import { loadArt } from './art.js';
import { buildProps, strikeUrn } from './props.js';
import { loadModels } from './models.js';
import { getRun, setRun, clearRun, writeSlot, readSlot, newest, toFile, fromFile } from './save.js';

const LEVELS = ['test', 'shaft', 'hub'];
// The game so far (see save.js). Without ?intro=0 in the address a new game begins at the title.
const params = new URLSearchParams(location.search);
const fresh = params.get('intro') !== '0';
if (fresh) clearRun();
let run = getRun();
const wanted = params.get('level');
if (run && wanted && wanted !== run.level) run = { ...run, from: run.level, level: wanted, pos: null };   // a jump made for testing
const LEVEL = run ? run.level : (wanted || 'test');
const go = () => { location.search = '?intro=0' + (params.get('nosave') === '1' ? '&nosave=1' : ''); };
const TORCH_LIGHTS = 5;            // how many wall torches cast light at once (the nearest ones)
const DARK = { color: 0x000000, density: 0.045 };
const WET = { color: 0x06323a, density: 0.22 };

// The picture is drawn small and scaled up with hard pixels. RES is its height in pixels.
const RES_STEPS = [160, 200, 240, 300, 360, 480];
let RES = +new URLSearchParams(location.search).get('res') || 240;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
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

const data = await (await fetch(`levels/${LEVEL}.json`)).json();
await loadArt();
const level = new Level(data);
if (data.fog != null) scene.fog.density = DARK.density = data.fog;      // how fast things fade into the dark
scene.add(level.build(standinMaterials()));

// Light: a faint glow everywhere, the lamp you carry, and the nearest wall torches.
scene.add(new THREE.AmbientLight(0x8090b0, data.ambient ?? 0.06));
const lamp = new THREE.PointLight(0xffd9a6, 14, 13, 2);
lamp.position.set(0.25, -0.2, 0);
camera.add(lamp);

const torches = level.torchPositions().map(pos => {
  const mesh = standinTorch();
  mesh.position.set(pos.x, pos.y, pos.z);
  scene.add(mesh);
  return { ...pos, mesh, phase: Math.random() * 10 };
});
const torchLights = [];
for (let i = 0; i < Math.min(TORCH_LIGHTS, torches.length); i++) {
  const l = new THREE.PointLight(0xff9a3c, 0, 12, 2);
  scene.add(l);
  torchLights.push(l);
}

await loadModels((data.props || []).filter(p => p.id === 'model').map(p => p.name));
const props = buildProps(scene, level, data.props || [], run && run.levels && run.levels[LEVEL] && run.levels[LEVEL].urns);      // big clay urns: you walk round them
for (const f of props.fires) {      // a fire on a brazier burns and gives light like a wall torch
  const mesh = standinTorch();
  mesh.position.set(f.x, f.y - 0.3, f.z);
  mesh.scale.setScalar(2.4);
  scene.add(mesh);
  torches.push({ ...f, mesh, phase: Math.random() * 10 });
}
const player = new Player(level);
const input = new Input(canvas);

// Things: what you carry, and what lies about the level.
const defs = (await (await fetch('data/items.json')).json()).items;
for (const id in defs) defs[id].id = id;
const make = id => { if (!defs[id]) throw new Error(`No item called "${id}"`); return new Item(defs[id]); };
const inv = new Inventory();
const world = new WorldItems(scene, level);
// Things are written into a save as plain data and made again from it.
const pack = it => it && { id: it.def.id, n: it.n, lit: it.lit || undefined, inside: it.inside && it.inside.map(pack) };
const unpack = o => {
  if (!o || !defs[o.id]) return null;
  const it = make(o.id);
  if (o.n != null) it.n = o.n;
  it.lit = !!o.lit;
  if (it.inside && o.inside) o.inside.forEach((c, i) => { if (i < it.inside.length) it.inside[i] = unpack(c); });
  return it;
};
const saved = run && run.levels && run.levels[LEVEL];      // this level as you left it, if you have been here before
if (run) for (const a of ['hands', 'belt', 'back']) (run.inv[a] || []).forEach((o, i) => { if (i < inv[a].length) inv[a][i] = unpack(o); });
else for (const id of data.carry || []) inv.add(make(id));
if (saved) {
  for (const o of saved.items) { const it = unpack(o); if (it) world.place(it, o.x, o.z); }
} else for (const it of data.items || []) {
  if (it.starter && run) continue;              // starter things are only there if you arrive with nothing
  const at = it.at || [0.5, 0.5];
  const thing = make(it.id);
  (it.inside || []).forEach((id, i) => { if (thing.inside && i < thing.inside.length) thing.inside[i] = make(id); });     // what is in a bag
  world.place(thing, (it.cell[0] + at[0]) * level.size, (it.cell[1] + at[1]) * level.size);
}
const ui = new UI(inv, () => dropHeld(), it => useThing(it));

// Where you stand: as saved, or just inside the door you came through, or the level's own starting place.
if (run && run.pos) {
  Object.assign(player.pos, { x: run.pos.x, y: run.pos.y, z: run.pos.z });
  player.yaw = run.pos.yaw; player.pitch = run.pos.pitch;
} else if (run && run.from) {
  const door = (data.spots || []).find(sp => sp.to === run.from);
  if (door) {
    const c = level.cellCentre(door.cell[0], door.cell[1]);
    Object.assign(player.pos, { x: c.x, y: level.floorAt(c.x, c.z), z: c.z });
    if (door.wall) player.yaw = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[door.wall];      // your back to the door
    else player.yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[door.face] ?? player.yaw;   // a flooded passage: the way it says
  }
}
player.eyeY = player.pos.y + 1.55;

// Creatures, and the fighting.
const kinds = (await (await fetch('data/creatures.json')).json()).creatures;
for (const id in kinds) kinds[id].id = id;
const creatures = new Creatures(scene, level, kinds, {
  onStrike: (c, dmg, type) => fight.takeHit(c, dmg, type),
  onDeath: () => {},
  drop: (id, x, z) => world.place(make(id), x, z),
  pushPlayer: (dx, dz) => {
    const p = player.pos;
    if (!player.fits(p.x + dx, p.z + dz, p.y, 0.25)) return false;
    p.x += dx; p.z += dz;
    return true;
  },
});
(data.creatures || []).forEach((c, n) => {
  const at = c.at || [0.5, 0.5];
  const was = saved && saved.creatures[n];
  const cr = creatures.spawn(c.id, was ? was.x : (c.cell[0] + at[0]) * level.size, was ? was.z : (c.cell[1] + at[1]) * level.size, n,
    !!(was && was.dead));
  if (was) {
    cr.y = was.y; cr.hp = was.hp; cr.fled = !!was.fled;
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
fight.onDeath = () => {
  leaving = true;
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
    items: world.list.map(e => ({ ...pack(e.item), x: e.x, z: e.z })),
    urns: props.solid.filter(u => u.smashed).map(u => u.n),
    creatures: creatures.list.map(c => ({ x: c.x, y: c.y, z: c.z, hp: c.hp, dead: c.state === 'dead', fled: c.fled, awake: c.state !== 'still' })),
  };
  return {
    v: 1, level: LEVEL, from: null,
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch },
    inv: { hands: inv.hands.map(pack), belt: inv.belt.map(pack), back: inv.back.map(pack) },
    hp: fight.hp, food: life.food, rest: life.rest, played, levels, maps: map.pack(),
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
  id: LEVEL, level, data, pages: run && run.maps, order: LEVELS,
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
  if (ui.open) ui.toggle();
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
  if (ui.open) ui.toggle();
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
    door.position.set((s.cell[0] + 0.5 + ox * 0.49) * level.size, level.cell(s.cell[0], s.cell[1]).floor + 1.22,
      (s.cell[1] + 0.5 + oz * 0.49) * level.size);
    door.rotation.y = turn;
    scene.add(door);
  }
  return s;
});
const spotHere = () => {
  const cx = Math.floor(player.pos.x / level.size), cz = Math.floor(player.pos.z / level.size);
  return spots.find(s => s.cell[0] === cx && s.cell[1] === cz);
};
let leaving = false;
let autoArmed = false;           // a flooded passage takes you on only after you have been somewhere else first
function travel(to) {
  if (leaving) return;
  leaving = true;
  setRun({ ...capture(), level: to, from: LEVEL, pos: null });
  document.getElementById('black').style.opacity = 0;
  fade(1, 0.7);
  setTimeout(go, 800);
}
const GO = { keys: 'Press E to go on.', pad: 'Press X to go on.', touch: 'Tap to go on.' };

const viewDir = new THREE.Vector3(), ray = new THREE.Raycaster();
function dirAt(px, py) {            // the direction through a point on the screen
  ray.setFromCamera({ x: px / innerWidth * 2 - 1, y: 1 - py / innerHeight * 2 }, camera);
  return ray.ray.direction;
}
function pickUp(dir, tol) {          // returns true if there was something there to pick up
  const e = world.target(camera.position, dir, 2.6, tol);
  if (!e) return false;
  const where = inv.add(e.item);
  if (!where) { ui.say('Your hands are full.'); return true; }
  world.remove(e);
  ui.say(where === 'back' ? `You put on the ${e.item.def.name.toLowerCase()}.` : `Picked up: ${e.item.def.name}.`);
  return true;
}
function dropHeld() {
  const it = inv.held;
  if (!it) return;
  let x = player.pos.x - Math.sin(player.yaw) * 0.9, z = player.pos.z - Math.cos(player.yaw) * 0.9;
  const f = level.floorAt(x, z);
  if (!(f <= player.pos.y + 0.6) || level.ceilAt(x, z) < f + 0.5) { x = player.pos.x; z = player.pos.z; }
  it.lit = false;
  world.place(it, x, z);
  inv.held = null; inv.version++;
  ui.say(`Dropped: ${it.def.name}.`);
}
function brightnessAt(x, y, z) {    // roughly how well lit a spot is, for flat pictures that light does not reach
  let b = 0.07;
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
  hp: document.getElementById('hpBar'), st: document.getElementById('stBar'), hurt: document.getElementById('hurt'),
  food: document.getElementById('foodBar'), rest: document.getElementById('restBar'), light: document.getElementById('lightBar'),
  wind: document.getElementById('wind'), windBar: document.getElementById('windBar'), windName: document.getElementById('windName'),
};
let clickUsed = false;
// How a creature looks to be doing, in plain words.
const health = c => c.state === 'dead' ? 'It is dead.' : c.hp < c.def.health * 0.35 ? 'It is badly hurt.'
  : c.hp < c.def.health * 0.8 ? 'It is hurt.' : (c.state === 'idle' || c.state === 'still') ? c.def.text : '';
const HELP = {
  keys: 'Mouse: hold the right button and move to look &nbsp; add the left button to walk forward &nbsp; Wheel: look up / down<br>'
    + 'Keys: W forward &nbsp; S stop, then back &nbsp; A D sidestep &nbsp; Q E turn &nbsp; Shift run &nbsp; '
    + 'Space jump / swim up &nbsp; F lamp &nbsp; H hide this &nbsp; L next level<br>'
    + 'Things: look at one and press E, or click it, to pick it up &nbsp; Tab pack &nbsp; '
    + 'put the pointer on a thing you carry to see what you can do with it &nbsp; click it to move it &nbsp; G or click the room to drop<br>'
    + 'Hands: the right button strikes with your right hand and the left button with your left: hold still, then let go. '
    + 'Longer hold, harder blow. A shield guards instead, and a hand holding a light lets the other hand strike &nbsp; pointer high = overhead, middle = slash, low = thrust &nbsp; '
    + 'R strikes and C guards too &nbsp; V, or tap A, D or S twice, to dodge &nbsp; T locks your view on to an enemy<br>'
    + 'Staying alive: F lights or puts out your light &nbsp; click food to eat it &nbsp; click the notebook, or press M, for the map &nbsp; '
    + 'B sleep &nbsp; Esc or SETTINGS: save, load, leave',
  pad: 'Move: left stick &nbsp; Look: right stick &nbsp; Run: LB &nbsp; Jump / swim up: A &nbsp; Lamp: RB<br>'
    + 'Things: X pick up &nbsp; Y pack &nbsp; in the pack: D-pad choose a place, A take or put, X what you can do with it, B close<br>'
    + 'Fighting: hold the right trigger, then let go, to strike &nbsp; push forward for a thrust, pull back for an overhead blow &nbsp; '
    + 'left trigger blocks &nbsp; B dodges &nbsp; press the right stick to lock on to an enemy<br>'
    + 'Staying alive: RB lights or puts out your light &nbsp; in the pack, X on food eats it &nbsp; '
    + 'View map &nbsp; Start menu: sleep, save and load (D-pad chooses, A presses, B closes)',
  touch: 'Move: drag on the left &nbsp; Look: drag on the right &nbsp; Push the stick fully to run<br>'
    + 'Things: tap one to pick it up &nbsp; tap a thing you carry to see what you can do with it &nbsp; tap the room to drop<br>'
    + 'Fighting: hold HIT, then let go, to strike &nbsp; hold BLOCK to block &nbsp; DODGE steps away &nbsp; TARGET locks on to an enemy<br>'
    + 'Staying alive: LAMP lights or puts out your light &nbsp; tap food to eat it &nbsp; MAP &nbsp; MENU: sleep, save and load',
};
let helpOn = true, time = 0, shownDevice = '';

function step(dt, forced) {
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
  if (inp.pressed.has('menu') && !fight.dead && asleep <= 0 && !leaving) { menu.pad = input.device === 'pad'; menu.toggle(); }
  if (menu.open) {
    if (inp.pressed.has('left')) menu.nav(-1);
    if (inp.pressed.has('right')) menu.nav(1);
    if (input.device === 'pad' && inp.pressed.has('jump')) menu.press();
    if (inp.pressed.has('back')) menu.toggle();
    renderer.render(scene, camera);
    return;
  }
  time += dt; played += dt;
  if (asleep > 0) asleep -= dt;
  if (inp.pressed.has('lamp')) life.toggleLight(torches.some(t => t.d < 2.4));
  if (inp.pressed.has('sleep')) sleep();
  if (inp.pressed.has('help')) helpOn = !helpOn;
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
  player.update(dt, inp);
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

  camera.position.set(player.pos.x, player.eyeY, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.updateMatrixWorld();
  camera.getWorldDirection(viewDir);

  const spot = spotHere();
  if (!spot || !spot.auto) autoArmed = true;
  else if (autoArmed && spot.to && !fight.dead) { travel(spot.to); return; }
  if (inp.pressed.has('bag')) ui.toggle();
  if (pad && ui.open) {
    if (inp.pressed.has('left')) ui.nav(-1);
    if (inp.pressed.has('right')) ui.nav(1);
    if (padPress) ui.press();
    if (inp.pressed.has('use')) { if (inv.held) dropHeld(); else ui.openFocused(); }
    if (inp.pressed.has('back')) { if (ui.opts) ui.closeOpts(); else ui.toggle(); }
  } else {
    if (inp.pressed.has('use')) {
      if (inv.held) dropHeld(); else if (!pickUp(viewDir, 0.3) && spot && spot.to && !spot.auto) travel(spot.to);
    }
    if (inp.pressed.has('back')) inp.pressed.add('dodge');          // B dodges when the pack is shut
  }
  if (inp.pressed.has('drop')) dropHeld();
  // A click picks up, drops or goes through a door. If it did none of those, it is the start of a blow.
  for (const [cx, cy] of inp.clicks || []) {
    if (inv.held) { dropHeld(); clickUsed = true; }
    else if (pickUp(dirAt(cx, cy), 0.14)) clickUsed = true;
    else if (spot && spot.to && !spot.auto && (input.device === 'touch' || !creatures.hunting)) { travel(spot.to); clickUsed = true; }
  }
  if (!inp.handL) clickUsed = false;

  // Hunger, tiredness, and the light you carry.
  life.update(dt, { underwater: player.underwater, hunting: creatures.hunting });
  const glow = life.light();
  lamp.visible = !!glow;
  if (glow) {
    const flick = glow.flicker ? 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 6.1) : 1;
    const low = glow.left < 0.08 ? 0.55 + 0.45 * Math.sin(time * 13) ** 2 : 1;        // it gutters when nearly out
    lamp.intensity = glow.power * flick * low; lamp.distance = glow.range;
  }
  if (hasBook()) map.explore(player.pos.x, player.pos.z, player.eyeY, !!glow || torches.some(t => t.d < 9));

  // Creatures and the fight.
  const lit = Math.min(1, brightnessAt(player.pos.x, player.pos.y + 1, player.pos.z) * 1.6);
  const moving = Math.hypot(player.vx, player.vz);
  const noise = Math.max(fight.noise, !player.onGround || player.swimming ? 0.7 : moving > 4 ? 1 : moving > 1.5 ? 0.35 : 0);
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
  fight.update(dt, { attack: strikeHand >= 0, hand: strikeHand, cancel: inp.cancelR, block: guardNow, dodge, aim: inp.aim },
    brightnessAt(player.pos.x, player.eyeY, player.pos.z));

  target.update(dt, inp.aim, ui.open || fight.dead);
  const seen = world.target(camera.position, viewDir, 2.6, 0.3);
  const beast = seen ? null : creatures.target(camera.position, viewDir);
  ui.setLook(seen ? seen.item.def.name : beast ? beast.def.name + '. ' + health(beast)
    : spot && spot.text ? spot.text + (spot.to && !spot.auto ? ' ' + GO[input.device] : '') : '');
  ui.update(dt, pad);
  hud.hp.style.width = (fight.hp / fight.hpMax * 100) + '%';
  hud.st.style.width = (fight.st / fight.stMax * 100) + '%';
  hud.food.style.width = life.food + '%'; hud.rest.style.width = life.rest + '%';
  hud.light.style.width = (glow ? glow.left * 100 : 0) + '%';
  hud.hurt.style.opacity = fight.dead ? 1 : Math.min(1, fight.hurtT * 2) * 0.9 + (fight.hp < fight.hpMax * 0.25 ? 0.25 : 0);
  hud.wind.style.opacity = fight.winding ? 1 : 0;
  if (fight.winding) {
    hud.windBar.style.width = (fight.charge * 100) + '%';
    if (hud.windName.textContent !== MOVES[fight.move].name) hud.windName.textContent = MOVES[fight.move].name;
  }

  // the nearest torches get the lights
  for (const t of torches) {
    t.d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z, t.y - player.eyeY);
    t.flick = 0.85 + 0.15 * Math.sin(time * 9 + t.phase) * Math.sin(time * 5.3 + t.phase * 2);
    t.mesh.userData.flame.scale.y = 0.8 + 0.4 * t.flick;
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
      ? ` &nbsp; - and = picture detail (now ${RES} lines)` : '') : '';
  }

  renderer.render(scene, camera);
}

// The opening plays first (add ?intro=0 to the address to go straight in). Then you come to in the dark.
step(0);
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
    setTimeout(() => ui.say({ keys: 'Press F to light your lantern.', pad: 'Press RB to light your lantern.',
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
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For testing from the console.
window.game = { THREE, scene, camera, renderer, level, player, input, lamp, torches, step, inv, world, ui, make, creatures, fight, life, menu, capture, sleep, map, openMap, target };
