// koi_scene.mjs: build the "roaming koi" profile scene as ONE animated SVG.
//
// GitHub renders README images with scripts disabled, so a koi cannot be steered live.
// This module plans each fish's whole wander in advance (seeded, so every day gets a new
// route) and bakes it into SMIL: a smooth closed route that sweeps the whole scene
// including every corner, a fast speed profile with tail-beat surges and darts, and the
// fish rotating along its heading. Nothing else on the page is touched: the banner and
// the activity card are drawn exactly as they are in their own files.
//
// Pure functions, no I/O, so the same file runs in the browser preview and in Node.
//
//   buildScene({ seed, behavior, speed, fish, sprite, headerSvg, cardSvg, koiScale })
//     -> { svg, meta }
//
// `sprite` is { w, h, frames, b64, length }: a horizontal PNG strip of the in-place
// swimming cycle (head to the right) from the git-koi `roam_sprites` example.
// `fish` is how many koi swim (1 = adult only; extra fish are babies).

// The header is capsule-render's animated "venom" blob (854 x 220), scaled to the card's width.
export const HEADER = { width: 854, height: 220 };
const HEADER_SCALE = 1280 / HEADER.width;
export const SCENE = { width: 1280, headerHeight: Math.round(HEADER.height * HEADER_SCALE), cardY: Math.round(HEADER.height * HEADER_SCALE) + 16, cardHeight: 850, height: Math.round(HEADER.height * HEADER_SCALE) + 16 + 850 };

// Speed multipliers for the behaviors git-koi picks from activity.
export const MODES = { cruise: 1.0, dart: 1.5, feeding: 0.9, rest: 0.5, deep: 0.25 };

const BASE_SPEED = 150; // scene px per second: cruising pace (the surges and darts go above this)
const MARGIN = { x: 60, top: 60, bottom: 40 };
const KICK_PERIOD = 0.9; // seconds between tail-beat surges
const SAMPLE_DT = 0.2; // keyframe spacing along the route
const MAX_CURVATURE = 1 / 110; // tightest turn allowed (1 / radius in px)
const BABY_SCALE = 0.55;
// The 3D contribution terrain inside the card (scene px); the koi swims over it and the bars sway.
const TERRAIN = { x: 170, y: SCENE.cardY + 160, w: 460, h: 280 };

// ---------- helpers ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- route planning ----------
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Closed Catmull-Rom spline -> cubic Bezier segments.
export function closedBeziers(pts) {
  const n = pts.length;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    segs.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return segs;
}

function bez(seg, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * seg[0][0] + b * seg[1][0] + c * seg[2][0] + d * seg[3][0], a * seg[0][1] + b * seg[1][1] + c * seg[2][1] + d * seg[3][1]];
}

function samplePolyline(segs, per = 40) {
  const pts = [];
  const cum = [];
  let len = 0;
  for (const seg of segs) {
    for (let k = 0; k < per; k++) {
      const p = bez(seg, k / per);
      if (pts.length) len += dist(pts[pts.length - 1], p);
      pts.push(p);
      cum.push(len);
    }
  }
  const closing = bez(segs[segs.length - 1], 1);
  len += dist(pts[pts.length - 1], closing);
  pts.push(closing);
  cum.push(len);
  return { pts, cum, length: len };
}

export function posAt(poly, s) {
  const { pts, cum } = poly;
  if (s <= 0) return pts[0];
  if (s >= poly.length) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const f = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
}

// Largest curvature (1/radius) and scene coverage of a route.
function judge(poly, bounds) {
  const { pts } = poly;
  let maxK = 0;
  const step = 5;
  for (let i = step; i < pts.length - step; i += 2) {
    const a = pts[i - step], b = pts[i], c = pts[i + step];
    const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
    if (ab < 1 || bc < 1) continue;
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    maxK = Math.max(maxK, (2 * cross) / (ab * bc * ca));
  }
  const cols = 5, rows = 6;
  const seen = new Set();
  for (const p of pts) {
    const cx = clamp(Math.floor(((p[0] - bounds.x0) / (bounds.x1 - bounds.x0)) * cols), 0, cols - 1);
    const cy = clamp(Math.floor(((p[1] - bounds.y0) / (bounds.y1 - bounds.y0)) * rows), 0, rows - 1);
    seen.add(cx + cy * cols);
  }
  return { maxK, coverage: seen.size / (cols * rows) };
}

