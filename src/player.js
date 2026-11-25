// First-person body: walking, running, slopes, steps, jumping, wading and swimming.
const R = 0.3;        // body radius
const H = 1.7;        // body height
const EYE = 1.55;     // eye height above the feet
const STEP = 0.55;    // tallest step walked up without jumping
const G = 22;         // gravity
const JUMP = 6.6;
const WALK = 3.2, RUN = 5.6, SWIM = 2.4;
const LEAP = 1.15;    // a running jump goes this much faster than running
const COYOTE = 0.1;   // seconds after stepping off an edge in which a jump still works
const FLOAT = 1.3;    // when swimming, feet stay at least this far under the surface

export class Player {
  constructor(level) {
    this.level = level;
    const st = level.data.start || { cell: [1, 1], face: 'N' };
    const c = level.cellCentre(st.cell[0], st.cell[1]);
    this.pos = { x: c.x, y: level.floorAt(c.x, c.z), z: c.z };
    this.yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[st.face] ?? 0;
    this.pitch = 0;
    this.vy = 0;
    this.vx = 0; this.vz = 0;      // sideways speed builds up and runs down, so stopping takes a moment
    this.onGround = true;
    this.swimming = false;
    this.underwater = false;
    this.eyeY = this.pos.y + EYE;
  }

  samples(x, z) {
    return [[x, z], [x - R, z - R], [x + R, z - R], [x - R, z + R], [x + R, z + R]];
  }
  // Can the body stand at x,z with its feet at y, stepping up at most stepUp?
  fits(x, z, y, stepUp) {
    const L = this.level;
    for (const [sx, sz] of this.samples(x, z)) {
      const f = L.floorAt(sx, sz, y);
      if (f > y + stepUp) return false;
      if (L.ceilAt(sx, sz, y) - Math.max(f, y) < H - 1e-4) return false;       // (a small margin: pressed against a low ceiling you are exactly H under it)
    }
    return true;
  }
  ground(x, z, y, stepUp) {
    let g = -Infinity;
    for (const [sx, sz] of this.samples(x, z)) {
      const f = this.level.floorAt(sx, sz, y);
      if (f <= y + stepUp && f > g) g = f;
      const e = this.extraFloor ? this.extraFloor(sx, sz, y + stepUp) : -Infinity;      // a lift or a beam holds you up too (the highest one you can reach)
      if (e <= y + stepUp && e > g) g = e;
    }
    return g;
  }
  ceiling(x, z) {
    let c = Infinity;
    for (const [sx, sz] of this.samples(x, z)) c = Math.min(c, this.level.ceilAt(sx, sz, this.pos.y));
    return c;
  }

  // A quick step in a direction given in the world (x, z).
  dash(wx, wz, speed = 8.5, time = 0.22) { this.dashT = time; this.dvx = wx * speed; this.dvz = wz * speed; }

