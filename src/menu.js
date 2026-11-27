// The menu (the SETTINGS button, Esc, Start on a controller, MENU on a touch screen): sleep, save, load, and leaving the game.
// The game stands still while it is open.
import { SLOTS, readSlot, describe, saveOff } from './save.js';

export class Menu {
  // actions: { sleep(), save(slot), load(slot), toFile(), fromFile(file), toTitle(), toDesktop() }
  constructor(actions) {
    this.actions = actions;
    this.el = document.getElementById('menu');
    this.box = document.getElementById('menuIn');
    this.file = document.getElementById('menuFile');
    this.open = false; this.focus = 0; this.note = '';
    this.el.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (b) { e.preventDefault(); this.act(b); } else if (e.target === this.el) this.toggle();
    });
    this.file.addEventListener('change', () => {
      const f = this.file.files[0];
      this.file.value = '';
      if (f) this.actions.fromFile(f);
    });
  }
  // mode 'load': only the list of saves to load from (the LOAD button on the title screen, and the one in this menu).
  toggle(note = '', mode = null) {
    this.open = !this.open; this.focus = 0; this.note = note; this.mode = this.open ? mode : null;
    this.el.style.zIndex = this.mode === 'load' ? 60 : '';       // (over the title screen)
    this.el.style.display = this.open ? 'flex' : 'none';
    if (this.open) this.render();
  }
  say(note) { this.note = note; if (this.open) this.render(); }
  buttons() { return [...this.box.querySelectorAll('button')]; }
  // Controller: up and down choose, A presses.
  nav(d) { const n = this.buttons().length; this.focus = (this.focus + d + n) % n; this.render(); }
  press() { const b = this.buttons()[this.focus]; if (b) this.act(b); }

  act(b) {
    const a = b.dataset.m, slot = b.dataset.s;
    if (a === 'close') this.toggle();
    else if (a === 'loadlist') { this.mode = 'load'; this.focus = 0; this.note = ''; this.render(); }
    else if (a === 'sleep') { this.toggle(); this.actions.sleep(); }
    else if (a === 'save') this.say(this.actions.save(slot) ? `Saved in place ${slot}.` : saveOff ? 'Saving is switched off in this test link (nosave=1 in the address).' : 'The save could not be written.');
    else if (a === 'load') this.actions.load(slot);
    else if (a === 'export') { this.actions.toFile(); this.say('Save file made. It is in your downloads.'); }
    else if (a === 'import') this.file.click();
    else if (a === 'title') this.actions.toTitle();
    else if (a === 'desktop') this.actions.toDesktop();
  }

  render() {
    const row = (title, v, slot, canSave) => `<div class="slotRow"><span><b>${title}</b> ${describe(v)}</span>`
      + (canSave ? `<button data-m="save" data-s="${slot}">SAVE</button>` : '')
      + (v ? `<button data-m="load" data-s="${slot}">LOAD</button>` : '') + '</div>';
    const places = [...SLOTS.map(s => [`Place ${s}.`, s]), ['Quicksave (F5).', 'quick'], ['Kept by the game.', 'auto']];
    if (this.mode === 'load') this.box.innerHTML = '<h2 class="deco">LOAD</h2>'
      + places.map(([t, s]) => row(t, readSlot(s), s, false)).join('')
      + '<div class="menuRow"><button data-m="import">LOAD FROM A FILE</button><button data-m="close">BACK</button></div>'
      + `<div class="menuNote">${this.note}</div>`;
    else this.box.innerHTML = '<h2 class="deco">SETTINGS</h2>'
      + '<div class="menuRow"><button data-m="close">BACK TO THE GAME</button><button data-m="loadlist">LOAD</button><button data-m="sleep">SLEEP</button></div>'
      + SLOTS.map(s => row(`Place ${s}.`, readSlot(s), s, true)).join('')
      + row('Quicksave (F5).', readSlot('quick'), 'quick', true)
      + row('Kept by the game.', readSlot('auto'), 'auto', false)
      + '<div class="menuRow"><button data-m="export">SAVE TO A FILE</button><button data-m="import">LOAD FROM A FILE</button></div>'
      + '<div class="menuRow"><button data-m="title">EXIT TO THE MENU</button><button data-m="desktop">EXIT TO DESKTOP</button></div>'
      + `<div class="menuNote">${this.note}</div>`;
    const bs = this.buttons();
    if (this.focus >= bs.length) this.focus = bs.length - 1;
    if (this.pad) bs[this.focus].classList.add('focus');
  }
}
