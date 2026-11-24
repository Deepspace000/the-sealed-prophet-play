// The map: one page of your notebook for each level. It draws itself as you walk, and you can write notes on it.
// What a save keeps for each level:  { name, w, h, seen, notes: [{ x, z, t }] }
//   seen  = one character for each cell, row after row: 1 if you have seen it, 0 if not
//   notes = your own words; x and z say where on the level, measured in cells
import { Level } from './level.js';

// A controller cannot type, so it writes one of these words instead.
const WORDS = ['Door', 'Locked', 'Danger', 'Treasure', 'Food', 'Come back here'];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];                 // north, east, south, west
const EDGE = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];           // the middle of each side of a cell
const HINT = {
  keys: 'Click the page to write a note &nbsp; click a note to change it, or empty it to rub it out &nbsp; arrow keys turn the page &nbsp; M closes',
  pad: 'Left stick moves the cross &nbsp; A writes a word, press again for the next word &nbsp; X rubs it out &nbsp; D-pad turns the page &nbsp; B closes',
  touch: 'Tap the page to write a note &nbsp; tap a note to change it, or empty it to rub it out',
};
const PENCIL = 'rgba(52,50,48,.82)', FAINT = 'rgba(52,50,48,.6)', BLUE = 'rgba(50,95,150,.5)', RED = 'rgba(175,45,30,.9)';
const rnd = (a, b, c) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

// A pencil line: drawn twice, a little unsteady, the same every time for the same seed.
function line(g, x1, y1, x2, y2, w, col, seed) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, ex = (x2 - x1) / len * 1.2, ey = (y2 - y1) / len * 1.2;
  g.strokeStyle = col;
  for (let pass = 0; pass < 2; pass++) {
    const j = k => (rnd(seed, pass, k) - 0.5) * 1.5;
    g.lineWidth = w * (0.7 + 0.5 * rnd(seed, pass, 7));
    g.beginPath();
    g.moveTo(x1 - ex + j(1), y1 - ey + j(2));
    g.quadraticCurveTo((x1 + x2) / 2 + j(3), (y1 + y2) / 2 + j(4), x2 + ex + j(5), y2 + ey + j(6));
    g.stroke();
  }
}

