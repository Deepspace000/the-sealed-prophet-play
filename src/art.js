// Pictures made in Blender (see tools/blender): things, the weapon held in a hand, and creatures.
// art/manifest.json lists what there is (tools/art_manifest.py writes it). Anything not listed falls back to a
// code-drawn stand-in, so the game runs with any picture missing.
//   art/items/<item id>.png             a thing, in the pack and lying in the level
//   art/held/<item id>.png, fist.png    a right hand holding that weapon, seen by the player. The fist is at HELD_AT.
//   art/creatures/<creature id>_<pose>.png   poses: idle, step, windup, strike, dead
export const art = { items: {}, held: {}, creatures: {} };
export const HELD_AT = [176 / 384, 200 / 384];      // where the middle of the fist is in a held picture, from its top left corner

export async function loadArt(onProgress = () => {}) {
  let m;
  try { m = await (await fetch('art/manifest.json')).json(); } catch (e) { return; }
  const load = src => new Promise(done => {
    const im = new Image();
    im.onload = () => done(im); im.onerror = () => done(null);
    im.src = src;
  });
  const jobs = []; let done = 0, total = 0;
  const tick = () => onProgress(++done / total);
  for (const kind of Object.keys(art)) {
    for (const name of m[kind] || []) jobs.push(load(`art/${kind}/${name}.png?v=${m.v}`).then(im => { if (im) art[kind][name] = im; tick(); }));
  }
  total = jobs.length;
  await Promise.all(jobs);
}