  update(dt, inp) {
    const L = this.level, p = this.pos;
    if (!(dt >= 0)) dt = 0;
    this.yaw -= inp.lookX;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - inp.lookY));

    const water = L.waterAt(p.x, p.z);
    const depth = water == null ? 0 : water - L.floorAt(p.x, p.z);
    this.swimming = water != null && depth > FLOAT && p.y + 1.2 < water;
    const wading = water != null && !this.swimming && p.y < water - 0.3;

    // A jump made at a run (Shift) is a leap: it carries a little further than running does, so a wide gap can be cleared.
    const speed = (this.swimming ? SWIM : (inp.run ? RUN * (this.leap && !this.onGround ? LEAP : 1) : WALK) * (wading ? 0.6 : 1)) * (inp.slow ?? 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const flat = this.swimming ? Math.cos(this.pitch) : 1;
    const tx = (-sin * inp.mz * flat + cos * inp.mx) * speed;
    const tz = (-cos * inp.mz * flat - sin * inp.mx) * speed;
    const acc = (this.swimming ? 5 : this.sliding > 0 ? 1.2 : this.onGround ? 9 : 3) * dt;
    const ax = tx - this.vx, az = tz - this.vz, al = Math.hypot(ax, az);
    if (this.dashT > 0) {                              // a dodge: a short burst that steering cannot change
      this.dashT -= dt; this.vx = this.dvx; this.vz = this.dvz;
      if (this.dashT <= 0) { this.vx *= 0.3; this.vz *= 0.3; }
    } else if (this.sliding > 0) { this.vx += ax / (al || 1) * acc; this.vz += az / (al || 1) * acc; }
    else if (al <= acc || !(al > 0)) { this.vx = tx; this.vz = tz; }
    else { this.vx += ax / al * acc; this.vz += az / al * acc; }
    const dx = this.vx * dt, dz = this.vz * dt;

    const step = L.data.step ?? STEP;            // a level may let you walk up taller steps ("step")
    const stepUp = this.swimming ? Math.max(step, water + 0.6 - p.y) : (this.onGround ? step : 0.25);
    if (dx) { if (this.fits(p.x + dx, p.z, p.y, stepUp)) p.x += dx; else this.vx = 0; }
    if (dz) { if (this.fits(p.x, p.z + dz, p.y, stepUp)) p.z += dz; else this.vz = 0; }

    const g = this.ground(p.x, p.z, p.y, stepUp);
    const ceil = this.ceiling(p.x, p.z);
    // A ladder (see main.js): facing it and pushing forward you climb, back you go down; no falling while you hold on.
    const lad = this.ladderAt ? this.ladderAt(p.x, p.z, p.y, this.yaw) : null;
    this.climbing = !!lad && !this.swimming;
    if (this.climbing) {
      const up = inp.mz > 0 ? 1 : inp.mz < 0 ? -1 : 0;
      p.y = Math.max(g, Math.min(lad.to + 0.05, p.y + up * 2.6 * dt));
      if (inp.pressed.has('jump')) { this.climbing = false; this.vy = 3; }       // let go
      else {
        this.vy = 0; this.onGround = p.y <= g + 0.01; this.jumping = false; this.fallFrom = p.y;
        this.eyeY = p.y + EYE; this.underwater = false;
        return;
      }
    }
    // A slide (a cell with "slide": true): too steep and smooth to stand on, it carries you down its slope.
    const sc = L.cellAt(p.x, p.z);
    if (sc.slide && sc.slope && this.onGround && !this.swimming) {
      const dir = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }[sc.slope];          // downhill
      this.vx += dir[0] * 16 * dt; this.vz += dir[1] * 16 * dt;
      this.sliding = 0.25;
    } else if (this.sliding > 0) this.sliding -= dt;

    if (this.swimming) {
      let vy = Math.sin(this.pitch) * inp.mz * SWIM + (inp.jumpHeld ? 2.2 : 0);
      if (!inp.mz && !inp.jumpHeld) vy = p.y < water - FLOAT - 0.02 ? 0.5 : 0;   // drift up slowly
      this.vy = 0;
      p.y = Math.min(p.y + vy * dt, water - FLOAT);
      if (p.y < g) p.y = g;
      if (p.y + H > ceil) p.y = ceil - H;
      this.onGround = false; this.fallFrom = p.y;          // swimming: no fall is counted from before you went in
    } else {
      const wasOnGround = this.onGround;
      this.offFor = wasOnGround ? 0 : (this.offFor || 0) + dt;
      // A jump still works for a moment after walking off an edge (COYOTE), as long as you were not already jumping or falling far.
      const canJump = wasOnGround || (this.offFor < COYOTE && this.vy <= 0 && !this.jumping);
      if (canJump && inp.pressed.has('jump')) {
        this.vy = JUMP; this.onGround = false; this.jumping = true;
        this.leap = !!inp.run && Math.hypot(this.vx, this.vz) > WALK + 0.5;
        if (this.leap) { this.vx *= LEAP; this.vz *= LEAP; }
      }
      this.vy -= G * dt;
      p.y += this.vy * dt;
      if (p.y <= g) {
        if (!wasOnGround) { this.landed = (this.fallFrom ?? p.y) - g; }      // how far you fell (main.js turns a long fall into harm)
        p.y = g; this.vy = 0; this.onGround = true; this.jumping = false;
        if (this.leap) {                                 // landing from a leap: back to running speed, so you do not skid off a small platform
          const v = Math.hypot(this.vx, this.vz);
          if (v > RUN) { this.vx *= RUN / v; this.vz *= RUN / v; }
          this.leap = false;
        }
      } else if (wasOnGround && this.onGround && p.y - g < STEP) {
        p.y = g; this.vy = 0;            // stay on the ground going down slopes and stairs
      } else {
        this.onGround = false;
      }
      if (this.onGround || this.vy > 0) this.fallFrom = p.y;        // a fall is measured from the top of it
      if (p.y + H > ceil) { p.y = ceil - H; if (this.vy > 0) this.vy = 0; }
    }

    const target = p.y + EYE;
    if (!Number.isFinite(this.eyeY)) this.eyeY = target;      // never let the view get lost
    if (this.onGround || this.swimming) this.eyeY += (target - this.eyeY) * Math.min(1, dt * 14);
    else this.eyeY = target;
    this.underwater = water != null && this.eyeY < water;
  }
}
