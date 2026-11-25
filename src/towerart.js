// The outer walls of the White Tower of Nut, and its stained glass.
// Mirko: smooth, magnificent, covered with large hieroglyphs, all different, not repeats. So the walls are smooth white marble,
// written in columns of big signs inlaid in gold. The signs are real ones (256 of them, drawn from the Egyptian Hieroglyphs of
// Unicode by tools/make_glyphs.py into art/tower_glyphs.png), and the shader picks one for each place on each wall from where it
// stands, so the writing never repeats in a pattern. After a critic's notes: about a third of the places are left bare, in runs,
// so the writing has rhythm; now and then one sign is four times the size; each tier has a foot of dark lapis and a cornice of
// gold; the gold is deep, and each sign is set at its own slight tilt so they flash in the sun one after another as you move;
// the shaded sides are cool blue; far off the signs fade into the marble (the tower is calm from the desert, and written all over
// when you stand under it); and it pales into the sky toward its top.
import * as THREE from 'three';

const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let glyphs = null;
const glyphTex = () => glyphs || (glyphs = (() => {
  const t = new THREE.TextureLoader().load('art/tower_glyphs.png');
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
})());
const f2 = v => v.toFixed(2);

// seed: which writing. y0, y1: the foot and the top of this tier (metres). col: metres per column of writing (the width of a
// cell, so columns meet the corners), row: metres per sign, rows: signs between two plain bands, band: the plain band's height.
// giant: which run of writing (counted from the foot) holds the colossal sign in the middle of each main face (-1: none).
// centre: the middle of the tower, in metres (the writing is laid out from it, so each main face is the same either side).
function writtenWall({ seed, y0, y1, giant = -1, centre = [111, 85], col = 2.0, row = 2.4, rows = 6, band = 1.2, sun = [0.35, 0.6, 0.72], haze = '#bfeee6' }) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const PER = rows * row + band, DADO = 2.0, CORN = 3.0;
  m.onBeforeCompile = sh => {
    sh.uniforms.glyphs = { value: glyphTex() };
    sh.uniforms.gSeed = { value: seed };
    sh.uniforms.gSun = { value: new THREE.Vector3(...sun).normalize() };
    sh.uniforms.gHaze = { value: new THREE.Color(haze) };
    sh.vertexShader = `varying vec3 vWP;
varying vec3 vWN;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = `varying vec3 vWP;
varying vec3 vWN;
uniform sampler2D glyphs;
uniform float gSeed;
uniform vec3 gSun;
uniform vec3 gHaze;
float gGold = 0.0;
float gGlint = 0.0;
const float GIANT = ${f2(giant)}, COL = ${f2(col)}, ROW = ${f2(row)}, PER = ${f2(PER)}, TEXT = ${f2(rows * row)}, Y0 = ${f2(y0 + DADO + 0.2)}, Y1 = ${f2(y1 - CORN - 0.5)};
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + gSeed); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec2 glyph(float id, vec2 q, float flip, vec2 g) {
  if (flip > 0.5) q.x = 1.0 - q.x;
  if (q.x < 0.004 || q.x > 0.996 || q.y < 0.004 || q.y > 0.996) return vec2(0.0);
  vec2 uv = vec2((mod(id, 16.0) + q.x) / 16.0, 1.0 - (floor(id / 16.0) + 1.0 - q.y) / 16.0);
  return textureGrad(glyphs, uv, dFdx(g), dFdy(g)).rg;
}
// The sign at a point on a wall: x = its solid shape, y = its cut lines, z = 1 in a great sign (four places in one) and 2 in
// a colossal one, w = a number for the sign (for its tilt). h: metres along the wall from the middle of the tower, face: 0 to 3.
vec4 sign_at(float h, float y, float face) {
  if (y < Y0 || y > Y1) return vec4(0.0);
  float yy = mod(y - Y0, PER);
  if (yy > TEXT) return vec4(0.0);                                  // the plain band
  float c = floor(h / COL), r = floor(yy / ROW), k = floor((y - Y0) / PER);
  if (k == GIANT && r < 4.0 && abs(h - 1.0) < 4.0) {                 // the colossal sign in the middle of a main face: 6.4 m
    float SZ = 6.4;
    vec2 q = vec2((h - 1.0 + SZ * 0.5) / SZ, (yy - (4.0 * ROW - SZ) * 0.5) / SZ);
    float id = floor(h21(vec2(face * 5.3 + 1.1, 77.7)) * 256.0);
    vec2 gl = glyph(id, q, 0.0, vec2(h, y) / SZ / 16.0);
    return vec4(smoothstep(0.42, 0.58, gl.x), smoothstep(0.3, 0.7, gl.y), 2.0, 0.5);      // (drawn large: its edge is sharpened)
  }
  vec2 B = vec2(floor(c / 2.0), floor(r / 2.0));                     // a block of four places
  float flip = step(0.5, h21(vec2(B.x * 3.3 + k, 9.1)));             // the writing reads one way or the other
  if (h21(B * vec2(1.7, 2.3) + k * 13.1 + 0.5) < 0.14) {             // a great sign fills the block
    float SZ = ROW * 1.72;
    vec2 q = vec2((h - B.x * 2.0 * COL - (2.0 * COL - SZ) * 0.5) / SZ, (yy - B.y * 2.0 * ROW - ROW * 0.14) / SZ);
    float id = floor(h21(B * vec2(5.1, 7.7) + k * 3.9) * 256.0);
    vec2 gl = glyph(id, q, flip, vec2(h, y) / SZ / 16.0);
    return vec4(smoothstep(0.38, 0.62, gl.x), gl.y, 1.0, h21(B + k));
  }
  if (h21(vec2(c * 1.31 + k * 5.1, floor(r / 3.0) * 3.7 + 2.0)) < 0.34) return vec4(0.0);     // bare, three rows at a time
  float SZ = ROW * 0.76;                                           // the sign's square, in metres, standing on its row
  vec2 q = vec2((h - c * COL - (COL - SZ) * 0.5) / SZ, (yy - r * ROW - ROW * 0.1) / SZ);
  float id = floor(h21(vec2(c * 1.618 + k * 31.7, r * 2.414 + k * 7.1)) * 256.0);
  return vec4(glyph(id, q, flip, vec2(h, y) / SZ / 16.0), 0.0, h21(vec2(c, r) + k * 0.37));
}
` + sh.fragmentShader.replace('#include <map_fragment>', `
  {
    bool ew = abs(vWN.x) > abs(vWN.z);
    // along the wall, left to right as you face it, from the middle of the tower (+1: the columns' edges fall on the cells' edges)
    float h = (ew ? (vWP.z - ${f2(centre[1])}) * sign(vWN.x) : -(vWP.x - ${f2(centre[0])}) * sign(vWN.z)) + 1.0;
    float face = ew ? (vWN.x > 0.0 ? 0.0 : 1.0) : (vWN.z > 0.0 ? 2.0 : 3.0);
    float y = vWP.y;
    bool top = abs(vWN.y) > 0.5;                                    // (the top of a wall: plain stone)
    float dist = length(cameraPosition - vWP);
    // smooth white marble: a soft cloud in it and a few faint grey veins, no joints
    float cl = vn(vec2(h, y) * 0.07) * 0.6 + vn(vec2(h, y) * 0.23) * 0.4;
    float vein = smoothstep(0.035, 0.0, abs(vn(vec2(h * 0.18 + y * 0.05, y * 0.11)) - 0.5)) * 0.06;
    vec3 stone = vec3(0.80, 0.775, 0.72) * (0.94 + 0.08 * cl) - vein;
    vec4 s = top ? vec4(0.0) : sign_at(h, y, face);
    float shd = top ? 0.0 : sign_at(h - 0.05, y + 0.06, face).x * (1.0 - s.x);      // the sign is sunk: its edge throws a little shadow
    // far off the small signs fade into the marble (the great ones less), so the tower is calm from the desert
    float see = mix(1.0, s.z > 1.5 ? 1.0 : mix(0.32, 0.9, s.z), smoothstep(40.0, 130.0, dist));
    // the plain band between two runs of writing, edged with gold; fine lines between the columns
    float yy = mod(y - Y0, PER);
    bool written = !top && y > Y0 && y < Y1;
    float rule = written ? max(step(abs(yy - TEXT - 0.12), 0.07), step(abs(yy - PER + 0.12), 0.07)) : 0.0;
    float cx = fract(h / COL);
    float colLine = (written && yy < TEXT && s.z < 0.5) ? step(min(cx, 1.0 - cx) * COL, 0.022) * 0.45 * see : 0.0;
    float sheen = 0.84 + 0.24 * vn(vec2(h * 1.7, y * 1.7)) + 0.10 * fract(yy / ROW);
    vec3 gold = vec3(0.66, 0.43, 0.08) * sheen;
    gold = mix(gold, vec3(0.20, 0.11, 0.02), s.y * 0.9);             // the drawing cut into it
    vec3 col = stone * (1.0 - shd * 0.4 * see);
    col = mix(col, vec3(0.64, 0.44, 0.10), max(rule, colLine));
    col = mix(col, gold, s.x * see);
    gGold = max(s.x * see, rule);
    // the foot of the tier: dark lapis under a line of gold. Its top: a cornice of gold, darker underneath.
    float keep = 0.0;                                               // the dark parts keep their colour up in the haze
    if (!top) {
      float yd = y - ${f2(y0)}, yc = ${f2(y1)} - y;
      if (yd >= 0.0 && yd < ${f2(DADO)}) {                            // dark at the ground, lapis by its top
        col = mix(vec3(0.012, 0.022, 0.07), vec3(0.04, 0.075, 0.21), smoothstep(0.0, 1.5, yd)) * (0.85 + 0.3 * cl); gGold = 0.0; keep = 1.0;
        ${y0 < 1 ? 'col = mix(col, vec3(0.62, 0.50, 0.30), 0.3 * (1.0 - yd / 2.0));     // sand blown against it' : ''}
      }
      if (yd >= ${f2(DADO)} && yd < ${f2(DADO + 0.3)}) { col = vec3(0.64, 0.44, 0.10); gGold = 1.0; }
      if (yc >= 0.0 && yc < ${f2(CORN)}) { col = vec3(0.70, 0.50, 0.15) * (0.86 + 0.24 * smoothstep(0.0, ${f2(CORN)}, yc)); gGold = 1.0; }
      if (yc >= 0.9 && yc < 1.5) { col = vec3(0.045, 0.10, 0.30); gGold = 0.0; keep = 1.0; }                 // a stripe of lapis in the cornice
      if (yc >= ${f2(CORN)} && yc < ${f2(CORN + 0.4)}) { col = vec3(0.12, 0.075, 0.015); gGold = 0.0; keep = 1.0; }      // its dark underside
    }
    // the gold glints: each sign is set at its own slight tilt, so they catch the sun one after another as you move
    vec3 tang = ew ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 n2 = normalize(vWN + 0.42 * ((s.w - 0.5) * tang + (fract(s.w * 17.3) - 0.5) * vec3(0.0, 1.0, 0.0)));
    vec3 hv = normalize(normalize(cameraPosition - vWP) + gSun);
    float lit = smoothstep(0.0, 0.15, dot(vWN, gSun));
    gGlint = lit * (pow(max(dot(n2, hv), 0.0), 60.0) * 2.4 * gGold * (1.0 - s.y) + pow(max(dot(vWN, hv), 0.0), 80.0) * 0.10);
    // the sides the sun does not reach are cool and blue, not grey
    col *= mix(mix(vec3(0.66, 0.70, 0.98), vec3(1.18, 1.05, 0.82), gGold), vec3(1.0), lit);       // (the gold keeps its own colour)
    // the height of it: it pales and blues toward the top, into the sky (the gold much less: it must still read up there)
    col = mix(col, gHaze, clamp((y - 30.0) / 150.0, 0.0, 1.0) * mix(0.36, 0.08, max(gGold, keep)));
    diffuseColor.rgb *= col;
  }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * gGold * 0.14 + vec3(1.0, 0.86, 0.5) * gGlint;`).replace('#include <opaque_fragment>', `
  outgoingLight = 1.0 - exp(-outgoingLight * 1.25);      // a soft shoulder: full sun on white marble stays just under white, and gold stays gold
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'tower' + seed;
  return m;
}

