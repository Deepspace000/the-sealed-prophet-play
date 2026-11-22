// The belt bar along the bottom, the pack panel above it, and short messages.
import { iconURL, hasArt } from './items.js';
import { usable, verb } from './survival.js';

const GROUPS = [
  ['hands', 'Left hand &middot; Right hand', 2],
  ['belt', 'Belt', 4],
  ['back', 'Back', 1],
];
const $ = id => document.getElementById(id);
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
      if (opt) return this.pressOpt(+opt.dataset.opt);
      const opener = e.target.closest('.opener'), slot = e.target.closest('.slot'), btn = e.target.closest('[data-btn]');
      this.closeOpts();
      if (opener) { this.inv.toggleOpen(this.itemAt(opener.parentElement)); this.open = true; }
      else if (slot) this.clickSlot(slot, e);
      else if (btn && btn.dataset.btn === 'drop') this.onDrop();
      else if (btn && btn.dataset.btn === 'use') { if (this.inv.held) this.onUse(this.inv.held); }
      else if (btn && btn.dataset.btn === 'pack') this.toggle();
    });
    root.addEventListener('pointerover', e => {
      const slot = e.target.closest('.slot');
      const it = slot ? this.itemAt(slot) : null;
      if (it !== this.hover) { this.hover = it; this.seen = ''; }
      if (e.pointerType !== 'mouse') return;
      // With a mouse, the list of what you can do comes up as soon as the pointer is on a thing, right against it.
      if (slot && it && !this.inv.held) {
        clearTimeout(this.optsTimer);
        if (!this.opts || this.opts.it !== it) this.showOpts(slot, it);
      } else if (e.target.closest('#opts')) clearTimeout(this.optsTimer);
      else this.leaveOpts();
    });
    root.addEventListener('pointerleave', () => this.leaveOpts());
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
  // A click on a place picks the thing up to move it, or puts down what you are moving (the notebook goes straight
  // to the map). The list of what else you can do with it is already showing, from the pointer being on it.
  clickSlot(slotEl, e) {
    const it = this.itemAt(slotEl);
    if (it && !this.inv.held && e) {
      const mouse = e.pointerType === 'mouse', right = e.button === 2;
      if (it.def.map && mouse && !right) return this.onUse(it);
      if (!mouse || right) return this.showOpts(slotEl, it);          // a finger has no hover: a tap brings up the list
    }
    if (this.inv.click(slotEl.dataset.area, +slotEl.dataset.i) === 'no') this.say('That does not fit there.');
  }
  showOpts(slotEl, it) {
    const v = verb(it), r = slotEl.getBoundingClientRect(), el = this.optsEl;
    const area = slotEl.dataset.area, d = it.def;
    const equip = d.wear === 'back' ? (area !== 'back' ? 'WEAR' : '') : (d.weapon || d.block || d.light) && area !== 'hands' ? 'EQUIP' : '';
    const list = [...(v ? [[v, 'use']] : []), ...(equip ? [[equip, 'equip']] : []), ['MOVE', 'move'], ['DROP', 'drop']];
    this.opts = { it, area: slotEl.dataset.area, i: +slotEl.dataset.i, focus: 0, list, at: this.inv.version };
    el.innerHTML = `<b>${it.def.name}</b>` + list.map(([label], n) => `<button data-opt="${n}">${label}</button>`).join('');
    el.style.display = 'flex';
    el.style.left = Math.max(80, Math.min(innerWidth - 80, r.left + r.width / 2)) + 'px';
    el.style.bottom = (innerHeight - r.top - 9) + 'px';          // touching the thing, so the pointer can go straight onto it
    this.markOpt();
  }
  markOpt() {
    [...this.optsEl.querySelectorAll('button')].forEach((b, n) => b.classList.toggle('focus', this.pad && n === this.opts.focus));
  }
  closeOpts() { clearTimeout(this.optsTimer); if (this.opts) { this.opts = null; this.optsEl.style.display = 'none'; } }
  leaveOpts() { clearTimeout(this.optsTimer); this.optsTimer = setTimeout(() => this.closeOpts(), 260); }
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
    const act = o.list[n][1], arr = this.inv.arr(o.area);
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
    if (this.opts) { const k = this.opts.list.length; this.opts.focus = (this.opts.focus + d + k) % k; return this.markOpt(); }
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
      const it = focused || this.hover;
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
