// An open sky, for a level that is outdoors (its "sky" entry, see levels/nut.json):
//   zenith, horizon  colours of the dome overhead and at the edge of the world (the haze fades into the horizon colour)
//   sun              { dir: [x, y, z], color, power }: the sunlight
//   ground           { y, mat }: a plain of sand under the whole level, so the land runs on to the horizon past the level's edge
//   clouds           { count, low, high, spread, size, wind: [x, z] }: soft clouds that drift with the wind and come round again
// Clouds are drawn by code from soft round puffs (effects, not art).
import * as THREE from 'three';

const hex = c => new THREE.Color(c);

function puffTexture(seed) {
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S / 2;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 22; i++) {                       // many soft round puffs, bigger in the middle, flatter at the bottom
    const t = r(), x = S * (0.18 + 0.64 * t), w = S * (0.1 + 0.16 * (1 - Math.abs(t - 0.5) * 2) + 0.05 * r());
    const y = S / 2 * (0.62 - 0.3 * (1 - Math.abs(t - 0.5) * 2) * r());
    const grd = g.createRadialGradient(x, y, 0, x, y, w);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.6, 'rgba(250,252,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, w, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky(scene, sky, mats, centre) {
  const far = sky.far || 900;
  // the dome: a gradient from the horizon colour up to the zenith, drawn behind everything and always round you
  const dome = new THREE.Mesh(new THREE.SphereGeometry(far * 0.9, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: hex(sky.zenith) }, bot: { value: hex(sky.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; varying vec3 vP;
void main(){ float t = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(t, 0.7)), 1.0);
#include <colorspace_fragment>
}`,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  const sun = sky.sun || {};
  const light = new THREE.DirectionalLight(sun.color || 0xfff4dc, sun.power ?? 2.2);
  const d = new THREE.Vector3(...(sun.dir || [0.4, 0.8, 0.3])).normalize();
  light.position.copy(d); scene.add(light);
  scene.add(new THREE.HemisphereLight(hex(sky.zenith), 0xd8b57a, sky.fill ?? 0.9));
  // the sun's disc, far off in its own direction
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfffbe8, fog: false, depthWrite: false, transparent: true,
    map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,240,1)');
      grd.addColorStop(0.45, 'rgba(255,250,220,0.35)'); grd.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
  disc.scale.set(far * 0.12, far * 0.12, 1); disc.renderOrder = -9;
  scene.add(disc);

  if (sky.ground) {
    const m = mats[sky.ground.mat || 'sand'].clone();
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(far * 4 / 4, far * 4 / 4); m.map.needsUpdate = true; }
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(far * 4, far * 4), m);
    plain.rotation.x = -Math.PI / 2; plain.position.set(centre.x, sky.ground.y ?? -0.3, centre.z);
    scene.add(plain);
  }

  const cl = sky.clouds || {};
  const clouds = [];
  const spread = cl.spread || 300, wind = cl.wind || [1.2, 0.4];
  let seed = 4242;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const texs = [1, 2, 3, 4].map(i => puffTexture(i * 7919));
  for (let i = 0; i < (cl.count || 0); i++) {
    const size = (cl.size || 40) * (0.6 + r() * 0.9);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 4], transparent: true, depthWrite: false, opacity: 0.75 + r() * 0.25 }));
    s.scale.set(size, size / 2, 1);
    s.position.set(centre.x + (r() - 0.5) * spread * 2, (cl.low ?? 80) + r() * ((cl.high ?? 160) - (cl.low ?? 80)), centre.z + (r() - 0.5) * spread * 2);
    s.userData.k = 0.7 + r() * 0.6;                      // some drift faster than others
    scene.add(s); clouds.push(s);
  }

  return {
    update(dt, cam) {
      dome.position.copy(cam);
      disc.position.copy(cam).addScaledVector(d, far * 0.8);
      for (const s of clouds) {
        s.position.x += wind[0] * s.userData.k * dt; s.position.z += wind[1] * s.userData.k * dt;
        // gone too far downwind: comes back in on the other side
        if (s.position.x - centre.x > spread) s.position.x -= spread * 2; else if (s.position.x - centre.x < -spread) s.position.x += spread * 2;
        if (s.position.z - centre.z > spread) s.position.z -= spread * 2; else if (s.position.z - centre.z < -spread) s.position.z += spread * 2;
      }
    },
  };
}