// A truly random wander: the fish keeps picking a random spot anywhere in the scene (often
// near an edge or corner), turns toward it as sharply as a real fish can, and picks
// another the moment it gets there. The wander is simulated here, then joined back to its
// start with one smooth connecting curve, so the baked route loops without a jump.
export function planRoute(rng, area = { width: SCENE.width, height: SCENE.height, scene: true }) {
  const bounds = { x0: MARGIN.x, y0: MARGIN.top, x1: area.width - MARGIN.x, y1: area.height - MARGIN.bottom };
  const STEP = 16; // px of travel per simulation step
  const MAX_TURN = STEP * MAX_CURVATURE; // radians per step
  const MIN_LENGTH = 11000, MAX_LENGTH = 24000;
  const randomSpot = () => {
    const roll = rng();
    if (area.scene && roll < 0.2) { // inside the 3D terrain
      return [TERRAIN.x + rng() * TERRAIN.w, (area.cardY ?? SCENE.cardY) + 160 + rng() * TERRAIN.h];
    }
    if (area.scene && roll < 0.32) { // along the row of stat pills at the bottom
      return [bounds.x0 + rng() * (bounds.x1 - bounds.x0), (area.cardY ?? SCENE.cardY) + 800 + rng() * 45];
    }
    if (rng() < 0.3) { // an edge or corner region
      const cx = rng() < 0.5 ? bounds.x0 + rng() * 200 : bounds.x1 - rng() * 200;
      const cy = rng() < 0.5 ? bounds.y0 + rng() * 260 : bounds.y1 - rng() * 260;
      return [cx, cy];
    }
    return [bounds.x0 + rng() * (bounds.x1 - bounds.x0), bounds.y0 + rng() * (bounds.y1 - bounds.y0)];
  };
  const angDiff = (a, b2) => ((a - b2 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let pos = [bounds.x0 + rng() * (bounds.x1 - bounds.x0), bounds.y0 + rng() * (bounds.y1 - bounds.y0)];
  let theta = rng() * Math.PI * 2;
  const start = pos.slice(), startTheta = theta;
  let target = randomSpot();
  const trail = [{ p: pos.slice(), th: theta }];
  let wobble = 0;
  for (let travelled = 0; travelled < MAX_LENGTH; travelled += STEP) {
    if (dist(pos, target) < 130) {
      do { target = randomSpot(); } while (dist(pos, target) < 320);
    }
    // head for the target, but turn back toward the middle if the turning circle would
    // carry the fish well past the edge of the scene
    let want = Math.atan2(target[1] - pos[1], target[0] - pos[0]);
    const ahead = [pos[0] + Math.cos(theta) * 150, pos[1] + Math.sin(theta) * 150];
    if (ahead[0] < bounds.x0 - 60 || ahead[0] > bounds.x1 + 60 || ahead[1] < bounds.y0 - 60 || ahead[1] > bounds.y1 + 60) {
      want = Math.atan2((bounds.y0 + bounds.y1) / 2 - pos[1], (bounds.x0 + bounds.x1) / 2 - pos[0]);
    }
    wobble = wobble * 0.92 + (rng() - 0.5) * 0.05;
    theta += clamp(clamp(angDiff(want, theta), -MAX_TURN, MAX_TURN) + wobble * MAX_TURN, -MAX_TURN, MAX_TURN);
    pos = [pos[0] + Math.cos(theta) * STEP, pos[1] + Math.sin(theta) * STEP];
    trail.push({ p: pos.slice(), th: theta });
  }
  // Join the end back to the start with a cubic whose end tangents match the headings;
  // pick the cut-off point whose connector bends least.
  const connector = (i) => {
    const e = trail[i];
    const d = dist(e.p, start);
    if (d < 260) return null;
    const c1 = [e.p[0] + Math.cos(e.th) * d * 0.4, e.p[1] + Math.sin(e.th) * d * 0.4];
    const c2 = [start[0] - Math.cos(startTheta) * d * 0.4, start[1] - Math.sin(startTheta) * d * 0.4];
    const seg = [e.p, c1, c2, start];
    const n = Math.max(4, Math.round(d / 40));
    const pts = [];
    for (let k = 1; k < n; k++) pts.push(bez(seg, k / n));
    let maxK = 0;
    const dense = [];
    for (let k = 0; k <= 40; k++) dense.push(bez(seg, k / 40));
    for (let k = 1; k < dense.length - 1; k++) {
      const a = dense[k - 1], b = dense[k], c = dense[k + 1];
      const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
      maxK = Math.max(maxK, (2 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))) / (ab * bc * ca));
    }
    const overshoot = pts.some((p) => p[0] < -60 || p[0] > area.width + 60 || p[1] < -60 || p[1] > area.height + 60);
    return overshoot ? null : { pts, maxK };
  };
  let best = null;
  for (let i = Math.floor(MIN_LENGTH / STEP); i < trail.length; i += 6) {
    const c = connector(i);
    if (c && (!best || c.maxK < best.maxK)) best = { i, ...c };
  }
  const cut = best ? best.i : trail.length - 1;
  const thinned = trail.slice(0, cut + 1).filter((_, i) => i % 3 === 0).map((o) => o.p);
  if (!best) { /* no clean connector: close directly */ }
  const pts = best ? thinned.concat(best.pts) : thinned;
  const segs = closedBeziers(pts);
  const poly = samplePolyline(segs, 12);
  const { maxK, coverage } = judge(poly, bounds);
  let cornersHit = 0;
  for (const c of [[bounds.x0, bounds.y0], [bounds.x1, bounds.y0], [bounds.x1, bounds.y1], [bounds.x0, bounds.y1]]) {
    if (poly.pts.some((p) => dist(p, c) < 150)) cornersHit++;
  }
  return { pts, segs, poly: samplePolyline(segs, 40), maxK, coverage, cornersHit };
}

