// Staying alive: hunger, tiredness, and the light you carry. Also what happens when you use a thing.
// The numbers for each thing are in data/items.json (food, heal, drinks, light, fuel, count, sleep).
import { play } from './sound.js';
import { EDGE_MAX } from './items.js';

const AIR_TIME = 20;            // seconds you can stay under water on one breath
const AIR_BACK = 2.5;           // seconds to get your breath back at the surface
const DROWN = 4;                // health lost each second once the air is gone
const FOOD_TIME = 45 * 60;      // seconds of play from full to starving
const REST_TIME = 70 * 60;      // seconds of play from rested to worn out
const low = s => s.toLowerCase();
const FUEL = { paraffin: 'paraffin', oil: 'oil' };

export const usable = def => !!(def.food || def.drinks || def.light || def.fuel || def.sleep || def.potion || def.count || def.refill || def.map || def.bandage || def.whet);
// What using a thing does, in a word or two, for the button. '' if there is nothing to do with it.
export function verb(it) {
  const d = it.def;
  return d.map ? 'OPEN THE MAP' : d.whet ? 'SHARPEN' : d.bandage ? 'BIND' : d.food ? 'EAT' : d.potion ? 'DRINK' : d.drinks ? (it.n > 0 ? 'DRINK' : 'FILL') : d.light ? (it.lit ? 'PUT OUT' : 'LIGHT')
    : d.refill ? 'REFILL MATCHES' : d.count ? 'LIGHT YOUR LAMP' : d.fuel ? 'FILL THE LAMP' : d.sleep ? 'SLEEP' : it.inside ? 'OPEN' : '';
}

export class Survival {
  // onSleep: called when a bedroll is used. onMap: called when the notebook is used.
  constructor({ inv, fight, ui, onSleep, onMap }) {
    Object.assign(this, { inv, fight, ui, onSleep, onMap });
    this.food = 80; this.rest = 85;
    this.tick = 0; this.said = {};
  }

  top() { return [...this.inv.hands, ...this.inv.belt].filter(Boolean); }     // where a light must be to shine
  lit() { return this.top().find(it => it.lit && it.def.light); }
  // The light you are carrying, or null: { power, range, flicker, left 0..1 }
  light() {
    const it = this.lit();
    return it ? { ...it.def.light, left: Math.max(0, it.n / it.def.light.burn) } : null;
  }

  // For the fuel gauge: the burning light, else the first one you carry (lit or not): { left 0..1, mins, lit } or null.
  gauge() {
    const it = this.lit() || this.top().find(x => x.def.light);
    if (!it) return null;
    return { left: Math.max(0, Math.min(1, it.n / it.def.light.burn)), mins: Math.ceil(it.n / 60), lit: !!it.lit };
  }

  // The lamp key. nearFlame: you are standing at a burning wall torch, so no match is needed.
  toggleLight(nearFlame, only) {
    const on = only ? (only.lit ? only : null) : this.lit();
    if (on) { on.lit = false; this.inv.version++; this.ui.say(`You put out the ${low(on.def.name)}.`); return; }
    const lights = only ? [only] : this.top().filter(it => it.def.light);
    if (!lights.length) { this.ui.say('You have nothing to light.'); return; }
    if (only && !this.top().includes(only)) { this.ui.say(`Hold the ${low(only.def.name)} in a hand or on your belt to light it.`); return; }
    const it = lights.find(l => l.n > 0);
    if (!it) { this.ui.say(`The ${low(lights[0].def.name)} is empty.`); return; }
    let tail = ' from the torch on the wall.';
    if (!nearFlame) {
      const m = [...this.inv.all()].map(e => e[0]).find(x => x.def.count && x.n > 0);
      if (!m) { this.ui.say('You have no matches.'); return; }
      m.n--;
      tail = m.n === 1 ? '. 1 match left.' : `. ${m.n} matches left.`;
      if (m.n <= 0) { this.inv.remove(m); tail = '. That was your last match.'; }
    }
    for (const other of this.top()) other.lit = false;
    it.lit = true; this.inv.version++;
    this.ui.say(`You light the ${low(it.def.name)}${tail}`);
  }

