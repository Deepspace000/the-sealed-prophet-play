// First-person body: walking, running, slopes, steps, jumping, wading and swimming.
const R = 0.3;        // body radius
const H = 1.7;        // body height
const EYE = 1.55;     // eye height above the feet
const STEP = 0.55;    // tallest step walked up without jumping
const G = 22;         // gravity
const JUMP = 6.6;
const WALK = 3.2, RUN = 5.6, SWIM = 2.4;
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
      const f = L.floorAt(sx, sz);
      if (f > y + stepUp) return false;
      if (L.ceilAt(sx, sz) - Math.max(f, y) < H - 1e-4) return false;       // (a small margin: pressed against a low ceiling you are exactly H under it)
    }
    return true;
  }
  ground(x, z, y, stepUp) {
    let g = -Infinity;
    for (const [sx, sz] of this.samples(x, z)) {
      const f = this.level.floorAt(sx, sz);
      if (f <= y + stepUp && f > g) g = f;
    }
    return g;
  }
  ceiling(x, z) {
    let c = Infinity;
    for (const [sx, sz] of this.samples(x, z)) c = Math.min(c, this.level.ceilAt(sx, sz));
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

    const speed = (this.swimming ? SWIM : (inp.run ? RUN : WALK) * (wading ? 0.6 : 1)) * (inp.slow ?? 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const flat = this.swimming ? Math.cos(this.pitch) : 1;
    const tx = (-sin * inp.mz * flat + cos * inp.mx) * speed;
    const tz = (-cos * inp.mz * flat - sin * inp.mx) * speed;
    const acc = (this.swimming ? 5 : this.onGround ? 9 : 3) * dt;
    const ax = tx - this.vx, az = tz - this.vz, al = Math.hypot(ax, az);
    if (this.dashT > 0) {                              // a dodge: a short burst that steering cannot change
      this.dashT -= dt; this.vx = this.dvx; this.vz = this.dvz;
      if (this.dashT <= 0) { this.vx *= 0.3; this.vz *= 0.3; }
    } else if (al <= acc || !(al > 0)) { this.vx = tx; this.vz = tz; }
    else { this.vx += ax / al * acc; this.vz += az / al * acc; }
    const dx = this.vx * dt, dz = this.vz * dt;

    const stepUp = this.swimming ? Math.max(STEP, water + 0.6 - p.y) : (this.onGround ? STEP : 0.25);
    if (dx) { if (this.fits(p.x + dx, p.z, p.y, stepUp)) p.x += dx; else this.vx = 0; }
    if (dz) { if (this.fits(p.x, p.z + dz, p.y, stepUp)) p.z += dz; else this.vz = 0; }

    const g = this.ground(p.x, p.z, p.y, stepUp);
    const ceil = this.ceiling(p.x, p.z);

    if (this.swimming) {
      let vy = Math.sin(this.pitch) * inp.mz * SWIM + (inp.jumpHeld ? 2.2 : 0);
      if (!inp.mz && !inp.jumpHeld) vy = p.y < water - FLOAT - 0.02 ? 0.5 : 0;   // drift up slowly
      this.vy = 0;
      p.y = Math.min(p.y + vy * dt, water - FLOAT);
      if (p.y < g) p.y = g;
      if (p.y + H > ceil) p.y = ceil - H;
      this.onGround = false;
    } else {
      const wasOnGround = this.onGround;
      if (wasOnGround && inp.pressed.has('jump')) { this.vy = JUMP; this.onGround = false; }
      this.vy -= G * dt;
      p.y += this.vy * dt;
      if (p.y <= g) {
        p.y = g; this.vy = 0; this.onGround = true;
      } else if (wasOnGround && this.onGround && p.y - g < STEP) {
        p.y = g; this.vy = 0;            // stay on the ground going down slopes and stairs
      } else {
        this.onGround = false;
      }
      if (p.y + H > ceil) { p.y = ceil - H; if (this.vy > 0) this.vy = 0; }
    }

    const target = p.y + EYE;
    if (this.onGround || this.swimming) this.eyeY += (target - this.eyeY) * Math.min(1, dt * 14);
    else this.eyeY = target;
    this.underwater = water != null && this.eyeY < water;
  }
}