function pathData(segs) {
  let d = `M${f1(segs[0][0][0])} ${f1(segs[0][0][1])}`;
  for (const s of segs) d += `C${f1(s[1][0])} ${f1(s[1][1])} ${f1(s[2][0])} ${f1(s[2][1])} ${f1(s[3][0])} ${f1(s[3][1])}`;
  return d + "Z";
}

// ---------- speed profile: tail-beat surges, smooth darts ----------
export function simulate(route, rng, speedFactor) {
  const L = route.poly.length;
  const darts = [];
  const dartCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < dartCount; i++) darts.push({ s: rng() * L, len: 300 + rng() * 260 });
  const samples = [];
  let t = 0, s = 0;
  const dt = 0.02;
  let nextSample = 0;
  while (s < L && t < 600) {
    if (t >= nextSample) {
      samples.push({ t, s });
      nextSample += SAMPLE_DT;
    }
    const kick = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / KICK_PERIOD); // smooth 0..1
    let v = BASE_SPEED * speedFactor * (0.78 + 0.5 * kick);
    for (const d of darts) {
      if (s >= d.s && s < d.s + d.len) {
        const u = (s - d.s) / d.len;
        v *= 1 + 0.9 * Math.sin(Math.PI * u) ** 2; // smooth burst
      }
    }
    s += v * dt;
    t += dt;
  }
  samples.push({ t, s: L });
  return { samples, duration: t, darts: darts.length };
}

// ---------- inlining the activity card ----------
// The card must be inlined (not <image>-embedded): GitHub renders nested SVG images
// statically, which would freeze the card's own animations.
export function scopeCss(css, scope) {
  const keyframes = [];
  let text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m) => {
    keyframes.push(m);
    return `@@KF${keyframes.length - 1}@@`;
  });
  text = text.replace(/([^{}@]+)\{([^{}]*)\}/g, (m, sel, body) => {
    const scoped = sel.split(",").map((x) => `${scope} ${x.trim()}`).join(",");
    return `${scoped}{${body}}`;
  });
  return text.replace(/@@KF(\d+)@@/g, (m, i) => keyframes[Number(i)]);
}

