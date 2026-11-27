// The belt bar along the bottom, the pack panel above it, and short messages.
import { iconURL, hasArt, EDGE_MAX } from './items.js';
import { usable, verb } from './survival.js';

const GROUPS = [
  ['hands', 'Left hand &middot; Right hand', 2],
  ['belt', 'Belt', 4],
  ['quiver', 'Quiver', 1],       // (only while a bow is in a hand, or there are arrows in it)
  ['back', 'Back', 1],
  ['head', 'Head', 1],
  ['body', 'Body', 1],
];
const $ = id => document.getElementById(id);
const SHORT = { 'OPEN THE MAP': 'MAP', 'LIGHT YOUR LAMP': 'LIGHT LAMP', 'FILL THE LAMP': 'FILL LAMP' };      // short words for the buttons
const kg = w => (Math.round(w * 10) / 10) + ' kg';
const CURSOR_ICON = '<svg viewBox="0 0 16 16"><path d="M4 1.5v12l3.2-3 2.3 5 2-.9-2.3-5H13z" fill="currentColor"/></svg>';
const CAMERA_ICON = '<svg viewBox="0 0 16 16"><path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.4" fill="currentColor"/></svg>';

export class UI {
  constructor(inv, onDrop, onUse) {
    this.inv = inv;
    this.onDrop = onDrop;
    this.onUse = onUse;        // called with a thing when the player uses it (eats it, lights it and so on)
    this.open = false;        // is the pack panel showing
    this.focus = -1;          // place picked out with a controller
    this.hover = null;
    this.seen = '';
    this.msgT = 0;
    this.bar = $('bar'); this.panel = $('panel'); this.info = $('info');
    this.msgEl = $('msg'); this.lookEl = $('look'); this.heldEl = $('heldIcon');
    this.optsEl = $('opts'); this.opts = null;      // the small list of what you can do with a thing
    this.camera = () => false;     // set by the game: is the mouse turning your head (the pointer held)
    this.onMode = () => {};        // set by the game: the cursor/camera switch was pressed

    const root = $('inv');
    root.addEventListener('pointerdown', e => {
      e.preventDefault();
      const opt = e.target.closest('[data-opt]');
      if (opt) { if (!opt.classList.contains('off')) this.pressOpt(+opt.dataset.opt); return; }
      if (e.target.closest('#opts')) return;
      const opener = e.target.closest('.opener'), slot = e.target.closest('.slot'), btn = e.target.closest('[data-btn]');
      if (opener) {
        this.closeOpts();
        const it = this.itemAt(opener.parentElement);
        if (it === this.inv.back[0]) this.toggle();         // the knapsack on your back opens as the pack, not a second time as a bag
        else { this.inv.toggleOpen(it); this.open = true; }
        return;
      }
      if (slot) return this.slotDown(slot, e);
      this.closeOpts();
      if (btn && btn.dataset.btn === 'drop') this.onDrop();
      else if (btn && btn.dataset.btn === 'use') { if (this.inv.held) this.onUse(this.inv.held); }
      else if (btn && btn.dataset.btn === 'pack') this.toggle();
      else if (btn && btn.dataset.btn === 'mode') this.onMode();
    });
    root.addEventListener('pointerover', e => {            // the pointer on a thing shows what it is, and nothing more
      const slot = e.target.closest('.slot');
      const it = slot ? this.itemAt(slot) : null;
      if (it !== this.hover) { this.hover = it; this.seen = ''; }
    });
    root.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('pointerdown', e => { if (!e.target.closest('#inv')) this.closeOpts(); });
    addEventListener('mousemove', e => {
      this.heldEl.style.left = e.clientX + 'px'; this.heldEl.style.top = e.clientY + 'px';
    });
    // Dragging: press on a thing and pull it away to pick it up; let go on a place to put it there, on the room to drop it.
    addEventListener('pointermove', e => {
      if (this.drag) { this.heldEl.style.left = e.clientX + 'px'; this.heldEl.style.top = e.clientY + 'px'; return; }
      const c = this.cand;
      if (c && c.id === e.pointerId && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 7) this.startDrag();
    });
    addEventListener('pointerup', e => {
      const c = this.cand;
      if (!c || c.id !== e.pointerId) return;
      this.cand = null;
      if (this.drag) return this.endDrag(e);
      const el = this.slots().find(s => s.dataset.area === c.area && +s.dataset.i === c.i);      // it was only a click
      if (el) this.clickSlot(el, { pointerType: c.type, button: c.button });
    });
    addEventListener('resize', () => { this.seen = ''; });
    addEventListener('pointercancel', e => {
      if (this.cand && this.cand.id === e.pointerId) { if (this.drag) this.putBack(); this.cand = null; this.drag = null; }
    });
  }

