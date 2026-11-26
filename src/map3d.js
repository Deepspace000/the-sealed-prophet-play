// The map in three dimensions (Mirko: put the 3D map into the game, but have it appear in sections as the player explores,
// rather than the whole level at once). It is another way of looking at the page of the notebook: the same cells you have
// seen (map.js keeps them), drawn as slabs at their real heights, which you can turn, tilt and zoom. Nothing you have not
// seen is drawn. It grew out of the tool tools/ptah_map.html, which shows a whole level and names its rooms.
//   Slabs: one for each cell you have seen (a stair is stepped), coloured by height: pale high up, dark low down.
//   A room inside a tower (a cell with a "cap") shows its floor, not the stone over it, so you look down into it.
//   Open desert (a level with "terrain"): the sand you have seen, as a skin over the dunes.
//   Where a seen cell's top stands well above its neighbour's, a clear wall: the faces of a tower's tiers.
//   Rays and floating stones ("beams") you have been on or beside, ladders, water, spikes, and a red mark where you stand.
import * as THREE from 'three';

const RAMP = [[0, '#d2aa62'], [0.3, '#c08a4c'], [0.6, '#a2572f'], [0.85, '#6e2f1c'], [1, '#452014']].map(([t, c]) => [t, new THREE.Color(c)]);
const SPIKE = new THREE.Color('#7a1c16'), SECRET = new THREE.Color('#8a66b8'), WATER = new THREE.Color('#2a5f8a'), SAND = 0xcfb07a;
const UP = new THREE.Vector3(0, 1, 0), DN = new THREE.Vector3(0, -1, 0), PX = new THREE.Vector3(1, 0, 0), NX = new THREE.Vector3(-1, 0, 0), PZ = new THREE.Vector3(0, 0, 1), NZ = new THREE.Vector3(0, 0, -1);

export class Map3D {
  constructor(host) {
    const cv = this.cv = document.createElement('canvas');
    cv.id = 'map3d'; host.appendChild(cv);
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6a5038, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.5); sun.position.set(0.6, 1, 0.35); this.scene.add(sun);
    this.world = null;
    this.ctl = { target: new THREE.Vector3(), r: 70, th: 0, ph: 0.95 };
    this.key = '';