// One colour for the whole scene: Monochrome Platinum theme, applied to match the integrated vector scene.
export const PLATINUM = {
  accent: "#e2e8f0", accentLight: "#ffffff",
  bg0: "#11151c", bg1: "#0b0e13", bg2: "#030406",
  c0t: "#1b1f28", c0l: "#151820", c0r: "#101319",
  c1t: "#394254", c1l: "#2d3443", c1r: "#232934",
  c2t: "#58657d", c2l: "#465063", c2r: "#363e4d",
  c3t: "#94a3b8", c3l: "#64748b", c3r: "#475569",
  c4t: "#e2e8f0", c4l: "#cbd5e1", c4r: "#94a3b8",
};
export function applyTheme(svg, t = PLATINUM) {
  svg = svg.replace(/<radialGradient id="bg"[^>]*>.*?<\/radialGradient>/s, `<radialGradient id="bg" cx="25%" cy="15%" r="95%"><stop offset="0" stop-color="${t.bg0}"/><stop offset="0.55" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></radialGradient>`);
  svg = svg.replace(/<linearGradient id="radarFill"[^>]*>.*?<\/linearGradient>/s, `<linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="0.32"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0.05"/></linearGradient>`);
  svg = svg.replace(/<linearGradient id="title"[^>]*>.*?<\/linearGradient>/s, `<linearGradient id="title" x1="0" x2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accentLight}"/></linearGradient>`);
  for (const k of ["c0", "c1", "c2", "c3", "c4"]) for (const side of ["t", "l", "r"]) {
    svg = svg.replace(new RegExp(`\.${k}${side}\{fill:[^}]+\}`), `.${k}${side}{fill:${t[k + side]}}`);
  }
  svg = svg.replace(/filter:drop-shadow\(0 0 12px #[0-9a-fA-F]+\)/g, `filter:drop-shadow(0 0 12px ${t.accent})`);
  svg = svg.replace(/(<polygon points="[^"]+" fill="url\(#radarFill\)" stroke=")[^"]+(" stroke-width="1.8" stroke-linejoin="round"\/>)/g, `$1${t.accent}$2`);
  svg = svg.replace(/(<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="4" fill=")[^"]+("\/>)/g, `$1${t.accent}$2`);
  svg = svg.replace(/\.strong\{fill:#[0-9a-fA-F]+\}/g, `.strong{fill:${t.accent}}`);
  // the pie chart keeps its original language colours so the slices stay easy to tell apart
  return svg.replace(/stroke:#(?:57da69|ffd700)/gi, `stroke:${t.accent}`);
}

export function prepareCard(svgText) {
  svgText = applyTheme(svgText);
  let inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = inner.replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>/g, "");
  inner = inner.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => {
    const fullCss = css;
    return `<style>${scopeCss(fullCss, "svg.cd")}</style>`;
  });
  return inner;
}


// ---------- the 3D terrain: pull it out of the card so the koi can swim over it ----------
export function locateTerrain(cardInner) {
  const start = cardInner.indexOf('<g id="terrain-island"');
  if (start < 0) return null;
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(cardInner))) {
    if (m[0] === "</g>") { depth--; if (depth === 0) return { start, end: m.index + 4 }; } else depth++;
  }
  return null;
}

export function splitTerrain(cardInner) {
  const start = cardInner.indexOf('<g id="terrain-island"');
  if (start < 0) return { terrain: "", rest: cardInner };
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0, end = -1, m;
  while ((m = re.exec(cardInner))) {
    if (m[0] === "</g>") { depth--; if (depth === 0) { end = m.index + 4; break; } } else depth++;
  }
  if (end < 0) return { terrain: "", rest: cardInner };
  return { terrain: cardInner.slice(start, end), rest: cardInner.slice(0, start) + cardInner.slice(end) };
}

const GRASS = { radius: 150, core: 45, maxDegrees: 12, hertz: 1.4, damping: 0.32, step: 0.05, out: 0.1 };

// Position of a fish at time t on its looping route.
function fishAt(path, t) {
  const { samples, duration } = path.sim;
  const tt = ((t % duration) + duration) % duration;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= tt) lo = mid; else hi = mid; }
  const f = (tt - samples[lo].t) / Math.max(1e-9, samples[hi].t - samples[lo].t);
  return posAt(path.route.poly, samples[lo].s + (samples[hi].s - samples[lo].s) * f);
}

// Make every terrain bar lean away from the koi as it swims past and spring back with a
// small wobble, like grass: one rotate animation per bar, only for bars the koi reaches.
export function addGrass(terrainSvg, path, cardY = SCENE.cardY) {
  const T = path.sim.duration;
  const steps = Math.round(T / GRASS.step);
  const fishPath = Array.from({ length: steps }, (_, i) => fishAt(path, i * GRASS.step));
  const omega = 2 * Math.PI * GRASS.hertz;
  let swaying = 0;
  const colRe = /<g class="iso-col" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">([\s\S]*?)<\/g>/g;
  const out = terrainSvg.replace(colRe, (whole, tx, ty, sc, inner) => {
    const hMatch = inner.match(/class="c\dl"[^>]*><animate attributeName="height" values="[\d.]+;([\d.]+)"/);
    const height = hMatch ? Number(hMatch[1]) : 3;
    const baseY = height * 1.15 + 10, baseX = 9;
    const centre = [Number(tx) + baseX * Number(sc), cardY + Number(ty) + baseY * 0.45 * Number(sc)];
    const reach = 0.45 + 0.55 * clamp(height / 55, 0, 1); // taller bars sway more
    const target = (p) => {
      const d = dist(p, centre);
      if (d >= GRASS.radius) return 0;
      const u = clamp((GRASS.radius - d) / (GRASS.radius - GRASS.core), 0, 1);
      return Math.sign(centre[0] - p[0] || 1) * GRASS.maxDegrees * reach * u * u * (3 - 2 * u);
    };
    if (!fishPath.some((p) => dist(p, centre) < GRASS.radius)) return whole;
    // damped spring, run two loops so the end matches the start
    let a = 0, v = 0;
    const series = [];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < steps; i++) {
        const acc = omega * omega * (target(fishPath[i]) - a) - 2 * GRASS.damping * omega * v;
        v += acc * GRASS.step;
        a += v * GRASS.step;
        if (pass === 1) series.push(a);
      }
    }
    const every = Math.round(GRASS.out / GRASS.step);
    const keys = [];
    for (let i = 0; i < steps; i += every) {
      const active = Math.abs(series[i]) > 0.12 || Math.abs(series[Math.max(0, i - every)]) > 0.12 || Math.abs(series[Math.min(steps - 1, i + every)]) > 0.12;
      if (active || i === 0) keys.push([i * GRASS.step, series[i]]);
    }
    if (keys[keys.length - 1][0] < T - 1e-6) keys.push([T, series[0]]);
    if (keys.length < 3) return whole;
    swaying++;
    const keyTimes = keys.map(([t]) => f3(clamp(t / T, 0, 1))).join(";");
    const values = keys.map(([, ang]) => `${Math.round(ang * 100) / 100} ${baseX} ${f1(baseY)}`).join(";");
    return whole.replace(/<\/g>$/, `<animateTransform attributeName="transform" type="rotate" additive="sum" dur="${f1(T)}s" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" values="${values}"/></g>`);
  });
  return { svg: out, swaying };
}

// ---------- the scene ----------
// The header SVG comes from capsule-render. Namespace its ids, classes and keyframes so
// they cannot clash with the card's, and drop the outer <svg> tag.
// The header's blob colour: capsule-render picks a random colour for every request, which a
// README image cannot do per page view, so the blob instead drifts through the colour wheel
// (starting from the colour the header was fetched with) while the page is open.
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, sat, l];
}
function hslToHex(h, sat, l) {
  const a = sat * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}
