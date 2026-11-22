// The belt bar along the bottom, the pack panel above it, and short messages.
import { iconURL, hasArt } from './items.js';
import { usable, verb } from './survival.js';

const GROUPS = [
  ['hands', 'Left hand &middot; Right hand', 2],
  ['belt', 'Belt', 4],
  ['back', 'Back', 1],
];
const $ = id => document.getElementById(id);
const SHORT = { 'OPEN THE MAP': 'MAP', 'LIGHT YOUR LAMP': 'LIGHT LAMP', 'FILL THE LAMP': 'FILL LAMP' };      // short words for the buttons
const kg = w => (Math.round(w * 10) / 10) + ' kg';

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

    const root = $('inv');
    root.addEventListener('pointerdown', e => {
      e.preventDefault();
      const opt = e.target.closest('[data-opt]');
      if (opt) { if (!opt.classList.contains('off')) this.pressOpt(+opt.dataset.opt); return; }
      if (e.target.closest('#opts')) return;
      const opener = e.target.closest('.opener'), slot = e.target.closest('.slot'), btn = e.target.closest('[data-btn]');
      if (opener) { this.closeOpts(); this.inv.toggleOpen(this.itemAt(opener.parentElement)); this.open = true; return; }
      if (slot) return this.clickSlot(slot, e);
      this.closeOpts();
      if (btn && btn.dataset.btn === 'drop') this.onDrop();
      else if (btn && btn.dataset.btn === 'use') { if (this.inv.held) this.onUse(this.inv.held); }
      else if (btn && btn.dataset.btn === 'pack') this.toggle();
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
      if (inv.click(area, i) === 'no') this.say('That does not fit there.');
      return;
    }
    if (it) {
      if (it.def.map && e && e.pointerType === 'mouse' && e.button !== 2) { this.closeOpts(); return this.onUse(it); }
      if (o && o.it === it) return this.closeOpts();
      return this.showOpts(slotEl, it);
    }
    if (!o) return;
    const from = inv.arr(o.area);
    this.closeOpts();
    if (!from || from[o.i] !== o.it) return;
    inv.click(o.area, o.i);
    if (inv.click(area, i) === 'no') { inv.click(o.area, o.i); this.say('That does not fit there.'); }
  }
  showOpts(slotEl, it) {
    const v = SHORT[verb(it)] || verb(it), area = slotEl.dataset.area, d = it.def, back = d.wear === 'back';
    const equip = back ? area !== 'back' : (d.weapon || d.block || d.light) && area !== 'hands';
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
  closeOpts() { if (this.opts) { this.opts = null; this.optsEl.style.display = 'none'; this.seen = ''; } }
  // Put a thing in a hand (a weapon in the right, anything else in the left) or a knapsack on your back.
  // What was there goes where the thing came from, or wherever there is room.
  equip(area, i) {
    const inv = this.inv, arr = inv.arr(area), it = arr && arr[i];
    if (!it) return;
    const to = it.def.wear === 'back' ? inv.back : inv.hands, n = it.def.wear === 'back' ? 0 : it.def.weapon ? 1 : 0, old = to[n];
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
  toggle() { this.open = !this.open; this.seen = ''; }
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
    const key = this.inv.version + '|' + this.open + '|' + this.focus;
    if (key === this.seen) return;
    this.seen = key;
    this.render();
  }

  slotHTML(area, i, it) {
    const icon = it ? `<i${hasArt(it.def) ? ' class="art"' : ''} style="background-image:url(${iconURL(it.def)})"></i>` : '';
    const opener = it && it.inside ? `<b class="opener${this.inv.open === it ? ' on' : ''}">&#9662;</b>` : '';
    return `<div class="slot${it && it.lit ? ' lit' : ''}" data-area="${area}" data-i="${i}">${icon}${opener}</div>`;
  }
  grid(area, title) {
    const arr = this.inv.arr(area);
    return `<div class="group"><div class="slots">${arr.map((it, i) => this.slotHTML(area, i, it)).join('')}</div>`
      + `<label>${title}</label></div>`;
  }

  render() {
    const inv = this.inv;
    let bar = GROUPS.map(([area, title]) => this.grid(area, title)).join('');
    if (inv.back[0]) bar += `<div class="group"><button data-btn="pack">${this.open ? 'CLOSE' : 'PACK'}</button></div>`;
    this.bar.innerHTML = bar;

    let panel = '';
    if (this.open) {
      if (inv.back[0]) panel += this.grid('pack', inv.back[0].def.name);
      if (inv.open) panel += this.grid('bag', inv.open.def.name);
      panel += `<div class="weight">Carrying ${kg(inv.weight)} of ${kg(inv.capacity)}</div>`;
    } else if (inv.open) {
      panel += this.grid('bag', inv.open.def.name);
    }
    this.panel.innerHTML = panel;
    this.panel.style.display = panel ? 'flex' : 'none';

    const slots = this.slots();
    if (this.focus >= slots.length) this.focus = slots.length - 1;
    if (this.focus >= 0) slots[this.focus].classList.add('focus');
    const focused = this.focus >= 0 ? this.itemAt(slots[this.focus]) : null;
    const o = this.opts, picked = o && slots.find(s => s.dataset.area === o.area && +s.dataset.i === o.i);
    if (picked) picked.classList.add('sel');

    const left = it => {              // how much is left in it
      const d = it.def;
      if (d.light) return (it.lit ? ' Lit.' : '') + (it.n > 0 ? ` Burns for ${Math.ceil(it.n / 60)} more ${Math.ceil(it.n / 60) === 1 ? 'minute' : 'minutes'}.` : ' Empty.');
      if (d.count) return ` ${it.n} left.`;
      if (d.drinks) return ` ${it.n} ${it.n === 1 ? 'drink' : 'drinks'} left.`;
      return '';
    };
    const describe = it => `<b>${it.def.name}.</b> ${it.def.text}${left(it)} (${kg(it.weight)})`;
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
    return ['hands', 'belt', 'back', 'pack', 'bag'].some(a => (this.inv.arr(a) || []).includes(it));
  }
}