  // Use a thing you carry. inWater: you are standing in water (for filling the canteen).
  use(it, inWater) {
    const d = it.def, name = low(d.name), F = this.fight;
    if (d.map) this.onMap();
    else if (d.whet) {               // a sharpening stone (Mirko): you choose which of your weapons; it does 1 more damage, 3 times at most; the stone breaks
      const ws = [...this.inv.all()].map(e => e[0]).filter(x => x.def.weapon && !x.def.light);
      if (!ws.length) { this.ui.say('You have no weapon to sharpen.'); return; }
      if (!ws.some(w => w.edge < EDGE_MAX)) { this.ui.say(ws.length > 1 ? 'Your weapons cannot be sharpened any more.' : `The ${low(ws[0].def.name)} cannot be sharpened any more.`); return; }
      const sharpen = w => {
        if (![...this.inv.all()].some(e => e[0] === it) || w.edge >= EDGE_MAX) return;
        w.edge++; this.inv.remove(it); this.inv.version++; play('chip');
        this.ui.say(`You sharpen the ${low(w.def.name)}. It is level ${w.level} now: damage ${Math.round(w.harm * 10) / 10} (sharpened ${w.edge} of ${EDGE_MAX}). The stone breaks.`);
      };
      if (ws.length === 1) sharpen(ws[0]);
      else this.ui.choose('Choose the weapon to sharpen.', ws.map(w => [`${w.def.name} ${w.edge}/${EDGE_MAX}`, w.edge < EDGE_MAX, () => sharpen(w)]));
    }
    else if (d.refill) {             // a bundle of matches fills the box again
      const box = [...this.inv.all()].map(e => e[0]).find(x => x.def.id === d.refill && x.n < x.def.count);
      if (!box) { this.ui.say(this.inv.all && [...this.inv.all()].some(e => e[0].def.id === d.refill) ? 'Your box of matches is full.' : 'You have no box to put them in.'); return; }
      box.n = box.def.count; this.inv.remove(it); this.inv.version++;
      this.ui.say('You fill your box of matches.');
    }
    else if (d.bandage) {
      if (F.hp >= F.hpMax) { this.ui.say('You are not hurt.'); return; }
      F.hp = Math.min(F.hpMax, F.hp + d.bandage.heal);
      this.inv.remove(it);
      this.ui.say('You bind your wounds with the linen.');
    } else if (d.potion) {
      F.hp = Math.min(F.hpMax, F.hp + (d.potion.heal || 0));
      this.inv.remove(it);
      this.ui.say('You drink it. You feel better.');
    } else if (d.count) {            // a match
      if (this.lit()) this.ui.say('Your light is already burning.'); else this.toggleLight(false);
    } else if (d.food) {
      this.food = Math.min(100, this.food + d.food);
      F.hp = Math.min(F.hpMax, F.hp + (d.heal || 0));
      this.inv.remove(it); this.said.food = 0;
      this.ui.say(`You eat the ${name}.`);
    } else if (d.drinks) {
      if (it.n > 0) {
        it.n--; F.st = Math.min(F.stMax, F.st + 45); this.food = Math.min(100, this.food + 2);
        this.inv.version++;
        this.ui.say(it.n ? `You drink. ${it.n} ${it.n === 1 ? 'drink' : 'drinks'} left.` : 'You drink. The canteen is empty.');
      } else if (inWater) { it.n = d.drinks; this.inv.version++; this.ui.say('You fill the canteen.'); }
      else this.ui.say('The canteen is empty. Stand in water to fill it.');
    } else if (d.light) this.toggleLight(false, it);
    else if (d.fuel) {
      const lamp = [...this.inv.all()].map(e => e[0]).find(x => x.def.light && x.def.light.fuel === d.fuel && x.n < x.def.light.burn);
      if (!lamp) { this.ui.say(`You have nothing that needs ${FUEL[d.fuel] || d.fuel}.`); return; }
      lamp.n = lamp.def.light.burn;
      this.inv.remove(it);
      this.ui.say(`You fill the ${low(lamp.def.name)}.`);
    } else if (d.sleep) this.onSleep();
  }