export function colourCycle(hex, stops = 6, seconds = 24) {
  const [h, sat, l] = hexToHsl(hex);
  const colours = Array.from({ length: stops + 1 }, (_, i) => hslToHex((h + (360 * (i % stops)) / stops) % 360, sat, l));
  return `<animate attributeName="fill" values="${colours.join(";")}" dur="${seconds}s" repeatCount="indefinite"/>`;
}
export function terrainColourKeyframes(seconds = 24, stops = 12) {
  const baseColors = {
    c0t: "#2a2620", c0l: "#211d17", c0r: "#1a1712",
    c1t: "#7c6224", c1l: "#68521e", c1r: "#544218",
    c2t: "#b8860b", c2l: "#9e7309", c2r: "#825e07",
    c3t: "#e6b800", c3l: "#c49d00", c3r: "#a38200",
    c4t: "#ffd700", c4l: "#e6c200", c4r: "#ccad00",
  };
  let css = "";
  for (const [cls, hex] of Object.entries(baseColors)) {
    css += `.${cls}{fill:${hex};animation:cycle_${cls} ${seconds}s linear infinite;}`;
  }
  for (const [cls, hex] of Object.entries(baseColors)) {
    const [h, sat, l] = hexToHsl(hex);
    const steps = [];
    for (let i = 0; i <= stops; i++) {
      const pct = ((i / stops) * 100).toFixed(1);
      const curH = (h + (360 * (i % stops)) / stops) % 360;
      steps.push(`${pct}%{fill:${hslToHex(curH, sat, l)};}`);
    }
    css += `@keyframes cycle_${cls}{${steps.join("")}}`;
  }
  return css;
}


