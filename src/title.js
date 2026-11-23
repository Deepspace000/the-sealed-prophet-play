// The game's title, drawn as if written in blood. Each letter is a few brush strokes (the shapes are in G below), drawn as SVG:
// a dark under-stroke for the thick wet edge, the red body, a thin bright highlight for the gloss, then a rough, wobbling edge
// from a turbulence filter, a specular "wet" shine, drips that run down from the letters, and a few splashes.
// It runs as a plain script and fills <h1 id="bloodTitle">. Nothing is downloaded: it is all drawn here.
(function () {
  const host = document.getElementById('bloodTitle');
  if (!host) return;
  // Each letter: [width, strokes]. Strokes are SVG path data in a box 100 high, drawn with a round brush. Slightly uneven, like a hand.
  const G = {
    T: [62, ['M0,8 C20,3 42,6 62,2', 'M31,6 C30,40 33,70 31,100']],
    H: [60, ['M4,0 C3,34 1,70 3,100', 'M56,2 C57,36 58,70 56,98', 'M4,50 C22,46 40,52 56,47']],
    E: [54, ['M7,3 C6,36 3,68 5,100', 'M7,4 C22,0 38,4 52,1', 'M7,50 C20,47 32,51 44,48', 'M5,98 C22,101 38,97 53,100']],
    S: [56, ['M52,16 C46,-2 8,-2 8,25 C8,52 52,46 52,74 C52,103 8,102 3,80']],
    A: [60, ['M2,100 C12,66 20,34 29,2', 'M29,2 C38,36 48,68 58,100', 'M13,68 C26,64 38,70 47,66']],
    L: [52, ['M6,0 C5,34 3,68 5,100', 'M5,99 C20,96 36,101 50,98']],
    D: [66, ['M6,3 C5,36 3,68 5,100', 'M6,2 C74,-2 74,100 5,98']],
    P: [58, ['M6,0 C5,34 3,68 5,100', 'M6,2 C60,-3 62,56 6,54']],
    R: [60, ['M6,0 C5,34 3,68 5,100', 'M6,2 C60,-3 62,56 6,54', 'M26,55 C36,68 46,84 58,100']],
    O: [66, ['M33,2 C-10,0 -8,100 33,98 C74,100 76,0 33,2']],
  };
  // where a drip may start from each letter (the low ends of the strokes)
  const DRIP = { T: [[31, 100]], H: [[3, 99], [56, 98]], E: [[5, 99], [30, 100]], S: [[3, 80], [30, 101]], A: [[2, 100], [58, 100]], L: [[5, 99], [28, 99]],
    D: [[5, 99], [38, 98]], P: [[5, 100]], R: [[5, 100], [58, 100]], O: [[33, 98]] };
  const LINES = ['THE SEALED', 'PROPHET'];
  const GAP = 15, SPACE = 44, TALL = 1.34, LH = 100 * TALL + 70, TOP = 14;      // TALL stretches the letters upward
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const wid = line => [...line].reduce((w, c) => w + (c === ' ' ? SPACE : G[c][0] + GAP), -GAP);
  const W = Math.max(...LINES.map(wid)) + 40, H = TOP + LH * LINES.length - 10;
  let under = '', body = '', shine = '', drips = '', splash = '', n = 0;

  LINES.forEach((line, row) => {
    let x = (W - wid(line)) / 2;
    const y = TOP + row * LH;
    for (const c of line) {
      if (c === ' ') { x += SPACE; continue; }
      const [w, strokes] = G[c], slant = -0.06;
      const tf = `translate(${x.toFixed(1)} ${y}) skewX(${(-slant * 57).toFixed(1)}) scale(1 ${TALL})`;
      for (const d of strokes) {
        under += `<path d="${d}" transform="${tf}"/>`;
        body += `<path d="${d}" transform="${tf}"/>`;
        shine += `<path d="${d}" transform="${tf} translate(-2.2 -1.8)"/>`;
      }
      for (const [dx, dy] of DRIP[c]) {
        if (rnd() < 0.32) continue;
        const len = 16 + rnd() * 60, r = 3 + rnd() * 2.4, px = x + dx + (dy - 50) * slant * -1 * 0.0, py = y + dy * TALL - 1;
        const cls = `style="animation-delay:${(2.4 + rnd() * 4).toFixed(2)}s"`;
        // the drip: a thin run that swells to a bead at the bottom
        drips += `<g class="btDrip" ${cls}><path d="M${px.toFixed(1)},${py} L${(px + (rnd() - .5) * 1.5).toFixed(1)},${(py + len).toFixed(1)}" stroke-width="${(r * 1.15).toFixed(1)}"/>`
          + `<circle cx="${(px + 0.2).toFixed(1)}" cy="${(py + len + r * 0.4).toFixed(1)}" r="${(r * 1.05).toFixed(1)}"/></g>`;
      }
      x += w + GAP; n++;
    }
  });
  // Stains: big uneven pools and smears soaked into the page behind the words, and a few heavier splashes.
  let stains = '';
  const blob = (cx, cy, rad, k) => {
    const pts = [], m = 14, ph = rnd() * 6;
    for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, q = rad * (0.62 + 0.5 * rnd() + 0.12 * Math.sin(a * 3 + ph)); pts.push([cx + Math.cos(a) * q * k, cy + Math.sin(a) * q]); }
    let d = `M${((pts[0][0] + pts[m - 1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[m - 1][1]) / 2).toFixed(1)}`;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; d += ` Q${a[0].toFixed(1)},${a[1].toFixed(1)} ${((a[0] + b[0]) / 2).toFixed(1)},${((a[1] + b[1]) / 2).toFixed(1)}`; }
    return d + 'Z';
  };
  for (let i = 0; i < 7; i++) {
    const cx = W * (0.08 + rnd() * 0.84), cy = TOP + rnd() * (LH * LINES.length - 40), rad = 22 + rnd() * 46;
    stains += `<path d="${blob(cx, cy, rad, 1.5)}" fill="#5c0807" opacity="${(0.28 + rnd() * 0.3).toFixed(2)}"/>`;
    stains += `<path d="${blob(cx + 5, cy + 4, rad * 0.5, 1.3)}" fill="#8a0d0a" opacity="${(0.3 + rnd() * 0.25).toFixed(2)}"/>`;
    for (let j = 0; j < 4; j++) { const a = rnd() * 6.28, dd = rad * (1.2 + rnd()); stains += `<circle cx="${(cx + Math.cos(a) * dd * 1.4).toFixed(1)}" cy="${(cy + Math.sin(a) * dd).toFixed(1)}" r="${(1.2 + rnd() * 3.4).toFixed(1)}" fill="#6b0a08" opacity=".7"/>`; }
  }
  for (let i = 0; i < 3; i++) {                        // a dragged smear
    const sx = W * (0.1 + rnd() * 0.6), sy = TOP + rnd() * LH * 2 * 0.9, ln = 60 + rnd() * 120;
    stains += `<path d="M${sx.toFixed(1)},${sy.toFixed(1)} q${(ln / 2).toFixed(1)},${(rnd() * 14 - 7).toFixed(1)} ${ln.toFixed(1)},${(rnd() * 20 - 10).toFixed(1)}" stroke="#5a0706" stroke-width="${(5 + rnd() * 9).toFixed(1)}" stroke-linecap="round" fill="none" opacity=".35"/>`;
  }
  for (let i = 0; i < 46; i++) {          // splashes and flecks round the words
    const sx = rnd() * W, sy = TOP + rnd() * (LH * LINES.length), r = rnd() < 0.15 ? 2.5 + rnd() * 3 : 0.8 + rnd() * 1.8;
    splash += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  }
  host.setAttribute('aria-label', 'The Sealed Prophet');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="btRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c4251a"/><stop offset=".5" stop-color="#8e100b"/><stop offset="1" stop-color="#4f0504"/>
    </linearGradient>
    <filter id="btWet" x="-6%" y="-6%" width="112%" height="125%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feGaussianBlur in="rough" stdDeviation="0.9" result="soft"/>
      <feSpecularLighting in="soft" surfaceScale="5" specularConstant="1.2" specularExponent="26" lighting-color="#ffe2d8" result="spec">
        <fePointLight x="${W * 0.2}" y="-90" z="150"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="soft" operator="in" result="specIn"/>
      <feGaussianBlur in="soft" stdDeviation="5" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="soft"/><feMergeNode in="specIn"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#btWet)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g>${stains}</g>
    <g stroke="#250202" stroke-width="15">${under}</g>
    <g class="btDrips" stroke="#7a0907" fill="#7a0907">${drips}</g>
    <g stroke="url(#btRed)" stroke-width="10.5">${body}</g>
    <g stroke="#e8483a" stroke-width="2.2" opacity=".55">${shine}</g>
    <g fill="#8a0b08" stroke="none">${splash}</g>
  </g></svg>`;
})();