// sky: the level's "sky" (the sun's direction, for the glint of the gold). tiers: the heights of the foot of the tower and
// the tops of its three tiers.
export function towerMaterials(sky = {}, tiers = [0, 46, 86, 140]) {
  const sun = sky.sun && sky.sun.dir || undefined;
  return {
    towerEye: writtenWall({ seed: 1.0, y0: tiers[0], y1: tiers[1], sun, giant: 2 }),             // the base
    towerWings: writtenWall({ seed: 2.0, y0: tiers[1], y1: tiers[2], sun, giant: 1 }),           // the middle tier
    towerNut: writtenWall({ seed: 3.0, y0: tiers[2], y1: tiers[3], sun }),                       // the top
  };
}

// ---- stained glass: bands of coloured light in heavy lead, each with an Egyptian figure, glowing at the middle ----
export function glassTexture(seed = 1) {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rng(seed * 31 + 7);
  const deep = ['#0e3a5a', '#5a0b16', '#2a1258', '#0b4a4a', '#13306e', '#3a0a2a'];
  for (let i = 0; i < 16; i++) {                                        // small panes of deep colour, now and then amber
    const y = i * 16;
    for (let j = 0; j < 2; j++) {
      g.fillStyle = rnd() < 0.16 ? '#d08a1a' : deep[Math.floor(rnd() * deep.length)];
      g.fillRect(j * 32, y, 32, 16);
    }
  }
  const glow = g.createRadialGradient(32, H / 2, 4, 32, H / 2, 90);     // the middle glows, as if the sun stood behind it
  glow.addColorStop(0, 'rgba(255,208,112,0.55)'); glow.addColorStop(1, 'rgba(255,208,112,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const fig = (kind, cy) => {                                           // a figure, leaded, with a lighter stripe down it, a halo behind
    const halo = g.createRadialGradient(32, cy, 2, 32, cy, 30); halo.addColorStop(0, 'rgba(255,224,150,0.6)'); halo.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = halo; g.fillRect(0, cy - 32, W, 64);
    const shape = () => {
      g.beginPath();
      if (kind === 0) { g.ellipse(32, cy - 12, 9, 11, 0, 0, 7); g.moveTo(29, cy - 2); g.rect(29, cy - 2, 6, 26); g.rect(18, cy + 3, 28, 6); }          // ankh
      else if (kind === 1) { g.ellipse(32, cy + 3, 13, 17, 0, 0, 7); g.moveTo(40, cy - 18); g.arc(32, cy - 18, 8, 0, 7); }                            // scarab
      else if (kind === 2) { g.arc(32, cy, 17, 0, 7); }                                                                                              // sun disc
      else { g.rect(29, cy - 26, 6, 52); for (let k = 0; k < 4; k++) g.rect(19, cy - 20 + k * 8, 26, 4); }                                           // djed
    };
    shape(); g.fillStyle = ['#c8901e', '#1e3c8a', '#a0180e', '#c8901e'][kind]; g.fill('evenodd');
    g.save(); shape(); g.clip(); g.fillStyle = 'rgba(255,240,200,0.35)'; g.fillRect(28, cy - 30, 4, 60); g.restore();       // the lighter stripe
    shape(); g.lineWidth = 3; g.strokeStyle = '#0a0604'; g.stroke();                                                         // its lead
  };
  for (let i = 0; i < 4; i++) fig((i + seed) % 4, 32 + i * 64);
  g.strokeStyle = '#0a0604'; g.lineWidth = 3;                           // the lead of the panes
  for (let y = 0; y <= H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (const x of [1.5, 32, W - 1.5]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