// The card's accent colour (numbers, radar outline and dots, title gradient) drifts through the
// same colour wheel at the same pace as the terrain, so the whole card changes colour together.
export function accentColourKeyframes(seconds = 24, stops = 12) {
  const ramp = (hex, prop, name) => {
    const [h, sat, l] = hexToHsl(hex);
    const steps = [];
    for (let i = 0; i <= stops; i++) {
      steps.push(`${((i / stops) * 100).toFixed(1)}%{${prop}:${hslToHex((h + (360 * (i % stops)) / stops) % 360, sat, l)};}`);
    }
    return `@keyframes ${name}{${steps.join("")}}`;
  };
  const run = (name) => `animation:${name} ${seconds}s linear infinite;`;
  return `.strong,.radar-node{${run("acc_fill")}}`
    + `polygon[stroke]{${run("acc_stroke")}}`
    + `#radarFill stop,#title stop:first-child{${run("acc_stop")}}`
    + `#title stop:last-child{${run("acc_stop_light")}}`
    + ramp("#ffd700", "fill", "acc_fill") + ramp("#ffd700", "stroke", "acc_stroke")
    + ramp("#ffd700", "stop-color", "acc_stop") + ramp("#ffea78", "stop-color", "acc_stop_light");
}

export function prepareHeader(svgText) {
  let inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = inner.replace(/\.text\b/g, ".hd-text").replace(/\.desc\b/g, ".hd-desc")
    .replace(/class="text"/g, 'class="hd-text"').replace(/class="desc"/g, 'class="hd-desc"')
    .replace(/\btwinkling\b/g, "hd-twinkling").replace(/\bmyPath\b/g, "hd-myPath")
    // percentages would resolve against the whole scene, so pin them to the header's own size
    .replace(/x="50%"/g, `x="${HEADER.width / 2}"`).replace(/y="40%"/g, `y="${HEADER.height * 0.4}"`);
  inner = inner.replace(/(<path id="hd-myPath" fill="(#[0-9a-fA-F]{6})"[^>]*>)/, (m, open) => open.replace(/fill="#[0-9a-fA-F]{6}"/, `fill="${PLATINUM.accent}"`));
  return inner;
}

