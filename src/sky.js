// An open sky, for a level that is outdoors (its "sky" entry, see levels/nut.json):
//   zenith, horizon  colours of the dome overhead and at the edge of the world (the haze fades into the horizon colour)
//   sun              { dir: [x, y, z], color, power }: the sunlight
//   hazeColor        the colour of the dusty air at the horizon, that far things fade into (default: the horizon colour)
//   glow             { at: [x, z] (metres), y, size, color }: a soft light that stands at that place, and a shaft of light going up from it
//   dust             { count, box, high, color }: sand blowing along the ground with the wind, round wherever you stand
//   ground           { y, mat }: a plain of sand under the whole level, so the land runs on to the horizon past the level's edge
//   clouds           { count, low, high, spread, size, wind: [x, z] }: soft clouds that drift with the wind and come round again;
//                    near: { at: [x, z] (metres), count, low, high, spread, size, speed }: more that stay close to that place
// Clouds are drawn by code: heaps of lit 3D puffs (effects, not art).
import * as THREE from 'three';

const hex = c => new THREE.Color(c);

// A cumulus cloud drawn into a picture: a heap of round billows on a flat base, its edges worn ragged by fine noise, lit like
// solid shapes by the sun (bright tops, soft blue-grey bellies and undersides). sunX: which side the light comes from (-1 left, 1 right).
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { t += a * vnoise(x * f, y * f, s + i * 17); f *= 2.1; a *= 0.5; } return t; };