export class GameMap {
  // o: { id, level, data, pages (from a save), order (level ids in the order of their pages), load(id) -> Promise of { level, data } }
  constructor(o) {
    this.id = o.id; this.order = o.order; this.load = o.load;
    this.pages = o.pages ? JSON.parse(JSON.stringify(o.pages)) : {};
    this.world = { [o.id]: { level: o.level, data: o.data } };
    this.seen = {};
    this.page(o.id);
    this.open = false; this.view = o.id; this.dirty = true; this.device = 'keys';
    this.me = null; this.cur = [0, 0]; this.editing = null; this.boxes = []; this.lastKey = '';

    this.el = document.getElementById('map');
    this.cv = document.getElementById('mapCanvas');
    this.field = document.getElementById('mapNote');
    this.hint = document.getElementById('mapHint');
    this.el.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (b) { e.preventDefault(); const a = b.dataset.m; if (a === 'close') this.close(); else this.flip(a === 'prev' ? -1 : 1); }
      else if (e.target === this.el) this.close();
    });
    this.cv.addEventListener('click', e => this.click(e));
    this.field.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.commit();
      else if (e.key === 'Escape') { this.editing = null; this.field.style.display = 'none'; this.dirty = true; }
      e.stopPropagation();
    });
    this.field.addEventListener('blur', () => this.commit());
    addEventListener('keydown', e => {
      if (!this.open || e.target === this.field) return;
      if (e.code === 'ArrowLeft' || e.code === 'PageUp') this.flip(-1);
      if (e.code === 'ArrowRight' || e.code === 'PageDown') this.flip(1);
    });
    addEventListener('resize', () => { this.dirty = true; });
    try { document.fonts.load('20px Quill').then(() => { this.dirty = true; }); } catch (e) { /* the page still draws, in another hand */ }
  }

  // Make sure there is a page for a level whose shape we know.
  page(id) {
    const L = this.world[id].level, n = L.w * L.h;
    let p = this.pages[id];
    if (!p || p.w !== L.w || p.h !== L.h) p = this.pages[id] = { name: L.data.name || id, w: L.w, h: L.h, seen: '', notes: (p && p.notes) || [] };
    const a = this.seen[id] = new Uint8Array(n);
    for (let i = 0; i < n && i < p.seen.length; i++) a[i] = p.seen[i] === '1' ? 1 : 0;
  }
  // The pages as plain data, for a save.
  pack() {
    for (const id in this.seen) this.pages[id].seen = this.seen[id].join('');
    return this.pages;
  }

  // Draw what you can see from where you stand onto the page. far: you have light to see by.
  explore(x, z, eyeY, far) {
    const L = this.world[this.id].level, s = L.size, cx = Math.floor(x / s), cz = Math.floor(z / s);
    const key = cx + ',' + cz + ',' + far + ',' + Math.round(eyeY);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const seen = this.seen[this.id], R = far ? 4 : 1;
    const hides = c => c.solid || c.secret || c.floor > eyeY + 0.2 || c.ceil < eyeY - 0.2;   // rock, a false wall, a high ledge, a low roof
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R + 1) continue;
      const tx = cx + dx, tz = cz + dz, c = L.cell(tx, tz);
      if (c.solid || seen[tz * L.w + tx]) continue;
      if (dx || dz) {
        if (hides(c)) continue;
        const ax = x / s, az = z / s, bx = tx + 0.5, bz = tz + 0.5, n = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
        let clear = true;
        for (let i = 1; i < n && clear; i++) {
          const px = Math.floor(ax + (bx - ax) * i / n), pz = Math.floor(az + (bz - az) * i / n);
          if ((px !== cx || pz !== cz) && (px !== tx || pz !== tz) && hides(L.cell(px, pz))) clear = false;
        }
        if (!clear) continue;
      }
      seen[tz * L.w + tx] = 1;
      this.dirty = true;
    }
  }

  pagesInOrder() { return this.order.filter(id => this.pages[id]); }
  show(me, device) {
    this.open = true; this.view = this.id; this.device = device; this.me = me;
    this.cur = [me.x, me.z];
    this.el.style.display = 'flex';
    this.hint.innerHTML = HINT[device];
    const many = this.pagesInOrder().length > 1;
    for (const b of this.el.querySelectorAll('[data-m=prev],[data-m=next]')) b.style.visibility = many ? 'visible' : 'hidden';
    this.dirty = true;
  }
  close() {
    this.commit();
    this.open = false;
    this.el.style.display = 'none';
  }
  flip(d) {
    const list = this.pagesInOrder();
    if (list.length < 2) return;
    this.commit();
    this.view = list[(list.indexOf(this.view) + d + list.length) % list.length];
    const p = this.pages[this.view];
    this.cur = this.view === this.id ? [this.me.x, this.me.z] : [p.w / 2, p.h / 2];
    if (!this.world[this.view]) {
      const id = this.view;
      this.load(id).then(w => { this.world[id] = w; this.page(id); this.dirty = true; });
    }
    this.dirty = true;
  }

  // Controller: the stick moves a cross about the page.
  control(inp, dt) {
    if (this.device === 'pad') {
      const p = this.pages[this.view];
      if (inp.mx || inp.mz) {
        this.cur[0] = Math.max(0, Math.min(p.w, this.cur[0] + inp.mx * dt * 7));
        this.cur[1] = Math.max(0, Math.min(p.h, this.cur[1] - inp.mz * dt * 7));
        this.dirty = true;
      }
      const near = () => p.notes.find(n => Math.hypot(n.x - this.cur[0], n.z - this.cur[1]) < 0.7);
      if (inp.pressed.has('jump')) {
        const n = near();
        if (n) n.t = WORDS[(WORDS.indexOf(n.t) + 1) % WORDS.length];
        else p.notes.push({ x: +this.cur[0].toFixed(2), z: +this.cur[1].toFixed(2), t: WORDS[0] });
        this.dirty = true;
      }
      if (inp.pressed.has('use')) { const n = near(); if (n) { p.notes.splice(p.notes.indexOf(n), 1); this.dirty = true; } }
      if (inp.pressed.has('left')) this.flip(-1);
      if (inp.pressed.has('right')) this.flip(1);
    }
    if (this.dirty) this.draw();
  }

  // Mouse and touch: click the page to write, click a note to change it.
  click(e) {
    if (!this.f) return;
    const r = this.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = this.boxes.find(b => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1);
    if (hit) return this.edit(hit.note, false);
    if (px < this.f.bind + 4 || py < 8) return;
    this.edit({ x: +((px - this.f.ox) / this.f.cell).toFixed(2), z: +((py - this.f.oy) / this.f.cell).toFixed(2), t: '' }, true);
  }
  edit(note, isNew) {
    this.commit();
    this.editing = { note, isNew };
    const f = this.f, el = this.field, sx = f.ox + note.x * f.cell, sy = f.oy + note.z * f.cell;
    el.value = note.t;
    el.style.display = 'block';
    el.style.left = Math.max(f.bind + 4, Math.min(f.W - 204, sx + 5)) + 'px';
    el.style.top = Math.max(4, Math.min(f.H - 30, sy - 14)) + 'px';
    el.focus(); el.select();
    this.dirty = true;
  }
  commit() {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    this.field.style.display = 'none';
    const notes = this.pages[this.view].notes, t = this.field.value.trim().slice(0, 36);
    if (!t) { if (!ed.isNew) notes.splice(notes.indexOf(ed.note), 1); }
    else { ed.note.t = t; if (ed.isNew) notes.push(ed.note); }
    this.dirty = true;
  }

  draw() {
    this.dirty = false;
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    const small = W < 520, bind = small ? 12 : 20, top = small ? 44 : 56, edge = small ? 12 : 24;
    const p = this.pages[this.view], wd = this.world[this.view];
    const cell = Math.min((W - bind - edge * 2) / p.w, (H - top - edge) / p.h);
    const ox = bind + (W - bind - cell * p.w) / 2, oy = top + (H - top - edge - cell * p.h) / 2;
    this.f = { W, H, bind, cell, ox, oy };

    // the paper: squared, a little yellowed, sewn down the left side
    g.fillStyle = '#e7ddbd'; g.fillRect(0, 0, W, H);
    const sq = cell / 2 >= 7 ? cell / 2 : cell;
    g.strokeStyle = 'rgba(70,120,170,.2)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = ox - Math.floor((ox - bind) / sq) * sq; x < W; x += sq) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
    for (let y = oy - Math.floor(oy / sq) * sq; y < H; y += sq) { g.moveTo(bind, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
    g.stroke();
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(120,90,40,0)'); v.addColorStop(1, 'rgba(120,90,40,.3)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2e241a'; g.fillRect(0, 0, bind, H);
    g.strokeStyle = 'rgba(214,196,150,.55)'; g.lineWidth = 1.5;
    g.beginPath();
    for (let y = 14; y < H - 10; y += 26) { g.moveTo(bind / 2, y); g.lineTo(bind / 2, y + 12); }
    g.stroke();

    // the name of the place, and which way is north
    // the words on the map are in the game's book face (index.html --book), in italic, a little smaller than the old handwriting
    const book = getComputedStyle(document.documentElement).getPropertyValue('--book') || 'Georgia, serif';
    const hand = px => `italic ${Math.round(px * 0.8)}px ${book}`;
    g.fillStyle = '#2b2a28'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = hand(small ? 24 : 32);
    g.fillText(p.name, bind + 16, top - 16);
    line(g, bind + 14, top - 9, bind + 22 + g.measureText(p.name).width, top - 10, 1.3, FAINT, 901);
    const nx = W - (small ? 22 : 34), ny = top - 8;
    line(g, nx, ny, nx, ny - 20, 1.3, PENCIL, 902);
    line(g, nx, ny - 20, nx - 4, ny - 13, 1.3, PENCIL, 903); line(g, nx, ny - 20, nx + 4, ny - 13, 1.3, PENCIL, 904);
    g.font = hand(small ? 15 : 18); g.textAlign = 'center';
    g.fillText('N', nx - 13, ny - 6);

    this.boxes = [];
    if (!wd) return;                       // the page is still being fetched
    const L = wd.level, seen = this.seen[this.view];
    const wall = Math.max(1.6, cell * 0.11), thin = Math.max(1, cell * 0.05);
    for (let cz = 0; cz < L.h; cz++) for (let cx = 0; cx < L.w; cx++) {
      if (!seen[cz * L.w + cx]) continue;
      const c = L.cell(cx, cz), x = ox + cx * cell, y = oy + cz * cell, seed = cz * 97 + cx * 13;
      if (c.water != null && c.water > c.floor) {          // water: blue pencil
        g.strokeStyle = BLUE; g.lineWidth = Math.max(1, cell * 0.045);
        for (let i = 0; i < 3; i++) {
          const yy = y + cell * (0.25 + 0.25 * i) + (rnd(seed, i, 1) - 0.5) * 2;
          const x0 = x + cell * (0.12 + 0.1 * rnd(seed, i, 2)), x1 = x + cell * (0.88 - 0.1 * rnd(seed, i, 3));
          g.beginPath(); g.moveTo(x0, yy);
          g.bezierCurveTo(x0 + (x1 - x0) / 3, yy - cell * 0.1, x0 + (x1 - x0) * 2 / 3, yy + cell * 0.1, x1, yy);
          g.stroke();
        }
      }
      if (c.slope) {                                       // stairs: a line for each step. A ramp: an arrow pointing up it.
        const ns = c.slope === 'N' || c.slope === 'S';
        if (c.steps) {
          const n = Math.max(3, Math.min(6, c.steps));
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            if (ns) line(g, x + cell * 0.14, y + cell * t, x + cell * 0.86, y + cell * t, thin, FAINT, seed + i * 7 + 300);
            else line(g, x + cell * t, y + cell * 0.14, x + cell * t, y + cell * 0.86, thin, FAINT, seed + i * 7 + 300);
          }
        } else {
          const [ux, uz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[c.slope];
          const mx = x + cell / 2, my = y + cell / 2, hx = mx + ux * cell * 0.34, hy = my + uz * cell * 0.34;
          line(g, mx - ux * cell * 0.34, my - uz * cell * 0.34, hx, hy, thin, FAINT, seed + 320);
          line(g, hx, hy, hx - ux * cell * 0.2 + uz * cell * 0.14, hy - uz * cell * 0.2 + ux * cell * 0.14, thin, FAINT, seed + 321);
          line(g, hx, hy, hx - ux * cell * 0.2 - uz * cell * 0.14, hy - uz * cell * 0.2 - ux * cell * 0.14, thin, FAINT, seed + 322);
        }
      }
      DIRS.forEach(([dx, dz], d) => {
        const bx = cx + dx, bz = cz + dz, b = L.cell(bx, bz);
        const bSeen = !b.solid && !!seen[bz * L.w + bx];
        const [x1, y1, x2, y2] = [[x, y, x + cell, y], [x + cell, y, x + cell, y + cell], [x, y + cell, x + cell, y + cell], [x, y, x, y + cell]][d];
        const fa = Level.floorIn(c, EDGE[d][0], EDGE[d][1]);
        const fb = b.solid ? 0 : Level.floorIn(b, EDGE[(d + 2) % 4][0], EDGE[(d + 2) % 4][1]);
        const shut = b.solid || (b.secret && !bSeen) || Math.min(c.ceil, b.ceil) - Math.max(fa, fb) < 0.4;
        if (shut) return line(g, x1, y1, x2, y2, wall, PENCIL, seed * 4 + d);
        // a ledge: a thin line with short marks on the low side
        const down = fa - fb > 0.9 ? 1 : (fb - fa > 0.9 && !bSeen) ? -1 : 0;
        if (!down) return;
        line(g, x1, y1, x2, y2, thin, PENCIL, seed * 4 + d + 500);
        for (let i = 0; i < 3; i++) {
          const t = 0.2 + 0.3 * i, tx = x1 + (x2 - x1) * t, ty = y1 + (y2 - y1) * t, k = cell * 0.16 * down;
          line(g, tx, ty, tx + dx * k, ty + dz * k, thin, FAINT, seed * 4 + d + 600 + i);
        }
      });
    }
    // doors to other places
    g.fillStyle = 'rgba(43,42,40,.88)';
    for (const s of wd.data.spots || []) {
      if (!s.wall || !s.to || !seen[s.cell[1] * L.w + s.cell[0]]) continue;
      const [dx, dz] = DIRS['NESW'.indexOf(s.wall)], mx = ox + (s.cell[0] + 0.5 + dx * 0.5) * cell, my = oy + (s.cell[1] + 0.5 + dz * 0.5) * cell;
      const along = cell * 0.3, deep = Math.max(2.5, cell * 0.11);
      g.fillRect(mx - (dx ? deep : along), my - (dz ? deep : along), (dx ? deep : along) * 2, (dz ? deep : along) * 2);
    }
    // where you are, and which way you face
    if (this.view === this.id && this.me) {
      const mx = ox + this.me.x * cell, my = oy + this.me.z * cell, r = Math.max(6, cell * 0.42);
      const fx = -Math.sin(this.me.yaw), fz = -Math.cos(this.me.yaw);
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(mx + fx * r, my + fz * r);
      g.lineTo(mx - fx * r * 0.6 - fz * r * 0.6, my - fz * r * 0.6 + fx * r * 0.6);
      g.lineTo(mx - fx * r * 0.2, my - fz * r * 0.2);
      g.lineTo(mx - fx * r * 0.6 + fz * r * 0.6, my - fz * r * 0.6 - fx * r * 0.6);
      g.fill();
    }
    // your notes
    const fs = small ? 16 : 21;
    g.font = hand(fs); g.textBaseline = 'middle'; g.fillStyle = '#2b2a28';
    p.notes.forEach((n, i) => {
      const sx = ox + n.x * cell, sy = oy + n.z * cell;
      line(g, sx - 3, sy - 3, sx + 3, sy + 3, 1.2, PENCIL, 700 + i); line(g, sx - 3, sy + 3, sx + 3, sy - 3, 1.2, PENCIL, 750 + i);
      if (this.editing && this.editing.note === n) return;
      const w = g.measureText(n.t).width, left = sx + 8 + w > W - 6;
      g.textAlign = left ? 'right' : 'left';
      g.fillText(n.t, left ? sx - 8 : sx + 8, sy);
      this.boxes.push({ note: n, x0: (left ? sx - 8 - w : sx) - 6, x1: (left ? sx : sx + 8 + w) + 6, y0: sy - fs * 0.6, y1: sy + fs * 0.6 });
    });
    if (this.editing && this.editing.isNew) {
      const n = this.editing.note, sx = ox + n.x * cell, sy = oy + n.z * cell;
      line(g, sx - 3, sy - 3, sx + 3, sy + 3, 1.2, PENCIL, 790); line(g, sx - 3, sy + 3, sx + 3, sy - 3, 1.2, PENCIL, 791);
    }
    if (this.device === 'pad') {           // the cross the stick moves
      const sx = ox + this.cur[0] * cell, sy = oy + this.cur[1] * cell;
      g.strokeStyle = 'rgba(30,60,120,.9)'; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx - 11, sy); g.lineTo(sx - 4, sy); g.moveTo(sx + 4, sy); g.lineTo(sx + 11, sy);
      g.moveTo(sx, sy - 11); g.lineTo(sx, sy - 4); g.moveTo(sx, sy + 4); g.lineTo(sx, sy + 11);
      g.stroke();
    }
  }
}
