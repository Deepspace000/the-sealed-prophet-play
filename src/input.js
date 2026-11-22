// Gathers keyboard and mouse, game controller and touch into one set of controls per frame.
const KEY_ACTION = {
  Space: 'jump', KeyF: 'lamp', KeyH: 'help', Minus: 'resDown', Equal: 'resUp',
  KeyE: 'use', Tab: 'bag', KeyI: 'bag', KeyG: 'drop', KeyL: 'nextLevel', KeyV: 'dodge', Escape: 'menu', KeyB: 'sleep', KeyM: 'map', KeyT: 'target',
};
// Fighting: R (hold, let go) or the left mouse button strikes; C (hold) blocks; V, or A, D or S tapped twice, dodges.
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
    this.mouseY = 0.5;            // how far down the screen the pointer is, 0..1: it chooses the kind of blow
    this.leftAlone = false;       // the left button went down without the right one
    this.rightMoved = 0;          // how far the mouse has moved since the right button went down: a still hold is a blow, a drag is a look
    this.rightCancel = false;

    const typing = e => e.target && e.target.tagName === 'INPUT';      // writing a note on the map: the keys are letters
    addEventListener('keydown', e => {
      if (typing(e)) return;
      if (!e.repeat) {
        this.keys.add(e.code);
        if (KEY_ACTION[e.code]) this.pressed.add(KEY_ACTION[e.code]);
        if (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS') {      // tapped twice quickly: dodge that way
          const now = performance.now();
          if (now - (this.tapped[e.code] || 0) < 260) { this.pressed.add('dodge'); this.dodgeKey = e.code; }
          this.tapped[e.code] = now;
        }
        this.device = 'keys';
      }
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Mouse. Hold the right button and move the mouse to look around.
    // While the right button is down, hold the left button as well to walk forward.
    // On its own, each button works a hand (see read below): right button, right hand; left button, left hand.
    // The wheel tilts the view. Z switches free mouse-look on and off (not in every embedded view).
    this.mouse = { right: false, left: false, zLook: false };
    const lock = () => Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    const locked = () => document.pointerLockElement === canvas;
    addEventListener('keydown', e => {
      if (e.code !== 'KeyZ' || e.repeat || typing(e)) return;
      this.mouse.zLook = !this.mouse.zLook;
      if (this.mouse.zLook) lock(); else if (locked()) document.exitPointerLock();
    });
    document.addEventListener('pointerlockchange', () => { if (!locked()) this.mouse.zLook = false; });
    canvas.addEventListener('mousedown', e => {
      if (this.device === 'touch') return;
      this.device = 'keys';
      if (e.button === 2) { this.mouse.right = true; this.rightMoved = 0; lock(); }     // lock lets you keep turning past the screen edge
      if (e.button === 0) {
        this.mouse.left = true;
        if (!this.mouse.right) { this.clicks.push([e.clientX, e.clientY]); this.leftAlone = true; }
      }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.left = false; this.leftAlone = false; }
      if (e.button === 2) {
        this.mouse.right = false;
        if (locked() && !this.mouse.zLook) document.exitPointerLock();
      }
    });
    addEventListener('blur', () => { this.mouse.right = this.mouse.left = this.leftAlone = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.look[1] += e.deltaY * 0.0012; e.preventDefault(); }, { passive: false });
    addEventListener('mousemove', e => {
      this.mouseY = e.clientY / innerHeight;
      if (this.mouse.right) {
        const before = this.rightMoved;
        this.rightMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (before < 14 && this.rightMoved >= 14) this.rightCancel = true;       // it has turned into a look
      }
      if (!this.mouse.right && !this.mouse.zLook) return;
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
    // The mouse buttons work the hands: the right button the right hand, the left button the left hand.
    // Holding the right button and moving the mouse looks about instead, and drops any blow being wound up.
    // Both buttons together (right first, then left) walk you forward, and neither hand acts.
    const both = this.mouse.right && this.mouse.left;
    if (both) mz += 1;
    const handR = this.mouse.right && !both && this.rightMoved < 14, handL = this.leftAlone && !this.mouse.right && !this.mouse.zLook;
    const cancelR = this.rightCancel || both;
    this.rightCancel = false;
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
    // The kind of blow. Mouse: where the pointer is, high, middle or low on the screen.
    // Keys, controller, touch: pushing forward makes it a thrust, pulling back an overhead blow.
    const aim = mouseAttack ? (this.mouseY < 0.36 ? 'high' : this.mouseY > 0.66 ? 'low' : 'mid')
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
