// scene.mjs: build the "roaming koi" profile scene as ONE animated SVG.
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
//   buildScene({ seed, speed, family, sprite, headerSvg, cardSvg, koiScale })
//     -> { svg, meta }
//
// `sprite` is { w, h, frames, b64, length }: a horizontal PNG strip of the in-place
// swimming cycle (head to the right) from the git-koi `roam_sprites` example.
// `family` lists the koi to draw (see family.mjs); without it `fish` copies swim.

import { RULES } from "../rules/index.mjs";

// The header is capsule-render's animated "venom" blob (854 x 220), scaled to the card's width.
export const HEADER = { width: 854, height: 220 };
const HEADER_SCALE = 1280 / HEADER.width;
export const SCENE = { width: 1280, headerHeight: Math.round(HEADER.height * HEADER_SCALE), cardY: Math.round(HEADER.height * HEADER_SCALE) + 16, cardHeight: 850, height: Math.round(HEADER.height * HEADER_SCALE) + 16 + 850 };

const BASE_SPEED = RULES.route.cruiseSpeed; // scene px per second: cruising pace (the surges and darts go above this)
const MARGIN = { x: 60, top: 60, bottom: 40 };
const KICK_PERIOD = 0.9; // seconds between tail-beat surges
const SAMPLE_DT = 0.2; // keyframe spacing along the route
const MAX_CURVATURE = 1 / 110; // tightest turn allowed (1 / radius in px)
const BABY_SCALE = 0.55;
// The 3D contribution terrain inside the card (scene px); the koi swims over it and the bars sway.
const TERRAIN = { x: 170, y: SCENE.cardY + 160, w: 460, h: 280 };

// ---------- the 5-hour route ----------
export const ROUTE_PERIOD_MS = RULES.route.periodHours * 3600 * 1000;

// The seed is the login plus the number of 5-hour periods since 1970, so every run inside one
// period reproduces the same route and only a new period gives a new one.
export function routeSeed(login, now = new Date()) {
  let h = 0;
  for (const ch of login) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return (h + Math.floor(now.getTime() / ROUTE_PERIOD_MS)) >>> 0;
}

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
export function planRoute(rng) {
  const bounds = { x0: MARGIN.x, y0: MARGIN.top, x1: SCENE.width - MARGIN.x, y1: SCENE.height - MARGIN.bottom };
  const STEP = 16; // px of travel per simulation step
  const MAX_TURN = STEP * MAX_CURVATURE; // radians per step
  const MIN_LENGTH = 11000, MAX_LENGTH = 24000;
  const randomSpot = () => {
    const roll = rng();
    if (roll < 0.2) { // inside the 3D terrain
      return [TERRAIN.x + rng() * TERRAIN.w, SCENE.cardY + 160 + rng() * TERRAIN.h];
    }
    if (roll < 0.32) { // along the row of stat pills at the bottom
      return [bounds.x0 + rng() * (bounds.x1 - bounds.x0), SCENE.cardY + 800 + rng() * 45];
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
    const overshoot = pts.some((p) => p[0] < -60 || p[0] > SCENE.width + 60 || p[1] < -60 || p[1] > SCENE.height + 60);
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

// ---------- a sleeping fish: a slow drift in a small oval among the bars ----------
const NESTS = [[250, 390], [335, 425], [425, 415], [505, 390], [300, 335]]; // card coordinates, on the terrain floor

export function planNest(index, rng) {
  const [nx, ny] = NESTS[index % NESTS.length];
  const cx = nx, cy = SCENE.cardY + ny;
  const { radiusX, radiusY } = RULES.life.nest;
  const tilt = (rng() - 0.5) * 0.6;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * 2 * Math.PI;
    const x = radiusX * Math.cos(a), y = radiusY * Math.sin(a);
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
  });
  const segs = closedBeziers(pts);
  return { pts, segs, poly: samplePolyline(segs, 40), maxK: 0, coverage: 0, cornersHit: 0 };
}

// Constant slow speed, no tail-beat surges.
export function drift(route, pixelsPerSecond) {
  const L = route.poly.length;
  const duration = L / pixelsPerSecond;
  const samples = [];
  for (let t = 0; t < duration; t += SAMPLE_DT) samples.push({ t, s: t * pixelsPerSecond });
  samples.push({ t: duration, s: L });
  return { samples, duration, darts: 0 };
}

// ---------- speed profile: tail-beat surges, smooth darts ----------
export function simulate(route, rng, speedFactor, { darts: withDarts = true } = {}) {
  const L = route.poly.length;
  const darts = [];
  const dartCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < dartCount; i++) {
    const d = { s: rng() * L, len: 300 + rng() * 260 }; // drawn either way, so a route never depends on the fish's mood
    if (withDarts) darts.push(d);
  }
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

export function prepareCard(svgText) {
  let inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = inner.replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>/g, "");
  inner = inner.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => {
    return `<style>${scopeCss(css, "svg.cd")}</style>`;
  });
  return inner;
}