  // After a sleep. woken: something disturbed it.
  slept(woken) {
    const F = this.fight, fed = this.food > 0;
    this.rest = woken ? Math.max(this.rest, 55) : 100;
    F.hp = Math.min(F.hpMax, F.hp + F.hpMax * (woken ? 0.2 : fed ? 0.6 : 0.15));
    this.food = Math.max(0, this.food - (woken ? 8 : 20));
    F.st = F.stMax;
    this.said.rest = 0;
  }

  say(key, level, text) {            // each warning is given once as things get worse
    if ((this.said[key] || 0) < level) { this.said[key] = level; this.ui.say(text); }
  }

  // ctx: { underwater, hunting }
  update(dt, ctx) {
    const F = this.fight, inv = this.inv;
    // Breath. Under water the air runs down; when it is gone you lose health every second until you come up.
    if (this.air == null) this.air = 1;
    if (ctx.underwater && !F.dead) {
      const was = this.air;
      this.air = Math.max(0, this.air - dt / AIR_TIME);
      if (was > 0.3 && this.air <= 0.3) this.ui.say('You are running out of air.');
      if (was > 0 && this.air <= 0) { this.ui.say('You have no air left. You are drowning.'); this.drownT = 0; }
      if (this.air <= 0) { this.drownT -= dt; if (this.drownT <= 0) { this.drownT += 1; F.harm(DROWN, 'drowned'); } }
    } else if (this.air < 1) {
      if (this.wasUnder && this.air < 0.6) play('gasp');
      this.air = Math.min(1, this.air + dt / AIR_BACK);
    }
    this.wasUnder = ctx.underwater;
    // a light only burns in a hand or on the belt
    const top = this.top();
    for (const [it] of inv.all()) {
      if (!it.lit) continue;
      if (!top.includes(it) || ctx.underwater) {
        it.lit = false; inv.version++;
        if (ctx.underwater) this.ui.say('The water puts out your light.');
        continue;
      }
      const before = it.n;
      it.n -= dt;
      if (before > 120 && it.n <= 120) this.ui.say(`The ${low(it.def.name)} is burning low.`);
      if (it.n <= 0) {
        it.n = 0; it.lit = false; inv.version++;
        if (it.def.light.once) { inv.remove(it); this.ui.say(`The ${low(it.def.name)} has burned out.`); }
        else this.ui.say(`The ${low(it.def.name)} has run out of ${FUEL[it.def.light.fuel] || 'fuel'}.`);
      }
    }
    this.tick += dt;
    if (this.tick > 20) { this.tick = 0; if (this.lit()) inv.version++; }      // keeps the minutes shown up to date

    this.food = Math.max(0, this.food - dt * 100 / FOOD_TIME);
    this.rest = Math.max(0, this.rest - dt * 100 / REST_TIME);
    if (this.food <= 0) this.say('food', 2, 'You are starving.');
    else if (this.food < 25) this.say('food', 1, 'You are hungry.');
    if (this.rest <= 0) this.say('rest', 2, 'You are worn out. You need sleep.');
    else if (this.rest < 25) this.say('rest', 1, 'You are tired.');

    // hunger slows how fast stamina comes back; tiredness lowers how much you have
    F.regenMul = this.food <= 0 ? 0.4 : this.food < 25 ? 0.7 : 1;
    F.stCap = this.rest <= 0 ? 0.4 : this.rest < 25 ? 0.7 : 1;
    // fed and rested, you mend slowly; starving, you waste away (but hunger alone does not kill)
    if (this.food <= 0) { if (F.hp > 1) F.hp = Math.max(1, F.hp - dt / 12); }
    else if (this.food > 40 && this.rest > 20 && !ctx.hunting && F.calm > 6) F.hp = Math.min(F.hpMax, F.hp + dt / 15);
  }
}