export function buildScene({ seed = 1, behavior = "cruise", speed = 1, fish = 1, family = null, sprite, headerSvg, cardSvg, koiScale = 0.6 }) {
  // family: the fish to draw (see koi_family.mjs); otherwise `fish` copies, the first full size
  const crew = family ?? Array.from({ length: fish }, (_, i) => ({ growth: i === 0 ? 1 : BABY_SCALE, age: Infinity }));
  const bannerInner = prepareHeader(headerSvg);
  const factor = (MODES[behavior] ?? 1) * speed;
  const fw = sprite.w, fh = sprite.h, frames = sprite.frames;
  // The route is followed by a point on the fish's body axis just behind the nose, so
  // the head leads and the body and fins trail along the direction of travel.
  const [pivotX, pivotY] = sprite.pivot || [fw / 2, fh / 2];
  const frameVals = Array.from({ length: frames }, (_, i) => `${-i * fw} 0`).join(";");
  const flipDur = f3((frames * 70) / 1000);

  const routes = [];
  const paths = [];
  const defs = [];
  const fishSvg = [];
  for (let i = 0; i < crew.length; i++) {
    const rng = mulberry32((seed + i * 7919) >>> 0);
    const route = planRoute(rng);
    const sim = simulate(route, rng, factor * (i === 0 ? 1 : 1.12));
    const T = sim.duration;
    paths.push({ route, sim });
    const keyPoints = sim.samples.map((smp) => f3(clamp(smp.s / route.poly.length, 0, 1))).join(";");
    const keyTimes = sim.samples.map((smp) => f3(clamp(smp.t / T, 0, 1))).join(";");
    const scale = koiScale * crew[i].growth;
    const pop = crew[i].age < 2 ? `<animate attributeName="opacity" values="0;1" dur="2.5s" fill="freeze"/>` : ""; // a newborn fades in
    defs.push(`<path id="route${i}" d="${pathData(route.segs)}" fill="none"/>`);
    fishSvg.push(
      `<g class="fish">${pop}<animateMotion dur="${f1(T)}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="${keyPoints}" keyTimes="${keyTimes}"><mpath href="#route${i}" xlink:href="#route${i}"/></animateMotion>`
      + `<g transform="scale(${f3(scale)}) translate(${-pivotX} ${-pivotY})"><use href="#koi-sprite" xlink:href="#koi-sprite"/></g></g>`,
    );
    routes.push({
      id: i,
      duration: T,
      length: route.poly.length,
      speed: route.poly.length / T,
      maxCurvature: route.maxK,
      coverage: route.coverage,
      cornersHit: route.cornersHit,
      routeD: pathData(route.segs),
      waypoints: route.pts,
      darts: sim.darts,
    });
  }

  const sprites = `<g id="koi-sprite"><svg x="0" y="0" width="${fw}" height="${fh}" viewBox="0 0 ${fw} ${fh}" overflow="hidden">`
    + `<image width="${fw * frames}" height="${fh}" href="data:image/png;base64,${sprite.b64}" xlink:href="data:image/png;base64,${sprite.b64}">`
    + `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${flipDur}s" repeatCount="indefinite" values="${frameVals}"/></image></svg></g>`;

  const k = HEADER_SCALE;
  // Layer order: header background < 3D terrain < koi < header text < rest of the card. The koi
  // swims over the terrain (whose bars sway like grass) and under everything else.
  const { terrain, rest: cardRest } = splitTerrain(prepareCard(cardSvg));
  let grass = { svg: terrain, swaying: 0 };
  if (terrain) for (const path of paths) { const g = addGrass(grass.svg, path); grass = { svg: g.svg, swaying: Math.max(grass.swaying, g.swaying) }; } // every fish bends the bars
  const terrainSvg = grass.svg;
    const textAt = bannerInner.indexOf("<text");
  const bannerBack = textAt > 0 ? bannerInner.slice(0, textAt) : bannerInner;
  const bannerFront = textAt > 0 ? bannerInner.slice(textAt) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SCENE.width} ${SCENE.height}" width="${SCENE.width}" height="${SCENE.height}" role="img" aria-labelledby="scene-t scene-d">
<title id="scene-t">Scrooge-777 profile with roaming koi</title>
<desc id="scene-d">The profile header and GitHub activity card. Koi swim freely under all of it; their size follows total contributions.</desc>
<defs>${defs.join("")}${sprites}</defs>
<g transform="scale(${f3(k)})">${bannerBack}</g>
<svg class="cd" x="0" y="${SCENE.cardY}" width="1280" height="${SCENE.cardHeight}" viewBox="0 0 1280 850" overflow="hidden">${terrainSvg}</svg>
<g id="koi">${fishSvg.join("")}</g>
<g transform="scale(${f3(k)})">${bannerFront}</g>
<svg class="cd" x="0" y="${SCENE.cardY}" width="1280" height="${SCENE.cardHeight}" viewBox="0 0 1280 850" overflow="hidden">${cardRest}</svg>
</svg>`;

  return { svg, meta: { routes, bytes: svg.length, fish: crew.length, speedFactor: factor, swayingBars: grass.swaying } };
}

// ---------- a fish on its own: a transparent strip that drops into a README ----------
// Nothing else is drawn, so it changes nothing about the page around it: the koi just roams
// the whole strip along a random route that is baked in (see the notes at the top).
export function buildFishStrip({ seed = 1, speed = 1, sprite, koiScale = 0.6, width = 1280, height = 360 }) {
  const rng = mulberry32(seed >>> 0);
  const area = { width, height, scene: false };
  const route = planRoute(rng, area);
  const sim = simulate(route, rng, speed);
  const T = sim.duration;
  const [pivotX, pivotY] = sprite.pivot || [sprite.w / 2, sprite.h / 2];
  const keyPoints = sim.samples.map((smp) => f3(clamp(smp.s / route.poly.length, 0, 1))).join(";");
  const keyTimes = sim.samples.map((smp) => f3(clamp(smp.t / T, 0, 1))).join(";");
  const frameVals = Array.from({ length: sprite.frames }, (_, i) => `${-i * sprite.w} 0`).join(";");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="koi-t">
<title id="koi-t">A koi swimming freely; its size follows total contributions</title>
<defs><path id="route0" d="${pathData(route.segs)}" fill="none"/>
<g id="koi-sprite"><svg x="0" y="0" width="${sprite.w}" height="${sprite.h}" viewBox="0 0 ${sprite.w} ${sprite.h}" overflow="hidden"><image width="${sprite.w * sprite.frames}" height="${sprite.h}" href="data:image/png;base64,${sprite.b64}" xlink:href="data:image/png;base64,${sprite.b64}"><animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${f3((sprite.frames * 70) / 1000)}s" repeatCount="indefinite" values="${frameVals}"/></image></svg></g></defs>
<g class="fish"><animateMotion dur="${f1(T)}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="${keyPoints}" keyTimes="${keyTimes}"><mpath href="#route0" xlink:href="#route0"/></animateMotion><g transform="scale(${f3(koiScale)}) translate(${-pivotX} ${-pivotY})"><use href="#koi-sprite" xlink:href="#koi-sprite"/></g></g>
</svg>`;
  return { svg, meta: { duration: T, length: route.poly.length, speed: route.poly.length / T, maxCurvature: route.maxK, coverage: route.coverage, cornersHit: route.cornersHit } };
}