// ---------- the 3D terrain: pull it out of the card so the koi can swim over it ----------
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
// The header's colours: a dim slate blob behind a light title, so the title reads everywhere.
const HEADER_COLOURS = { blob: "#394254", text: "#e2e8f0" };

export function prepareHeader(svgText) {
  let inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = inner.replace(/\.text\b/g, ".hd-text").replace(/\.desc\b/g, ".hd-desc")
    .replace(/class="text"/g, 'class="hd-text"').replace(/class="desc"/g, 'class="hd-desc"')
    .replace(/\btwinkling\b/g, "hd-twinkling").replace(/\bmyPath\b/g, "hd-myPath")
    // percentages would resolve against the whole scene, so pin them to the header's own size
    .replace(/x="50%"/g, `x="${HEADER.width / 2}"`).replace(/y="40%"/g, `y="${HEADER.height * 0.4}"`);
  inner = inner.replace(/(<path id="hd-myPath" fill="(#[0-9a-fA-F]{6})"[^>]*>)/, (m, open) => open.replace(/fill="#[0-9a-fA-F]{6}"/, `fill="${HEADER_COLOURS.blob}"`)); // a dim slate blob, so the light title reads everywhere
  inner = inner.replace(/fill:#ffffff;/gi, `fill:${HEADER_COLOURS.text};`);
  return inner;
}

export function buildScene({ seed = 1, speed = 1, fish = 1, family = null, sprite, headerSvg, cardSvg, koiScale = 0.6 }) {
  // family: the fish to draw (see family.mjs); otherwise `fish` copies, the first full size
  const crew = family ?? Array.from({ length: fish }, (_, i) => ({ growth: i === 0 ? 1 : BABY_SCALE, age: Infinity }));
  const bannerInner = prepareHeader(headerSvg);
  const factor = speed;
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
  const tails = new Set(); // one sprite per tail-beat speed in use
  for (let i = 0; i < crew.length; i++) {
    const rng = mulberry32((seed + i * 7919) >>> 0);
    const life = crew[i].life || { state: "active", ...RULES.life.states.active };
    const asleep = life.state === "sleep";
    const route = asleep ? planNest(i, rng) : planRoute(rng);
    const sim = asleep ? drift(route, life.speed) : simulate(route, rng, factor * life.speed * (i === 0 ? 1 : 1.12), { darts: life.darts });
    const T = sim.duration;
    if (!asleep) paths.push({ route, sim }); // bars lean away from swimmers, not from a sleeper
    const keyPoints = sim.samples.map((smp) => f3(clamp(smp.s / route.poly.length, 0, 1))).join(";");
    const keyTimes = sim.samples.map((smp) => f3(clamp(smp.t / T, 0, 1))).join(";");
    const scale = koiScale * crew[i].growth;
    const tail = life.tail;
    tails.add(tail);
    const pop = crew[i].age < 2 ? `<animate attributeName="opacity" values="0;1" dur="2.5s" fill="freeze"/>` : ""; // a newborn fades in
    defs.push(`<path id="route${i}" d="${pathData(route.segs)}" fill="none"/>`);
    fishSvg.push(
      `<g class="fish">${pop}<animateMotion dur="${f1(T)}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="${keyPoints}" keyTimes="${keyTimes}"><mpath href="#route${i}" xlink:href="#route${i}"/></animateMotion>`
      + `<g opacity="${life.opacity}" transform="scale(${f3(scale)}) translate(${-pivotX} ${-pivotY})"><use href="#koi-sprite-${tail}" xlink:href="#koi-sprite-${tail}"/></g></g>`,
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
      state: life.state,
    });
  }

  const sprites = [...tails].map((tail) => `<g id="koi-sprite-${tail}"><svg x="0" y="0" width="${fw}" height="${fh}" viewBox="0 0 ${fw} ${fh}" overflow="hidden">`
    + `<image width="${fw * frames}" height="${fh}" href="data:image/png;base64,${sprite.b64}" xlink:href="data:image/png;base64,${sprite.b64}">`
    + `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${f3(flipDur * tail)}s" repeatCount="indefinite" values="${frameVals}"/></image></svg></g>`).join("");

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

