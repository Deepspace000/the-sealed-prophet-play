// Gathers keyboard and mouse, game controller and touch into one set of controls per frame.
const KEY_ACTION = {
  Space: 'jump', F5: 'quicksave', KeyL: 'lamp', KeyH: 'help', Minus: 'resDown', Equal: 'resUp',
  KeyF: 'use', Tab: 'mode', KeyI: 'bag', KeyG: 'drop', KeyN: 'nextLevel', KeyV: 'dodge', Escape: 'menu', KeyB: 'sleep', KeyM: 'map', KeyT: 'target',
};
// Fighting: R (hold, let go) or a mouse button strikes; C (hold) blocks; V, or A, D or S tapped twice, dodges.
// Controller: right trigger strikes, left trigger blocks, B dodges.
// A, right bumper, X, Y, B, then the D-pad (up and left go back a place, down and right go on)
const PAD_ACTION = { 0: 'jump', 5: 'lamp', 2: 'use', 3: 'bag', 1: 'back', 9: 'menu', 8: 'map', 11: 'target', 12: 'left', 14: 'left', 13: 'right', 15: 'right' };
const clamp1 = v => Math.max(-1, Math.min(1, v));
const dead = v => (Math.abs(v) < 0.18 ? 0 : v);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // actions that happened since the last frame
    this.clicks = [];             // places on the screen that were clicked or tapped, for picking things up
    this.look = [0, 0];
    this.touchMove = [0, 0];
    this.touchHeld = new Set();
    this.padPrev = [];
    this.device = 'keys';         // 'keys', 'pad' or 'touch': the one used last
    this.tapped = {}; this.dodgeKey = null;
    this.charging = false;        // set by the game each frame: a blow is being wound up, so moving the mouse no longer drops it

    const typing = e => e.target && e.target.tagName === 'INPUT';      // writing a note on the map: the keys are letters
    addEventListener('keydown', e => {
      if (typing(e)) return;
      if (!e.repeat) {
        this.keys.add(e.code);
        if (e.code === 'Escape') {                       // with the pointer held, Esc only gives it back; pressed again (or SETTINGS clicked) it opens the menu
          const now = performance.now();
          if (this.locked() || now - this.lockLostAt < 400) return;
          this.escAt = now;
        }
        if (KEY_ACTION[e.code]) this.pressed.add(KEY_ACTION[e.code]);
        if (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS') {      // tapped twice quickly: dodge that way
          const now = performance.now();
          if (now - (this.tapped[e.code] || 0) < 260) { this.pressed.add('dodge'); this.dodgeKey = e.code; }
          this.tapped[e.code] = now;
        }
        this.device = 'keys';
      }
      if (e.code === 'Space' || e.code === 'Tab' || e.code === 'F5' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Mouse. Moving the mouse turns your head: the first click on the picture takes the pointer (it is hidden and
    // held, so you can keep turning), and from then on the buttons are your hands: right button, right hand; left button,
    // left hand; both together walk you forward. The pointer is given back while your pack, the map, the menu or a text
    // is open (uiOpen, set by the game). Esc frees it too, with no menu: a click on the picture takes it again, and Esc again (or SETTINGS) opens the menu. The wheel chooses the kind of blow.
    // Where the pointer cannot be held (some embedded views), holding the right button and moving looks instead.
    this.mouse = { right: false, left: false };
    this.uiOpen = () => false;     // set by the game: something that needs the pointer is open
    this.holdHere = () => false;   // set by the game: is there a corpse to skin under this point of the screen
    this.pointer = [innerWidth / 2, innerHeight / 2];      // where the cursor is, when it is free
    addEventListener('mousemove', e => { if (!this.locked()) this.pointer = [e.clientX, e.clientY]; });
    this.stance = 1;               // the kind of blow the mouse strikes with: 0 thrust, 1 slash, 2 overhead (the wheel changes it)
    this.swallow = false;          // the click that took the pointer is not a blow
    this.noLock = false;           // the pointer could not be held here
    this.lastWant = false; this.selfExit = false; this.escAt = 0; this.lockLostAt = 0; this.engaged = false;
    this.locked = () => document.pointerLockElement === canvas;
    const lock = () => { try { Promise.resolve(canvas.requestPointerLock?.()).catch(() => {}); } catch (e) { /* not allowed here */ } };
    document.addEventListener('pointerlockchange', () => {
      if (this.locked()) { this.engaged = true; this.noLock = false; return; }
      this.mouse.right = this.mouse.left = false;
      if (this.selfExit) { this.selfExit = false; return; }
      if (this.uiOpen()) return;                        // something else freed it (a text scene)
      this.lockLostAt = performance.now();              // Esc freed the pointer: you have the cursor now, and the game goes on. No menu.
    });
    canvas.addEventListener('mousedown', e => {
      if (this.device === 'touch') return;
      this.device = 'keys';
      if (!this.locked()) {
        if (this.uiOpen()) { if (e.button === 0) this.clicks.push([e.clientX, e.clientY]); return; }      // with the pack open, a click on the room drops or picks up
        const work = this.holdHere(e.clientX, e.clientY);       // on a corpse: the button is held to skin it, and the cursor stays
        if (!this.noLock && !work) {                      // this click only takes the pointer
          lock(); this.swallow = true;
          setTimeout(() => { if (!this.locked()) this.noLock = true; }, 500);
          return;
        }
        if (e.button === 0 && !work) this.clicks.push([e.clientX, e.clientY]);
      } else if (e.button === 0 && !this.mouse.right) this.clicks.push([innerWidth / 2, innerHeight / 2]);      // a click picks up what you are looking at
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 0) this.mouse.left = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (!this.mouse.left && !this.mouse.right) this.swallow = false;
    });
    addEventListener('blur', () => { this.mouse.right = this.mouse.left = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      const n = Math.max(0, Math.min(2, this.stance + (e.deltaY < 0 ? 1 : -1)));
      if (n !== this.stance) { this.stance = n; this.pressed.add('stance'); }
      e.preventDefault();
    }, { passive: false });
    addEventListener('mousemove', e => {
      if (!this.locked() && !(this.noLock && this.mouse.right)) return;
      this.look[0] += e.movementX * 0.0032;
      this.look[1] += e.movementY * 0.0032;
    });
    this.initTouch();
  }

  initTouch() {
    const base = document.getElementById('stick'), knob = document.getElementById('knob');
    let moveId = null, lookId = null, origin = [0, 0], last = [0, 0];
    const taps = {};              // a short touch that does not move is a tap
    const end = e => {
      const t = taps[e.pointerId];
      if (t && e.type === 'pointerup' && performance.now() - t[2] < 300
          && Math.hypot(e.clientX - t[0], e.clientY - t[1]) < 12) this.clicks.push([e.clientX, e.clientY]);
      delete taps[e.pointerId];
      if (e.pointerId === moveId) { moveId = null; this.touchMove = [0, 0]; base.style.display = 'none'; }
      if (e.pointerId === lookId) lookId = null;
    };
    this.canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      if (this.device !== 'touch') { this.device = 'touch'; document.body.classList.add('touch'); }
      taps[e.pointerId] = [e.clientX, e.clientY, performance.now()];
      if (e.clientX < innerWidth / 2 && moveId === null) {
        moveId = e.pointerId; origin = [e.clientX, e.clientY];
        base.style.display = 'block';
        base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
        knob.style.transform = 'translate(-50%,-50%)';
      } else if (lookId === null) {
        lookId = e.pointerId; last = [e.clientX, e.clientY];
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerId === moveId) {
        const x = clamp1((e.clientX - origin[0]) / 55), y = clamp1((e.clientY - origin[1]) / 55);
        this.touchMove = [x, y];
        knob.style.transform = `translate(calc(-50% + ${x * 40}px), calc(-50% + ${y * 40}px))`;
      } else if (e.pointerId === lookId) {
        this.look[0] += (e.clientX - last[0]) * 0.006;
        this.look[1] += (e.clientY - last[1]) * 0.006;
        last = [e.clientX, e.clientY];
      }
    });
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll('#touch [data-act]')) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (this.device !== 'touch') { this.device = 'touch'; document.body.classList.add('touch'); }
        this.pressed.add(act); this.touchHeld.add(act);
      });
      const up = () => this.touchHeld.delete(act);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }
  }

  relock() { try { Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {}); } catch (e) { /* needs a click */ } }

  // Returns this frame's controls and clears the one-shot ones.
  read(dt) {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD')) mx += 1;
    if (k.has('KeyA')) mx -= 1;
    if (k.has('KeyQ') || k.has('ArrowLeft')) this.look[0] -= 2.2 * dt;
    if (k.has('KeyE') || k.has('ArrowRight')) this.look[0] += 2.2 * dt;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    let jumpHeld = k.has('Space') || this.touchHeld.has('jump');


    mx += this.touchMove[0]; mz -= this.touchMove[1];
    if (Math.hypot(this.touchMove[0], this.touchMove[1]) > 0.97) run = true;

    let attackHeld = k.has('KeyR') || this.touchHeld.has('attack');
    let blockHeld = k.has('KeyC') || this.touchHeld.has('block');
    // The pointer is held for looking unless something that needs it is open.
    const want = this.uiOpen();
    if (want !== this.lastWant) {
      this.lastWant = want;
      if (want && this.locked()) { this.selfExit = true; document.exitPointerLock(); }
      else if (!want && this.engaged && !this.locked()) this.relock();
    }
    // The mouse buttons work the hands: the right button the right hand, the left button the left hand.
    // Both buttons together walk you forward, and neither hand acts (a blow being wound up is dropped).
    const both = this.mouse.right && this.mouse.left && !this.swallow;
    if (both) mz += 1;
    const handR = this.mouse.right && !both && !this.swallow, handL = this.mouse.left && !both && !this.swallow;
    const cancelR = both;
    const mouseAttack = handR || handL;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const ax = pad.axes.map(dead), b = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      if (ax.some(v => v) || pad.buttons.some(x => x.pressed)) this.device = 'pad';
      mx += ax[0] || 0; mz -= ax[1] || 0;
      this.look[0] += (ax[2] || 0) * 2.8 * dt;
      this.look[1] += (ax[3] || 0) * 2.0 * dt;
      if (b(0)) jumpHeld = true;
      if (b(10) || b(4)) run = true;                  // left stick click or left bumper
      if (b(7)) attackHeld = true;                    // right trigger
      if (b(6)) blockHeld = true;                     // left trigger
      for (const i in PAD_ACTION) {
        if (b(i) && !this.padPrev[i]) this.pressed.add(PAD_ACTION[i]);
        this.padPrev[i] = b(i);
      }
      break;
    }

    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    // The kind of blow. Mouse: the one chosen with the wheel (thrust, slash or overhead).
    // Keys, controller, touch: pushing forward makes it a thrust, pulling back an overhead blow.
    const aim = mouseAttack ? ['low', 'mid', 'high'][this.stance]
      : mz > 0.5 ? 'low' : mz < -0.5 ? 'high' : 'mid';
    // Which way a dodge goes, as [sideways, forward]: the key tapped twice, or the way you are moving, or straight back.
    const dk = this.dodgeKey;
    const dodgeDir = dk === 'KeyA' ? [-1, 0] : dk === 'KeyD' ? [1, 0] : dk === 'KeyS' ? [0, -1] : len > 0.3 ? [mx, mz] : [0, -1];
    this.dodgeKey = null;
    const out = { mx, mz, lookX: this.look[0], lookY: this.look[1], run, jumpHeld, pressed: this.pressed, clicks: this.clicks,
      attackHeld, blockHeld, mouseAttack, handR, handL, cancelR, aim, dodgeDir };
    this.look = [0, 0];
    this.clicks = [];
    this.pressed = new Set();
    return out;
  }
}
