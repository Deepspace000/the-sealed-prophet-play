// Trading with someone who keeps a shop (data/people.json "stock"). There is no money: you choose one of their things, then
// put things of yours on the other side until what you offer is worth as much ("worth" in data/items.json). Each of their
// things can be had once; what has gone is kept in the save (flags[id + '_sold']).
// He will also work on the weapon in your hand and raise its level by one, as often as you can pay: the price is TEMPER for each
// level it will then have (level 2: 30, level 3: 45, ...).
const $ = id => document.getElementById(id);
const DMG = { cut: 'Cuts', stab: 'Stabs', crush: 'Crushes' };
const TEMPER = 15, WORK = '_work';
import { LEVEL_MAX, LEVEL_GAIN } from './items.js';

export class Shop {
  // cfg: { defs (items), inv, make(id) -> item, say(text), flags }
  constructor(cfg) {
    Object.assign(this, cfg);
    this.el = $('shop'); this.isOpen = false;
    $('shopClose').addEventListener('click', () => this.close());
    $('shopTrade').addEventListener('click', () => this.trade());
  }
  open(person, pad) {
    this.person = person; this.pick = null; this.offer = new Set(); this.isOpen = true; this.pad = !!pad; this.focus = 0;
    this.el.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  }
  close() { this.isOpen = false; this.el.style.display = 'none'; }
  // Controller: the d-pad goes from one thing to the next (his, then yours, then the buttons), A chooses it, B closes.
  buttons() { return [...this.el.querySelectorAll('button')].filter(b => !b.disabled); }
  nav(d) { const n = this.buttons().length; if (n) { this.focus = (this.focus + d + n) % n; this.render(); } }
  press() { const b = this.buttons()[this.focus]; if (b) b.click(); }
  sold() { return new Set(this.flags[this.person.id + '_sold'] || []); }
  worth(it) { return (it.def.worth || 0) + (it.inside || []).reduce((s, x) => s + (x ? this.worth(x) : 0), 0); }
  describe(def) {
    const w = def.weapon, out = [];
    if (w) out.push(`${DMG[w.type] || 'Hits'} for ${w.damage}. Reach ${w.reach} m.`);
    if (def.block) out.push(`Blocks ${Math.round(def.block * 100)}%.`);
    if (def.durability) out.push(`Wears out after ${def.durability} blows.`);
    out.push(`${def.weight} kg.`);
    return out.join(' ');
  }
  render() {
    const sold = this.sold(), wares = (this.person.def.stock || []).filter(id => !sold.has(id) && this.defs[id]);
    $('shopTitle').textContent = this.person.def.name.toUpperCase();
    $('shopTheirs').innerHTML = wares.length ? '' : '<p class="none">He has nothing left to trade.</p>';
    // his work on the weapon in your hand
    const w = this.weapon ? this.weapon() : null;
    this.workPrice = w && w.lvl < LEVEL_MAX ? TEMPER * (w.lvl + 1) : 0;
    if (w) {
      const b = document.createElement('button'), can = w.lvl < LEVEL_MAX;
      b.className = 'ware' + (this.pick === WORK ? ' on' : ''); b.disabled = !can;
      b.innerHTML = can ? `<b>His work on your ${w.def.name.toLowerCase()}</b><span class="worth">worth ${this.workPrice}</span><i>He takes the weapon in your hand, works on it, and gives it back one level better.</i>`
          + `<i class="stats">Level ${w.lvl} to level ${w.lvl + 1}: harm ${Math.round(w.def.weapon.damage * w.might * 10) / 10} to ${Math.round(w.def.weapon.damage * (w.might + LEVEL_GAIN) * 10) / 10}.</i>`
        : `<b>Your ${w.def.name.toLowerCase()}</b><i>It is as good as he can make it.</i>`;
      b.addEventListener('click', () => { this.pick = this.pick === WORK ? null : WORK; this.render(); });
      $('shopTheirs').querySelector('.none')?.remove();
      $('shopTheirs').appendChild(b);
    }
    for (const id of wares) {
      const d = this.defs[id], b = document.createElement('button');
      b.className = 'ware' + (this.pick === id ? ' on' : '');
      b.innerHTML = `<b>${d.name}</b><span class="worth">worth ${d.worth}</span><i>${d.text}</i><i class="stats">${this.describe(d)}</i>`;
      b.addEventListener('click', () => { this.pick = this.pick === id ? null : id; this.render(); });
      $('shopTheirs').appendChild(b);
    }
    const mine = [...this.inv.all()].map(([it]) => it).filter(it => it.def.worth && !it.def.relic && !it.def.key && it !== w);
    $('shopMine').innerHTML = mine.length ? '' : '<p class="none">You carry nothing he wants: gold, silver, jewels, old weapons.</p>';
    for (const it of mine) {
      const b = document.createElement('button');
      b.className = 'ware' + (this.offer.has(it) ? ' on' : '');
      b.innerHTML = `<b>${it.name}</b><span class="worth">worth ${it.def.worth}</span>`;
      b.addEventListener('click', () => { if (this.offer.has(it)) this.offer.delete(it); else this.offer.add(it); this.render(); });
      $('shopMine').appendChild(b);
    }
    const name = this.pick === WORK ? 'His work' : this.pick ? this.defs[this.pick].name : '';
    const price = this.pick === WORK ? this.workPrice : this.pick ? this.defs[this.pick].worth : 0, given = [...this.offer].reduce((s, it) => s + (it.def.worth || 0), 0);
    $('shopSum').textContent = this.pick
      ? `${name}: worth ${price}.  You offer things worth ${given}.` + (given >= price ? '  He will take it.' : '  It is not enough.')
      : 'Choose one of his things, then what you will give for it.';
    $('shopTrade').disabled = !(this.pick && given >= price);
    if (this.pad) {
      const bs = this.buttons();
      this.focus = Math.min(this.focus, bs.length - 1);
      for (const b of this.el.querySelectorAll('button')) b.classList.remove('focus');
      if (bs[this.focus]) { bs[this.focus].classList.add('focus'); bs[this.focus].scrollIntoView({ block: 'nearest' }); }
    }
  }
  trade() {
    if (!this.pick) return;
    if (this.pick === WORK) {                                           // he works on your weapon
      const w = this.weapon && this.weapon(), given = [...this.offer];
      if (!w || w.lvl >= LEVEL_MAX || given.reduce((s, it) => s + (it.def.worth || 0), 0) < this.workPrice) return;
      for (const it of given) this.inv.remove(it);
      w.lvl++; this.inv.version++;
      this.say(`He works on the ${w.def.name.toLowerCase()}. It is level ${w.lvl} now.`);
      this.pick = null; this.offer = new Set();
      return this.render();
    }
    const def = this.defs[this.pick], given = [...this.offer];
    if (given.reduce((s, it) => s + (it.def.worth || 0), 0) < def.worth) return;
    for (const it of given) this.inv.remove(it);
    const got = this.make(this.pick);
    if (!this.inv.add(got)) {                                          // no room even with those gone: give them back
      for (const it of given) this.inv.add(it);
      this.say('You have no room to carry it.');
      return this.render();
    }
    this.flags[this.person.id + '_sold'] = [...this.sold(), this.pick];
    this.say(`You trade for the ${def.name.toLowerCase()}.`);
    this.pick = null; this.offer = new Set();
    this.render();
  }
}
