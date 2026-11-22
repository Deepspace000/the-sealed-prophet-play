// 3D models made by other people (see CREDITS.md): statues, pillars and other pieces of scenery.
// tools/blender/models.py turns a downloaded file into art/models/<name>.json (the shape) and a small texture.
// A level uses one as a prop:  { "id": "model", "name": "tomb_pillar", "cell": [column, row], "at": [east, south],
//                                "size": height in metres, "turn": 0..1, "solid": radius in metres (0 = walk through),
//                                "wide": makes it thinner or fatter without changing its height (1 if left out),
//                                "fire": true = a fire burns on top of it and lights the room (a brazier) }
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