  // A press on a place. With a thing in it (and nothing in your hand-held cursor) it may turn into a drag, so a click is
  // only acted on when the button comes up; everything else acts at once, as before.
  slotDown(slotEl, e) {
    const it = this.itemAt(slotEl);
    if (it && !this.inv.held && (e.pointerType !== 'mouse' || e.button === 0)) {
      this.cand = { area: slotEl.dataset.area, i: +slotEl.dataset.i, x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, button: e.button };
      return;
    }
    this.clickSlot(slotEl, e);
  }
  startDrag() {
    const c = this.cand;
    this.closeOpts();
    this.drag = { area: c.area, i: c.i };
    this.inv.click(c.area, c.i);                      // the thing comes up on the pointer
    this.heldEl.style.left = c.x + 'px'; this.heldEl.style.top = c.y + 'px';
    this.seen = '';
  }
  endDrag(e) {
    const d = this.drag, inv = this.inv, it = inv.held;
    this.drag = null;
    if (!it) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), slot = el && el.closest && el.closest('#inv .slot');
    if (slot) this.dropOn(slot.dataset.area, +slot.dataset.i, d);
    else if (el && el.id === 'view') this.onDrop();               // let go on the room: it is dropped
    else this.putBack(d);                                          // let go anywhere else: it goes back where it was
  }
  // Put the dragged thing on a place. A weapon, shield or light dropped on an occupied hand goes into the other hand if that
  // one is free, so what you already hold is not pushed out. Otherwise things swap, and what was there goes to where the
  // dragged one came from.
  dropOn(area, i, from) {
    const inv = this.inv, it = inv.held, d = it.def, arr = inv.arr(area);
    if (area === 'hands' && arr[i] && !arr[1 - i] && (d.weapon || d.block || d.light)) {
      arr[1 - i] = it; inv.held = null; inv.version++;
      return;
    }
    if (inv.click(area, i) === 'no') { this.say(this.noFit(it, area)); this.putBack(from); return; }
    if (inv.held) this.putBack(from);                              // it swapped something out: that goes where the dragged one was
  }
  // Return what is on the pointer to the place it was lifted from, or anywhere it fits.
  putBack(from) {
    const inv = this.inv, it = inv.held;
    if (!it) return;
    const arr = from && inv.arr(from.area);
    if (arr && !arr[from.i] && inv.fits(it, from.area)) { arr[from.i] = it; inv.held = null; inv.version++; return; }
    if (inv.add(it)) inv.held = null;
    else this.say('Put it down where it fits.');
  }

  itemAt(slotEl) {
    const arr = this.inv.arr(slotEl.dataset.area);
    return arr ? arr[+slotEl.dataset.i] : null;
  }
  // A click or a tap on a thing picks it out: the row of buttons above the belt then says what you can do with it.
  // The row is always in the same place, with the same four buttons in the same order. With a thing picked out,
  // a click on an empty place moves it there. (A click on the notebook with the mouse goes straight to the map.)
  clickSlot(slotEl, e) {
    const it = this.itemAt(slotEl), area = slotEl.dataset.area, i = +slotEl.dataset.i, inv = this.inv, o = this.opts;
    if (inv.held) {                                   // you are moving something: put it down here
      if (inv.click(area, i) === 'no') this.say(this.noFit(inv.held, area));
      return;
    }
    if (it) {
      if ((it.def.map || it.def.refill) && e && e.pointerType === 'mouse' && e.button !== 2) { this.closeOpts(); return this.onUse(it); }       // one click: open the map, or refill the matches
      if (o && o.it === it) return this.closeOpts();
      return this.showOpts(slotEl, it);
    }
    if (!o) return;
    const from = inv.arr(o.area);
    this.closeOpts();
    if (!from || from[o.i] !== o.it) return;
    inv.click(o.area, o.i);
    if (inv.click(area, i) === 'no') { inv.click(o.area, o.i); this.say(this.noFit(o.it, area)); }
  }
  // Why a thing will not go there, in words.
  noFit(it, area) {
    const name = it.def.name.toLowerCase(), cap = it.def.name[0].toUpperCase() + name.slice(1);
    if (area === 'belt') return `The ${name} is too big for your belt.`;
    if (area === 'quiver') return 'Only arrows go in the quiver.';
    if ((area === 'pack' || area === 'bag') && it.inside) return 'A bag will not go into another bag.';
    if (area === 'back') return `Only a knapsack can be worn on your back.`;
    if (area === 'body') return `Only armour for the body can be worn there.`;
    if (area === 'head') return `Only a helmet can be worn on your head.`;
    if (area === 'pack') return `The ${name} is too big for your pack.`;
    if (area === 'bag') return `The ${name} is too big for that bag.`;
    return `${cap} does not fit there.`;
  }
  showOpts(slotEl, it) {
    const v = SHORT[verb(it)] || verb(it), area = slotEl.dataset.area, d = it.def, back = !!d.wear;      // ("back": anything that is worn)
    const equip = back ? area !== d.wear : (d.weapon || d.block || d.light) && area !== 'hands';
    // [label, what it does, can it be done]: the ones that cannot be done are greyed out, not taken away
    const all = [[v || 'USE', 'use', !!v], [back ? 'WEAR' : 'EQUIP', 'equip', !!equip], ['MOVE', 'move', true], ['DROP', 'drop', true]];
    this.opts = { it, area, i: +slotEl.dataset.i, all, focus: all.findIndex(a => a[2]), at: this.inv.version };
    this.optsEl.innerHTML = all.map(([label, , on], n) => `<button data-opt="${n}"${on ? '' : ' class="off"'}>${label}</button>`).join('');
    this.optsEl.style.display = 'flex';
    this.seen = '';
    this.markOpt();
  }
  markOpt() {
    [...this.optsEl.querySelectorAll('button')].forEach((b, n) => b.classList.toggle('focus', this.pad && n === this.opts.focus));
  }
  closeOpts() { if (this.opts) { this.opts = null; this.optsEl.style.display = 'none'; this.optsEl.classList.remove('pick'); this.optsEl.style.maxWidth = ''; this.seen = ''; } }
  // A choice among things (which weapon to sharpen): the row of buttons above the belt shows them, and one press picks.
  // list: [label, can it be picked, what picking it does]. The ones that cannot be picked are greyed out.
  choose(title, list) {
    this.closeOpts();
    const all = list.map(([label, on, fn]) => [label, fn, on]).concat([['CANCEL', () => {}, true]]);
    this.opts = { pick: true, all, focus: all.findIndex(a => a[2]), at: this.inv.version };
    this.optsEl.innerHTML = all.map(([label, , on], n) => `<button data-opt="${n}"${on ? '' : ' class="off"'}>${label}</button>`).join('');
    this.optsEl.classList.add('pick');
    // (the row is kept narrower than the belt, so that it wraps clear of the compass at the belt's end)
    if (this.compass && this.compassEl) this.optsEl.style.maxWidth = Math.max(220, this.bar.offsetWidth - 2 * this.compassEl.offsetWidth - 24) + 'px';
    this.optsEl.style.display = 'flex';
    this.say(title); this.msgT = 6;
    this.seen = '';
    this.markOpt();
  }
  // The compass (Mirko): once found it is on the screen for good, above the cursor and camera switch. Its card turns as you turn.
  setCompass(yaw) {
    const el = this.compassEl || (this.compassEl = $('compass'));
    if (!this.compass) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    if (el.style.display !== 'block') { el.style.display = 'block'; this.seen = ''; }
    const deg = Math.round(yaw * 1800 / Math.PI) / 10;
    if (deg !== this.compassDeg) { this.compassDeg = deg; el.lastElementChild.style.transform = `rotate(${deg}deg)`; }
  }
  placeCompass() {
    const el = this.compassEl;
    if (!el || !this.compass) return;
    const group = this.bar.lastElementChild, inv = $('inv').getBoundingClientRect();
    if (!group) return;
    // above the belt (or the open pack); on a phone the row of buttons is as wide as the belt, so above everything there
    const phone = document.documentElement.classList.contains('phone');
    const g = group.getBoundingClientRect(), top = phone ? inv.top : (this.panel.style.display !== 'none' && this.panel.offsetHeight ? this.panel : this.bar).getBoundingClientRect().top;
    const size = el.offsetWidth;
    el.style.left = Math.round(Math.min(g.left + g.width / 2 - size / 2, innerWidth - size - 4) - inv.left) + 'px';
    el.style.top = Math.round(top - inv.top - size - 6) + 'px';
  }
  // Put a thing in a hand (a weapon in the right, anything else in the left), or put on a thing that is worn (a knapsack, armour).
  // What was there goes where the thing came from, or wherever there is room.
  equip(area, i) {
    const inv = this.inv, arr = inv.arr(area), it = arr && arr[i];
    if (!it) return;
    const back = !!it.def.wear, to = back ? inv[it.def.wear] : inv.hands, usual = back ? 0 : it.def.weapon ? 1 : 0;
    // a weapon goes in the right hand and anything else in the left; if that hand is taken and the other is free, use the other
    const n = !to[usual] || back ? usual : !to[1 - usual] ? 1 - usual : usual, old = to[n];
    arr[i] = null; to[n] = it;
    inv.lifted(it);
    if (old) {
      if (inv.fits(old, area)) arr[i] = old;
      else if (!inv.add(old)) inv.held = old;
      old.lit = false;
    }
    inv.version++;
  }
  pressOpt(n) {
    const o = this.opts;
    if (!o) return;
    if (!o.all[n][2]) return;
    const act = o.all[n][1], arr = this.inv.arr(o.area);
    this.closeOpts();
    if (o.pick) return act();
    if (!arr || arr[o.i] !== o.it) return;
    if (act === 'use') {
      if (usable(o.it.def)) this.onUse(o.it);
      else if (o.it === this.inv.back[0]) this.toggle();                 // the knapsack on your back
      else { this.inv.toggleOpen(o.it); this.open = true; }
    } else if (act === 'equip') this.equip(o.area, o.i);
    else {
      this.inv.click(o.area, o.i);
      if (act === 'drop') this.onDrop();
    }
  }
  // The pack button, and every other way of shutting things: closing shuts the pack AND any sack or bag opened from it.
  // A sack left open with the pack already shut (it is shown by itself) is shut by the same button, never the pack opened.
  toggle() {
    if (this.open || this.inv.open) this.closeAll();
    else this.open = true;
    this.seen = '';
  }
  closeAll() {
    this.closeOpts();
    this.open = false;
    if (this.inv.open) { this.inv.open = null; this.inv.version++; }
    this.focus = -1;
  }
  say(text) { this.msgEl.textContent = text; this.msgEl.style.opacity = 1; this.msgT = 2.6; }
  setLook(text) { if (this.lookEl.textContent !== text) this.lookEl.textContent = text; }

  // Controller: step through the places, press to pick up or put down, open a bag.
  slots() { return [...$('inv').querySelectorAll('.slot')]; }
  nav(d) {
    if (this.opts) {
      const a = this.opts.all; let f = this.opts.focus;
      do f = (f + d + a.length) % a.length; while (!a[f][2]);
      this.opts.focus = f; return this.markOpt();
    }
    const n = this.slots().length;
    this.focus = ((this.focus < 0 ? 0 : this.focus + d) + n) % n;
    this.seen = '';
  }
  press() { if (this.opts) return this.pressOpt(this.opts.focus); const s = this.slots()[this.focus]; if (s) this.clickSlot(s); }
  openFocused() {
    const s = this.slots()[this.focus], it = s && this.itemAt(s);
    if (this.opts) return this.closeOpts();
    if (it) this.showOpts(s, it);
  }

  update(dt, usingPad) {
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msgEl.style.opacity = 0; }
    this.pad = usingPad;
    if (this.opts && this.inv.version !== this.opts.at) this.closeOpts();
    if (!usingPad && this.focus >= 0) { this.focus = -1; this.seen = ''; }
    this.fuelLines();
    const bow = this.inv.bowInHand();             // taking up the bow fills the quiver from the pack
    if (bow && !this.hadBow) this.inv.fillQuiver();
    this.hadBow = bow;
    const sw = this.bar.querySelector('.mode');
    if (sw) sw.classList.toggle('cam', this.camera());
    const key = this.inv.version + '|' + this.open + '|' + this.focus;
    if (key === this.seen) return;
    this.seen = key;
    this.render();
  }

  slotHTML(area, i, it) {
    const icon = it ? `<i${hasArt(it.def) ? ' class="art"' : ''} style="background-image:url(${iconURL(it.def)})"></i>` : '';
    const opener = it && it.inside ? `<b class="opener${this.inv.open === it || (it === this.inv.back[0] && this.open) ? ' on' : ''}">&#9662;</b>` : '';
    const fuel = it && it.def.light ? `<u class="fuel"><s></s></u>` : '';       // a small line under a lamp's icon that runs down as it burns
    const count = it && it.def.stack ? `<em class="cnt">${it.n}</em>` : '';       // how many are in a pile (arrows)
    return `<div class="slot${it && it.lit ? ' lit' : ''}" data-area="${area}" data-i="${i}">${icon}${opener}${fuel}${count}</div>`;
  }
  fuelLines() {                                       // kept current every frame, without redrawing the bar
    for (const s of this.slots()) {
      const f = s.querySelector('.fuel');
      if (!f) continue;
      const it = this.itemAt(s);
      if (!it || !it.def.light) continue;
      const left = Math.max(0, Math.min(1, it.n / it.def.light.burn));
      f.firstChild.style.width = left * 100 + '%';
      f.classList.toggle('low', left < 0.2);
    }
  }
  grid(area, title) {
    const arr = this.inv.arr(area);
    return `<div class="group"><div class="slots">${arr.map((it, i) => this.slotHTML(area, i, it)).join('')}</div>`
      + `<label>${title}</label></div>`;
  }

  render() {
    const inv = this.inv;
    let bar = GROUPS.filter(([area]) => area !== 'quiver' || inv.bowInHand() || inv.quiver[0]).map(([area, title]) => this.grid(area, title)).join('');
    // The switch between the cursor (the mouse points at things) and the camera (the mouse turns your head), above PACK.
    const mode = `<label class="modeKey">Tab</label><div class="mode${this.camera() ? ' cam' : ''}" data-btn="mode" title="Cursor or camera [Tab]">`
      + `<span class="knob"></span><b class="cur">${CURSOR_ICON}</b><b class="eye">${CAMERA_ICON}</b></div>`;
    bar += `<div class="group">${mode}${inv.back[0] ? `<button data-btn="pack">${this.open || inv.open ? 'CLOSE' : 'PACK'}</button>` : ''}</div>`;
    this.bar.innerHTML = bar;

    let panel = '';
    if (this.open) {
      if (inv.back[0]) panel += this.grid('pack', inv.back[0].def.name);
      if (inv.open && inv.open !== inv.back[0]) panel += this.grid('bag', inv.open.def.name);
      panel += `<div class="weight">Carrying ${kg(inv.weight)} of ${kg(inv.capacity)}</div>`
        + `<div class="group"><button data-btn="pack">CLOSE</button></div>`;       // the pack closes from the pack itself too
    } else if (inv.open) {
      panel += this.grid('bag', inv.open.def.name)
        + `<div class="group"><button data-btn="pack">CLOSE</button></div>`;       // a sack open on its own has the master close too
    }
    this.panel.innerHTML = panel;
    this.panel.style.display = panel ? 'flex' : 'none';
    this.placeCompass();

    const slots = this.slots();
    if (this.focus >= slots.length) this.focus = slots.length - 1;
    if (this.focus >= 0) slots[this.focus].classList.add('focus');
    const focused = this.focus >= 0 ? this.itemAt(slots[this.focus]) : null;
    const o = this.opts, picked = o && slots.find(s => s.dataset.area === o.area && +s.dataset.i === o.i);
    if (picked) picked.classList.add('sel');

    const left = it => {              // how much is left in it
      const d = it.def;
      if (d.light) return (it.lit ? ' Lit.' : '') + (it.n > 0 ? ` Burns for ${Math.ceil(it.n / 60)} more ${Math.ceil(it.n / 60) === 1 ? 'minute' : 'minutes'}.` : ' Empty.');
      if (d.durability) return it.n <= d.durability * 0.25 ? ' It is cracked and close to breaking.' : it.n <= d.durability * 0.6 ? ' It is worn.' : '';
      if (d.count) return ` ${it.n} left.`;
      if (d.stack) return ` Up to ${d.stack} fit in one place.`;
      if (d.drinks) return ` ${it.n} ${it.n === 1 ? 'drink' : 'drinks'} left.`;
      return '';
    };
    // what it does in a fight: the harm of a blow, and how much of a blow it stops when you guard with it
    const round1 = v => Math.round(v * 10) / 10;
    const stats = (d, it) => (d.weapon || d.bow || d.block || d.armour ? ' <i>' + [d.bow ? `Damage ${d.bow.damage} at full draw (arrow)` : '', d.weapon ? `Level ${it.level || 1} &nbsp; Damage ${round1(it.harm ?? d.weapon.damage)} (${d.weapon.type})` + (d.light ? '' : ` &nbsp; Sharpened ${it.edge || 0} of ${EDGE_MAX}`) : '',
      d.block ? `Block ${Math.round(d.block * 100)}%` : '', d.armour ? `Takes ${Math.round(d.armour * 100)}% of a blow when worn` : '']
      .filter(Boolean).join(' &nbsp; ') + '</i>' : '');
    const describe = it => `<b>${it.name}.</b> ${it.def.text}${left(it)}${stats(it.def, it)} <span style="white-space:nowrap">(${kg(it.weight)})</span>`;
    if (inv.held) {
      this.info.innerHTML = `Holding: ${describe(inv.held)} `
        + (usable(inv.held.def) ? '<button data-btn="use">USE</button> ' : '') + '<button data-btn="drop">DROP</button>';
    } else {
      const it = focused || (o && o.it) || this.hover;      // the thing picked out is described, whatever the pointer is on
      this.info.innerHTML = it && this.holds(it) ? describe(it) : '';
    }
    this.heldEl.style.backgroundImage = inv.held ? `url(${iconURL(inv.held.def)})` : '';
    this.heldEl.style.imageRendering = inv.held && hasArt(inv.held.def) ? 'auto' : 'pixelated';
    this.heldEl.style.display = inv.held ? 'block' : 'none';
  }
  // Is the thing still somewhere on show (it may have moved since the pointer was over it)?
  holds(it) {
    return ['hands', 'belt', 'quiver', 'back', 'head', 'body', 'pack', 'bag'].some(a => (this.inv.arr(a) || []).includes(it));
  }
}