// ---------- the koi inside the activity card itself ----------
// The Vercel endpoint behind the README's card (card.svg) fetches docs/profile_card.svg from
// this repo on every request and re-colours it with a fresh theme, so a fish placed in that
// file roams the card while the colours still change on every refresh and the endpoint stays
// exactly as it is. The koi goes right after the 3D terrain: over the bars (which sway like
// grass as it passes) and under the radar, the donut, the stat pills and every label.
export function buildCardWithKoi({ seed = 1, speed = 1, sprite, cardSvg, koiScale = 0.6 }) {
  const loc = locateTerrain(cardSvg);
  if (!loc) throw new Error("koi: the card has no 3D terrain group to swim over");
  const area = { width: 1280, height: 850, scene: true, cardY: 0 };
  const rng = mulberry32(seed >>> 0);
  const route = planRoute(rng, area);
  const sim = simulate(route, rng, speed);
  const T = sim.duration;
  const [pivotX, pivotY] = sprite.pivot || [sprite.w / 2, sprite.h / 2];
  const keyPoints = sim.samples.map((smp) => f3(clamp(smp.s / route.poly.length, 0, 1))).join(";");
  const keyTimes = sim.samples.map((smp) => f3(clamp(smp.t / T, 0, 1))).join(";");
  const frameVals = Array.from({ length: sprite.frames }, (_, i) => `${-i * sprite.w} 0`).join(";");
  const terrain = addGrass(cardSvg.slice(loc.start, loc.end), { route, sim }, 0);
  const layer = `<defs><path id="route0" d="${pathData(route.segs)}" fill="none"/>`
    + `<g id="koi-sprite"><svg x="0" y="0" width="${sprite.w}" height="${sprite.h}" viewBox="0 0 ${sprite.w} ${sprite.h}" overflow="hidden">`
    + `<image width="${sprite.w * sprite.frames}" height="${sprite.h}" href="data:image/png;base64,${sprite.b64}" xlink:href="data:image/png;base64,${sprite.b64}">`
    + `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${f3((sprite.frames * 70) / 1000)}s" repeatCount="indefinite" values="${frameVals}"/></image></svg></g></defs>`
    + `<g id="koi"><g class="fish"><animateMotion dur="${f1(T)}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="${keyPoints}" keyTimes="${keyTimes}"><mpath href="#route0" xlink:href="#route0"/></animateMotion>`
    + `<g transform="scale(${f3(koiScale)}) translate(${-pivotX} ${-pivotY})"><use href="#koi-sprite" xlink:href="#koi-sprite"/></g></g></g>`;
  let svg = cardSvg.slice(0, loc.start) + terrain.svg + layer + cardSvg.slice(loc.end);
  if (!/<svg[^>]*xmlns:xlink=/.test(svg)) svg = svg.replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
  return { svg, meta: { duration: T, length: route.poly.length, speed: route.poly.length / T, maxCurvature: route.maxK, coverage: route.coverage, cornersHit: route.cornersHit, swayingBars: terrain.swaying } };
}
