// Saving. The whole game so far is one plain object, the "run":
//   { v, level, from, pos, inv, hp, food, rest, played, levels: { name: { items, creatures } } }
// The run being played is kept for this tab (so moving between levels and reloading the page keep it).
// Saves are copies of it kept by the browser: three numbered places, one the game writes itself ("auto") and the one F5 writes ("quick").
// Add ?nosave=1 to the address to keep a test from writing over real saves.
const RUN = 'sp_run', SAVE = 'sp_save_';
const OFF = new URLSearchParams(location.search).get('nosave') === '1';
export const SLOTS = ['1', '2', '3'];
const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };

export const getRun = () => parse(sessionStorage.getItem(RUN));
export const setRun = run => sessionStorage.setItem(RUN, JSON.stringify(run));
export const clearRun = () => sessionStorage.removeItem(RUN);

export function writeSlot(slot, run, levelName) {
  if (OFF) return false;
  try {
    localStorage.setItem(SAVE + slot, JSON.stringify({ when: Date.now(), levelName, played: run.played || 0, run }));
    return true;
  } catch (e) { return false; }
}
export const readSlot = slot => { const v = parse(localStorage.getItem(SAVE + slot)); return v && valid(v.run) ? v : null; };
export function newest() {
  let best = null;
  for (const s of [...SLOTS, 'auto', 'quick']) { const v = readSlot(s); if (v && (!best || v.when > best.when)) best = v; }
  return best;
}
export const valid = run => !!run && run.v === 1 && typeof run.level === 'string' && /^[a-z0-9_]+$/.test(run.level) && !!run.inv;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function describe(v) {
  if (!v) return 'Empty';
  const d = new Date(v.when), two = n => String(n).padStart(2, '0');
  return `${v.levelName} · ${Math.max(1, Math.round(v.played / 60))} min played · ${d.getDate()} ${MONTHS[d.getMonth()]}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// A save as a file, to keep or to move to another device.
export function toFile(run, levelName) {
  const blob = new Blob([JSON.stringify({ game: 'The Sealed Prophet', when: Date.now(), levelName, played: run.played || 0, run })],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sealed-prophet-save.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function fromFile(file) {
  const v = parse(await file.text());
  return v && valid(v.run) ? v.run : null;
}
