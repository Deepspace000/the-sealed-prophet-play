// Pictures made in Blender (see tools/blender): things, the weapon held in a hand, and creatures.
// art/manifest.json lists what there is (tools/art_manifest.py writes it). Anything not listed falls back to a
// code-drawn stand-in, so the game runs with any picture missing.
//   art/items/<item id>.png             a thing, in the pack and lying in the level
//   art/held/<item id>.png, fist.png    a right hand holding that weapon, seen by the player. The fist is at HELD_AT.
//   art/creatures/<creature id>_<pose>.png   poses: idle, step, windup, strike, dead
//   art/people/<person id>.png          someone you can speak to, standing (painted: tools/make_person_art.py)
//   art/walls/<name>.jpg                the stone of the levels, painted (tools/make_walls.py): wall, floor, ceil, hiero, hiero2,
//                                       white, whiteplain, sand; <name>_2, _3 ... are variants of it; door, door_open: the false door
export const art = { items: {}, held: {}, creatures: {}, walls: {}, people: {} };
export const HELD_AT = [176 / 384, 200 / 384];      // where the middle of the fist is in a held picture, from its top left corner

// wantWall(kind): only the stone a level uses is fetched (there are over fifty pictures of it).
export async function loadArt(onProgress = () => {}, wantWall = () => true) {
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
    for (const name of m[kind] || []) if (kind !== 'walls' || wantWall(name.replace(/(_\d+)?(_open)?$/, ''))) jobs.push(load(`art/${kind}/${name}.${kind === 'walls' ? 'jpg' : 'png'}?v=${m.v}`).then(im => { if (im) art[kind][name] = im; tick(); }));
  }
  total = jobs.length;
  await Promise.all(jobs);
}
