// 3D models made by other people (see CREDITS.md): statues, pillars and other pieces of scenery.
// tools/blender/models.py turns a downloaded file into art/models/<name>.json (the shape) and a small texture.
// A level uses one as a prop:  { "id": "model", "name": "tomb_pillar", "cell": [column, row], "at": [east, south],
//                                "size": height in metres, "turn": 0..1, "solid": radius in metres (0 = walk through),
//                                "wide": makes it thinner or fatter without changing its height (1 if left out),
//                                "fire": true = a fire burns on top of it and lights the room (a brazier),
//                                "walk": [floor, post] = you can walk on it and through it (see walkGrid, below) }
import * as THREE from 'three';

const models = {}, textures = {};

function texture(file) {
  if (!textures[file]) {
    const t = textures[file] = new THREE.TextureLoader().load('art/models/' + file);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return textures[file];
}

// Fetch the models a level needs. A missing one is left out, and the level still loads.
export async function loadModels(names) {
  await Promise.all([...new Set(names)].filter(n => !(n in models)).map(async name => {
    models[name] = null;
    try {
      const d = await (await fetch(`art/models/${name}.json`)).json();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      geo.setIndex(d.idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
      if (d.tex) mat.map = texture(d.tex); else if (d.colour) mat.color.setRGB(d.colour[0], d.colour[1], d.colour[2]);
      if (d.tex && d.tint) mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2]);       // the author's own darkening of the picture
      models[name] = { geo, mat, size: d.size };
    } catch (e) { console.warn('No model called', name); }
  }));
}

// A model you walk on and through, not round (a ruin: a stone floor with steps up to it, columns standing on it).
// (Mirko: you must be able to walk through the ruins; a ring round the whole thing was an invisible wall.)
// The shape itself says where you can go. Looked at from above, in squares of 25 cm: the highest stone no more than "floor"
// metres above the model's foot is ground to stand on (the base, its steps); a square with stone between "floor" and "post"
// metres up is a column or a block, and you cannot enter it. Stone higher than "post" is over your head (a lintel).
// mesh: the model, already in its place. Returns { at(x, z): the ground there (Infinity in a column, -Infinity off the model) }.
export function walkGrid(mesh, floor, post) {
  mesh.updateMatrixWorld(true);
  const C = 0.25, pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array, v = new THREE.Vector3();
  const P = new Float32Array(pos.count * 3), base = mesh.position.y;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
  }
  const W = Math.floor((x1 - x0) / C) + 1, H = Math.floor((z1 - z0) / C) + 1, top = new Float32Array(W * H).fill(-Infinity);
  for (let t = 0; t < idx.length; t += 3) {      // points all over each triangle, closer together than the squares
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const far = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]), Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]));
    const n = Math.max(1, Math.ceil(far / (C * 0.4)));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, w = j / n, y = P[a + 1] + (P[b + 1] - P[a + 1]) * u + (P[c + 1] - P[a + 1]) * w - base;
      if (y > post) continue;
      const x = P[a] + (P[b] - P[a]) * u + (P[c] - P[a]) * w, z = P[a + 2] + (P[b + 2] - P[a + 2]) * u + (P[c + 2] - P[a + 2]) * w;
      const k = Math.floor((z - z0) / C) * W + Math.floor((x - x0) / C);
      if (y > floor) top[k] = Infinity; else if (y + base > top[k]) top[k] = y + base;
    }
  }
  return { at(x, z) {
    const cx = Math.floor((x - x0) / C), cz = Math.floor((z - z0) / C);
    return cx < 0 || cz < 0 || cx >= W || cz >= H ? -Infinity : top[cz * W + cx];
  } };
}

// A copy of a model to put in the scene, standing on y = 0, or null. size: how tall to make it, in metres.
export function modelMesh(name, size) {
  const m = models[name];
  if (!m) return null;
  const mesh = new THREE.Mesh(m.geo, m.mat), k = size ? size / (m.size[1] || 1) : 1;
  mesh.scale.setScalar(k);
  mesh.userData.radius = Math.max(m.size[0], m.size[2]) * k / 2;
  mesh.userData.height = m.size[1] * k;
  return mesh;
}