// A tile of soft noise that wears the edges of each puff ragged and mottles its light.
function noiseTile() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = fbm(x / 14, y / 14, 77) * 255, i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildSky(scene, sky, mats, centre) {
  const far = sky.far || 900;
  // the dome: a gradient from the horizon colour up to the zenith, drawn behind everything and always round you
  const dome = new THREE.Mesh(new THREE.SphereGeometry(far * 0.9, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: hex(sky.zenith) }, bot: { value: hex(sky.horizon) }, sunD: { value: new THREE.Vector3(...((sky.sun || {}).dir || [0.4, 0.8, 0.3])).normalize() },
      warm: { value: hex(sky.sunGlow || sky.horizon) }, dustC: { value: hex(sky.hazeColor || sky.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunD; uniform vec3 warm; uniform vec3 dustC; varying vec3 vP;
void main(){ float t = clamp(vP.y * 1.6, 0.0, 1.0); vec3 c = mix(bot, top, pow(t, 0.7));
  c = mix(c, dustC, exp(-max(vP.y, 0.0) * 11.0));                  // dust in the air low down, all round (hazeColor: the haze fades to it)
  float s = max(dot(normalize(vP), sunD), 0.0);                    // the sky warms toward the sun
  c = mix(c, warm, pow(s, 4.0) * 0.6 + pow(s, 24.0) * 0.35);
  gl_FragColor = vec4(c, 1.0);
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
    // a plain of sand all round the level, out to the horizon. Not under the level itself: its own floor is there, and the
    // plain would lie across any hole in the ground.
    const m = mats[sky.ground.mat || 'sand'].clone();
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(far * 4 / 4, far * 4 / 4); m.map.needsUpdate = true; }
    const R = far * 2, y = sky.ground.y ?? -0.3, x0 = 0, x1 = centre.x * 2, z0 = 0, z1 = centre.z * 2;
    for (const [ax, az, bx, bz] of [[-R, -R, R + x1, z0], [-R, z1, R + x1, R + z1], [-R, z0, x0, z1], [x1, z0, R + x1, z1]]) {
      const plain = new THREE.Mesh(new THREE.PlaneGeometry(bx - ax, bz - az), m);
      plain.rotation.x = -Math.PI / 2; plain.position.set((ax + bx) / 2, y, (az + bz) / 2);
      scene.add(plain);
    }
  }

  const soft = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // ---- a light at the summit: a soft round glow, and a shaft of light going up out of it into the sky
  let glow = null;
  if (sky.glow) {
    const gc = hex(sky.glow.color || '#fff0c8'), size = sky.glow.size || 80;
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ color: gc, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.5,
      map: soft(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
        r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }) }));
    orb.position.set(sky.glow.at[0], sky.glow.y, sky.glow.at[1]); orb.scale.set(size, size, 1);
    const tall = size * 3.2;
    const shaft = new THREE.Sprite(new THREE.SpriteMaterial({ color: gc, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.3,
      map: soft(32, 128, (g, w, h) => { const img = g.createImageData(w, h), d = img.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = Math.abs(x / (w - 1) - 0.5) * 2, v = y / (h - 1);      // v = 0 at the top
          const a = Math.pow(Math.max(0, 1 - u), 2.2) * Math.pow(v, 1.6); const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255; }
        g.putImageData(img, 0, 0); }) }));
    shaft.center.set(0.5, 0); shaft.position.set(sky.glow.at[0], sky.glow.y - 2, sky.glow.at[1]); shaft.scale.set(size * 0.34, tall, 1);
    scene.add(orb, shaft);
    glow = { orb, shaft, t: 0 };
  }
  // ---- sand on the wind: specks that stream along the ground round wherever you stand, and a few thin veils of it. They thin
  // out as you climb.
  let dust = null;
  if (sky.dust) {
    const dw = (sky.clouds && sky.clouds.wind) || [1.6, 0.5], wl = Math.hypot(dw[0], dw[1]) || 1;
    const layer = (n, box, high, size, opacity) => {
      const pos = new Float32Array(n * 3), sp = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * box; pos[i * 3 + 1] = Math.random() * Math.random() * high; pos[i * 3 + 2] = (Math.random() - 0.5) * box; sp[i] = 0.6 + Math.random() * 0.8; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: hex(sky.dust.color || '#ecd6a4'), size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, fog: true,
        map: soft(32, 32, (c) => { const r = c.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 32, 32); }) });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
      return { pts, pos, sp, n, box, high, opacity };
    };
    const box = sky.dust.box || 50, high = sky.dust.high || 4;
    dust = { layers: [layer(sky.dust.count || 260, box, high, 0.16, 0.6), layer(18, box * 1.4, high * 1.6, 11, 0.07)], wx: dw[0] / wl, wz: dw[1] / wl, speed: sky.dust.speed || 7, t: 0, floor: (sky.ground && sky.ground.y) || 0 };
  }

  // ---- clouds: each one a heap of soft round puffs in 3D (twenty to thirty of them), wider and darker at the base, piled
  // higher over one spot, and lit by the sun on the side that faces it. They look solid from any side, even up among them.
  const cl = sky.clouds || {};
  const spread = cl.spread || 300, wind = cl.wind || [1.2, 0.4];
  let seed = 4242;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const clouds = [], puffs = [];
  // Two sets: the sky's clouds, spread far and wide; and ("near") clouds that keep close to one place, such as a tower: each
  // drifts across it on the wind and comes round again, so they pass in front of it, behind it and through it.
  const sets = [{ n: cl.count || 0, cx: centre.x, cz: centre.z, sp: spread, low: cl.low ?? 80, high: cl.high ?? 160, size: cl.size || 40, k: 1 }];
  if (cl.near) sets.push({ n: cl.near.count || 0, cx: cl.near.at[0], cz: cl.near.at[1], sp: cl.near.spread || 50, low: cl.near.low ?? 60,
    high: cl.near.high ?? 150, size: cl.near.size || 30, k: cl.near.speed ?? 0.6 });
  const plan = [];
  for (const st of sets) for (let i = 0; i < st.n; i++) plan.push(st);
  for (let i = 0; i < plan.length; i++) {
    const st = plan[i];
    const size = st.size * (0.6 + r() * 0.9), H = size * 0.42;
    clouds.push({ x: st.cx + (r() - 0.5) * st.sp * 2, y: st.low + r() * (st.high - st.low), z: st.cz + (r() - 0.5) * st.sp * 2, k: (0.7 + r() * 0.6) * st.k, cx: st.cx, cz: st.cz, sp: st.sp });
    const n = Math.round(16 + size / 5 + r() * 8), px = (r() - 0.5) * 0.4, pz = (r() - 0.5) * 0.4;      // px, pz: where its heap is highest
    for (let j = 0; j < n; j++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r());
      const ox = Math.cos(a) * dd * 0.55, oz = Math.sin(a) * dd * 0.34;
      const hump = Math.max(0, 1 - Math.hypot(ox - px * 0.55, oz - pz * 0.34) / 0.6);
      const oy = j < n * 0.35 ? r() * 0.08 : r() * hump * hump;                 // a third of them make the flat base
      const rad = size * (0.11 + 0.11 * hump) * (0.75 + 0.5 * r()) * (1 - 0.3 * oy);
      puffs.push({ c: i, ox: ox * size, oy: oy * H, oz: oz * size, size: rad * 2, shade: 0.55 + 0.45 * oy + 0.1 * r(), seed: r() });
    }
  }
  const N = puffs.length, pos = new Float32Array(N * 3), aSize = new Float32Array(N), aShade = new Float32Array(N), aSeed = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const attr = (name, arr, k) => { const b = new THREE.BufferAttribute(arr, k); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, b); return b; };
  const bPos = attr('position', pos, 3), bSize = attr('aSize', aSize, 1), bShade = attr('aShade', aShade, 1), bSeed = attr('aSeed', aSeed, 1);
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uScale: { value: 300 }, uHaze: { value: sky.haze ?? 0.004 }, uNoise: { value: noiseTile() }, uSunV: { value: new THREE.Vector3() },
      uLit: { value: hex('#fffdf6') }, uShadow: { value: hex(cl.shadow || '#8fb4bf') }, uFog: { value: hex(sky.horizon) } },
    vertexShader: `attribute float aSize; attribute float aShade; attribute float aSeed;
uniform float uScale; uniform float uHaze; varying float vShade; varying float vSeed; varying float vFog;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.5); vShade = aShade; vSeed = aSeed;
  float fd = uHaze * length(mv.xyz); vFog = 1.0 - exp(-fd * fd); }`,
    fragmentShader: `uniform sampler2D uNoise; uniform vec3 uSunV; uniform vec3 uLit; uniform vec3 uShadow; uniform vec3 uFog;
varying float vShade; varying float vSeed; varying float vFog;
void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y; float r2 = dot(p, p); if (r2 > 1.0) discard;
  float n = texture2D(uNoise, gl_PointCoord * 0.55 + vec2(vSeed, vSeed * 1.7)).r;
  float a = smoothstep(1.0, 0.42, r2 + (n - 0.5) * 0.6); if (a < 0.01) discard;
  vec3 nrm = vec3(p, sqrt(max(0.0, 1.0 - r2)));
  float l = clamp(dot(nrm, uSunV) * 0.5 + 0.5, 0.0, 1.0) * 0.85 + (n - 0.5) * 0.3;
  vec3 col = mix(uShadow, uLit, clamp(l * vShade + 0.12, 0.0, 1.0));
  gl_FragColor = vec4(mix(col, uFog, vFog), a * 0.94);
#include <colorspace_fragment>
}`,
  });
  const cloudPts = new THREE.Points(geo, cloudMat);
  cloudPts.frustumCulled = false; cloudPts.renderOrder = 1;
  if (N) scene.add(cloudPts);
  const order = puffs.map((_, i) => i), depth = new Float32Array(N), fwd = new THREE.Vector3();
  // The puffs are drawn far to near (sorted by distance every frame), so the near ones cover the far ones properly.
  function layout(camera) {
    camera.getWorldDirection(fwd);
    const cp = camera.position;
    for (let i = 0; i < N; i++) {
      const q = puffs[i], c = clouds[q.c];
      q.x = c.x + q.ox; q.y = c.y + q.oy; q.z = c.z + q.oz;
      depth[i] = (q.x - cp.x) * fwd.x + (q.y - cp.y) * fwd.y + (q.z - cp.z) * fwd.z;
    }
    order.sort((a, b) => depth[b] - depth[a]);
    for (let k = 0; k < N; k++) {
      const q = puffs[order[k]];
      pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z; aSize[k] = q.size; aShade[k] = q.shade; aSeed[k] = q.seed;
    }
    bPos.needsUpdate = bSize.needsUpdate = bShade.needsUpdate = bSeed.needsUpdate = true;
  }

  return {
    update(dt, camera, heightPx) {
      const cam = camera.position;
      dome.position.copy(cam);
      disc.position.copy(cam).addScaledVector(d, far * 0.8);
      if (glow) { glow.t += dt; const b = 0.85 + 0.15 * Math.sin(glow.t * 0.5); glow.orb.material.opacity = 0.5 * b; glow.shaft.material.opacity = 0.3 * b; }
      if (dust) {
        dust.t += dt;
        const gust = 0.7 + 0.5 * Math.sin(dust.t * 0.31) * Math.sin(dust.t * 0.13 + 1.0), thin = Math.max(0, 1 - Math.max(0, cam.y - 2) / 28);
        for (const L of dust.layers) {
          L.pts.material.opacity = L.opacity * thin; L.pts.visible = thin > 0.01;
          if (!L.pts.visible) continue;
          const p = L.pos, half = L.box / 2;
          for (let i = 0; i < L.n; i++) {
            const v = dust.speed * L.sp[i] * gust * dt;
            p[i * 3] += dust.wx * v; p[i * 3 + 2] += dust.wz * v; p[i * 3 + 1] += Math.sin(dust.t * 2 + i) * 0.3 * dt;
            // keep them in a box round the camera: one that leaves on one side comes in on the other
            let rx = p[i * 3] - cam.x, rz = p[i * 3 + 2] - cam.z;
            if (rx > half) p[i * 3] -= L.box; else if (rx < -half) p[i * 3] += L.box;
            if (rz > half) p[i * 3 + 2] -= L.box; else if (rz < -half) p[i * 3 + 2] += L.box;
            if (p[i * 3 + 1] < 0.05 || p[i * 3 + 1] > L.high) p[i * 3 + 1] = 0.05 + Math.random() * Math.random() * L.high;
          }
          L.pts.geometry.attributes.position.needsUpdate = true;
        }
      }
      for (const c of clouds) {
        c.x += wind[0] * c.k * dt; c.z += wind[1] * c.k * dt;
        // gone too far downwind: comes back in on the other side
        if (c.x - c.cx > c.sp) c.x -= c.sp * 2; else if (c.x - c.cx < -c.sp) c.x += c.sp * 2;
        if (c.z - c.cz > c.sp) c.z -= c.sp * 2; else if (c.z - c.cz < -c.sp) c.z += c.sp * 2;
      }
      if (!N) return;
      camera.updateMatrixWorld();
      cloudMat.uniforms.uScale.value = heightPx * camera.projectionMatrix.elements[5] / 2;      // pixels across for one metre, one metre away
      cloudMat.uniforms.uSunV.value.copy(d).transformDirection(camera.matrixWorldInverse);       // the sun's direction as the camera sees it
      layout(camera);
    },
  };
}