    // turn, slide and zoom: one finger or the left button turns; two fingers, the right button or Shift slides; the wheel or a pinch zooms
    const ptrs = new Map(); let mode = 'rot', pinch = null;
    const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mode = (e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey) ? 'pan' : 'rot';
      if (ptrs.size === 2) pinch = two();
    });
    cv.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) { if (mode === 'rot') this.turn(-dx * 0.006, -dy * 0.006); else this.pan(dx, dy); }
      else if (ptrs.size === 2 && pinch) { const n = two(); this.zoom(pinch.d / Math.max(n.d, 1)); this.pan(n.x - pinch.x, n.y - pinch.y); pinch = n; }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('click', e => e.stopPropagation());
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0012))); }, { passive: false });
  }

  turn(dth, dph) { this.ctl.th += dth; this.ctl.ph = THREE.MathUtils.clamp(this.ctl.ph + dph, 0.05, Math.PI / 2 - 0.02); }
  zoom(k) { this.ctl.r = THREE.MathUtils.clamp(this.ctl.r * k, 6, 1500); }
  pan(dx, dy) {
    const k = 2 * this.ctl.r * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(1, this.cv.clientHeight), m = this.camera.matrixWorld.elements;
    this.ctl.target.x += (-dx * m[0] + dy * m[4]) * k; this.ctl.target.y += (-dx * m[1] + dy * m[5]) * k; this.ctl.target.z += (-dx * m[2] + dy * m[6]) * k;
  }
  show(on) { this.cv.style.display = on ? 'block' : 'none'; }

  // Draw a level from the cells that have been seen. me: { x, z (cells), y (metres), yaw } where you stand, or null (another level's page).
  // fresh: look at it from behind where you stand (when the map is opened), not from where the view was left.
  build(level, seen, me, fresh) {
    const key = level.data.name + ':' + (me ? [me.x, me.z, me.y].map(v => v.toFixed(1)).join(',') : '') + ':' + seen.reduce((a, b) => a + b, 0);
    if (key === this.key && !fresh) return;
    this.key = key;
    if (this.world) { this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const world = this.world = new THREE.Group(); this.scene.add(world);
    const L = level, S = L.size, NW = L.w, NH = L.h, data = L.data;
    const cellAt = (x, z) => (x < 0 || z < 0 || x >= NW || z >= NH) ? null : L.cell(x, z);
    const saw = (x, z) => x >= 0 && z >= 0 && x < NW && z < NH && !!seen[z * NW + x];
    const sandy = c => !!data.terrain && !c.solid && c.floor === 0 && c.floorTex === 'sand' && c.cap == null && !c.slope;
    // the heights the colours run between: the highest and lowest ground of the whole level (so a level always looks the same)
    let top = -Infinity, bot = Infinity;
    for (let z = 0; z < NH; z++) for (let x = 0; x < NW; x++) { const c = L.cell(x, z); if (c.solid || c.spikes === 'deep') continue; top = Math.max(top, c.floor); bot = Math.min(bot, c.floor); }
    if (top - bot < 4) top = bot + 4;
    const colAt = y => {
      const t = THREE.MathUtils.clamp((top - y) / (top - bot), 0, 1);
      for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) return RAMP[i - 1][1].clone().lerp(RAMP[i][1], (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
      return RAMP[RAMP.length - 1][1].clone();
    };

    const P = [], N = [], C = [], _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
    const quad = (a, b, c, d, want, col) => {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_a, _b);
      for (const v of (_n.dot(want) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c])) { P.push(v[0], v[1], v[2]); N.push(want.x, want.y, want.z); C.push(col.r, col.g, col.b); }
    };
    const box = (x0, x1, y0, y1, z0, z1, col) => {
      const side = col.clone().multiplyScalar(0.72), under = col.clone().multiplyScalar(0.45);
      quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], UP, col);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], DN, under);
      quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], PX, side);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], NX, side);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], PZ, side);
      quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], NZ, side);
    };
    const wp = [], sp = [], si = [], wall = [], rim = [];
    const T = data.terrain, tu = T ? (T.unit || 0.1) : 0, dune = (x, z) => T ? ((T.rows[z] || [])[x] || 0) * tu : 0;
    let seenAny = false;
    const bb = new THREE.Box3();
    for (let z = 0; z < NH; z++) for (let x = 0; x < NW; x++) {
      if (!seen[z * NW + x]) continue;
      const c = L.cell(x, z); if (c.solid || c.spikes === 'deep') continue;
      seenAny = true;
      const X0 = x * S, Z0 = z * S;
      bb.expandByPoint(_a.set(X0, c.floor, Z0)); bb.expandByPoint(_a.set(X0 + S, c.floor + (c.rise || 0), Z0 + S));
      if (sandy(c)) {                                   // sand: a piece of the dunes' skin
        const i = sp.length / 3;
        sp.push(X0, dune(x, z), Z0, X0 + S, dune(x + 1, z), Z0, X0, dune(x, z + 1), Z0 + S, X0 + S, dune(x + 1, z + 1), Z0 + S);
        si.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      } else {
        const thick = c.deck ? 0.35 : c.spikes ? 0.4 : 0.9, shade = ((x + z) & 1) ? 0.94 : 1;
        const colFor = y => { const col = c.spikes ? SPIKE.clone() : c.secret ? SECRET.clone() : colAt(y); if (c.water !== undefined) col.lerp(WATER, 0.35); return col.multiplyScalar(shade); };
        if (c.slope) {
          const n = c.steps || 4, low = c.floor - thick;
          for (let i = 1; i <= n; i++) {
            const y = c.floor + c.rise * (c.steps ? i / n : (i - 0.5) / n), t0 = (i - 1) / n, t1 = i / n;
            let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
            if (c.slope === 'N') { v0 = 1 - t1; v1 = 1 - t0; } else if (c.slope === 'S') { v0 = t0; v1 = t1; } else if (c.slope === 'E') { u0 = t0; u1 = t1; } else { u0 = 1 - t1; u1 = 1 - t0; }
            box(X0 + u0 * S, X0 + u1 * S, low, y, Z0 + v0 * S, Z0 + v1 * S, colFor(y));
          }
        } else box(X0, X0 + S, c.floor - thick, c.floor, Z0, Z0 + S, colFor(c.floor));
        if (c.water !== undefined) wp.push(X0, c.water, Z0, X0, c.water, Z0 + S, X0 + S, c.water, Z0 + S, X0, c.water, Z0, X0 + S, c.water, Z0 + S, X0 + S, c.water, Z0);
      }
      // the wall between this cell and a neighbour whose top is far below or far above it (either of them seen is enough)
      const topOf = q => q.cap ?? q.floor;
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const n = cellAt(x + dx, z + dz); if (!n || n.solid) continue;
        if (saw(x + dx, z + dz) && (dx < 0 || dz < 0)) continue;            // (a pair of seen cells: drawn once, from the west or north one)
        const ya = topOf(c), yb = topOf(n); if (Math.abs(ya - yb) < 2.5) continue;
        const y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
        const ax = (x + (dx > 0 ? 1 : 0)) * S, az = (z + (dz > 0 ? 1 : 0)) * S, bx = dx ? ax : ax + S, bz = dz ? az : az + S;
        wall.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
        rim.push(ax, y1, az, bx, y1, bz);
      }
    }
    const mesh = (pos, mat, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (idx) g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); world.add(m); return m; };
    if (P.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      world.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
    }
    if (sp.length) mesh(sp, new THREE.MeshLambertMaterial({ color: SAND, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), si);
    if (wp.length) mesh(wp, new THREE.MeshBasicMaterial({ color: 0x3f86d8, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    if (wall.length) {
      mesh(wall, new THREE.MeshBasicMaterial({ color: 0x8a6a40, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
      world.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a4630, transparent: true, opacity: 0.45 })));
    }
    // rays and floating stones you have been on or beside: one whose line passes over (or within a cell of) a cell you have seen
    const near = (px, pz) => { const cx = Math.floor(px / S), cz = Math.floor(pz / S); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (saw(cx + dx, cz + dz)) return true; return false; };
    const rayMat = new THREE.MeshLambertMaterial({ color: 0xc9a44e, side: THREE.DoubleSide });
    for (const b of data.beams || []) {
      const a = (b.dir || 0) * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a), px = -dz, pz = dx;
      const x0 = b.at[0] * S, z0 = b.at[1] * S, x1 = x0 + dx * b.len, z1 = z0 + dz * b.len, y0 = b.y, y1 = b.y2 ?? b.y, w = (b.w ?? 1.4) / 2, w2 = (b.w2 ?? b.w ?? 1.4) / 2, th = b.thick ?? 0.7;
      let known = false;
      for (let t = 0; t <= 1 && !known; t += Math.min(1, S / Math.max(b.len, 0.1))) known = near(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (!known) continue;
      const A = [x0 - px * w, y0, z0 - pz * w], B = [x0 + px * w, y0, z0 + pz * w], Cc = [x1 + px * w2, y1, z1 + pz * w2], D = [x1 - px * w2, y1, z1 - pz * w2];
      const lo = v => [v[0], v[1] - th, v[2]], q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
      mesh([...q(A, B, Cc, D), ...q(lo(A), lo(B), lo(Cc), lo(D)), ...q(A, B, lo(B), lo(A)), ...q(B, Cc, lo(Cc), lo(B)), ...q(Cc, D, lo(D), lo(Cc)), ...q(D, A, lo(A), lo(D))], rayMat);
    }
    const O = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, ladMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    for (const l of data.ladders || []) {
      if (!saw(l.cell[0], l.cell[1])) continue;
      const c = L.cell(l.cell[0], l.cell[1]), o = O[l.wall] || [0, 0], h = l.to - c.floor;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35), ladMat);
      m.position.set((l.cell[0] + 0.5 + o[0] * 0.44) * S, c.floor + h / 2, (l.cell[1] + 0.5 + o[1] * 0.44) * S); world.add(m);
    }
    // where you stand: a red ring on the ground and a red pointer showing the way you face
    if (me) {
      const red = new THREE.MeshBasicMaterial({ color: 0xb02a1c, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 28), red);
      ring.rotation.x = -Math.PI / 2; ring.position.set(me.x * S, me.y + 0.12, me.z * S); world.add(ring);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.9, 14), red);
      cone.rotation.set(-Math.PI / 2, 0, 0); const hold = new THREE.Group(); hold.add(cone);
      hold.rotation.y = me.yaw; hold.position.set(me.x * S, me.y + 1.6, me.z * S); world.add(hold);
      if (fresh) { this.ctl.target.set(me.x * S, me.y, me.z * S); this.ctl.th = me.yaw; this.ctl.ph = 0.95; this.ctl.r = 70; }
    } else if (fresh) {
      if (seenAny) { bb.getCenter(this.ctl.target); this.ctl.r = THREE.MathUtils.clamp(bb.getSize(_a).length() * 1.1, 40, 900); }
      else { this.ctl.target.set(NW * S / 2, 0, NH * S / 2); this.ctl.r = 120; }
      this.ctl.ph = 0.9;
    }
    this.empty = !seenAny;
  }

  // the controller (and W A S D): the left stick turns and tilts, A zooms in a step and X zooms out a step
  control(inp, dt) {
    if (inp.mx || inp.mz) this.turn(-inp.mx * dt * 1.8, inp.mz * dt * 1.2);
    if (inp.pressed.has('jump')) this.zoom(0.75);
    if (inp.pressed.has('use')) this.zoom(1.33);
  }

  render() {
    const cv = this.cv, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
      this.renderer.setClearColor(0xe7ddbd, 1);                  // the notebook's paper
    }
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.w !== W || this.h !== H || this.dpr !== dpr) {
      this.w = W; this.h = H; this.dpr = dpr;
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(W, H, false);
      this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    }
    const c = this.ctl, s = Math.sin(c.ph);
    this.camera.position.set(c.target.x + c.r * s * Math.sin(c.th), c.target.y + c.r * Math.cos(c.ph), c.target.z + c.r * s * Math.cos(c.th));
    this.camera.lookAt(c.target);
    this.renderer.render(this.scene, this.camera);
  }
}
