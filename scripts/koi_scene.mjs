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

const BASE_SPEED = 270; // scene px per second (about two body lengths per second)
const MARGIN = { x: 70, y: 70 };
const KICK_PERIOD = 0.9; // seconds between tail-beat surges
const SAMPLE_DT = 0.2; // keyframe spacing along the route
const MAX_CURVATURE = 1 / 110; // tightest turn allowed (1 / radius in px)
const BABY_SCALE = 0.55;

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
  const bounds = { x0: MARGIN.x, y0: MARGIN.y, x1: SCENE.width - MARGIN.x, y1: SCENE.height - MARGIN.y };
  const STEP = 16; // px of travel per simulation step
  const MAX_TURN = STEP * MAX_CURVATURE; // radians per step
  const MIN_LENGTH = 11000, MAX_LENGTH = 24000;
  const randomSpot = () => {
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
  while (s < L && t < 120) {
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
  inner = inner.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => `<style>${scopeCss(css, "svg.cd")}</style>`);
  return inner;
}

// ---------- the scene ----------
// The header SVG comes from capsule-render. Namespace its ids, classes and keyframes so
// they cannot clash with the card's, and drop the outer <svg> tag.
export function prepareHeader(svgText) {
  let inner = svgText.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = inner.replace(/\.text\b/g, ".hd-text").replace(/\.desc\b/g, ".hd-desc")
    .replace(/class="text"/g, 'class="hd-text"').replace(/class="desc"/g, 'class="hd-desc"')
    .replace(/\btwinkling\b/g, "hd-twinkling").replace(/\bmyPath\b/g, "hd-myPath")
    // percentages would resolve against the whole scene, so pin them to the header's own size
    .replace(/x="50%"/g, `x="${HEADER.width / 2}"`).replace(/y="40%"/g, `y="${HEADER.height * 0.4}"`);
  return inner;
}

export function buildScene({ seed = 1, behavior = "cruise", speed = 1, fish = 1, sprite, headerSvg, cardSvg, koiScale = 0.6 }) {
  const bannerInner = prepareHeader(headerSvg);
  const factor = (MODES[behavior] ?? 1) * speed;
  const fw = sprite.w, fh = sprite.h, frames = sprite.frames;
  // The route is followed by a point on the fish's body axis just behind the nose, so
  // the head leads and the body and fins trail along the direction of travel.
  const [pivotX, pivotY] = sprite.pivot || [fw / 2, fh / 2];
  const frameVals = Array.from({ length: frames }, (_, i) => `${-i * fw} 0`).join(";");
  const flipDur = f3((frames * 70) / 1000);

  const routes = [];
  const defs = [];
  const fishSvg = [];
  for (let i = 0; i < fish; i++) {
    const rng = mulberry32((seed + i * 7919) >>> 0);
    const route = planRoute(rng);
    const sim = simulate(route, rng, factor * (i === 0 ? 1 : 1.12));
    const T = sim.duration;
    const keyPoints = sim.samples.map((smp) => f3(clamp(smp.s / route.poly.length, 0, 1))).join(";");
    const keyTimes = sim.samples.map((smp) => f3(clamp(smp.t / T, 0, 1))).join(";");
    const scale = koiScale * (i === 0 ? 1 : BABY_SCALE);
    defs.push(`<path id="route${i}" d="${pathData(route.segs)}" fill="none"/>`);
    fishSvg.push(
      `<g class="fish"><animateMotion dur="${f1(T)}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="${keyPoints}" keyTimes="${keyTimes}"><mpath href="#route${i}" xlink:href="#route${i}"/></animateMotion>`
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
  // Layer order: banner background < koi < banner text < card (so the koi swims under the
  // title, the graphs and every other drawn element, and shows through the glass panels).
  const textAt = bannerInner.indexOf("<text");
  const bannerBack = textAt > 0 ? bannerInner.slice(0, textAt) : bannerInner;
  const bannerFront = textAt > 0 ? bannerInner.slice(textAt) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SCENE.width} ${SCENE.height}" width="${SCENE.width}" height="${SCENE.height}" role="img" aria-labelledby="scene-t scene-d">
<title id="scene-t">Scrooge-777 profile with roaming koi</title>
<desc id="scene-d">The profile header and GitHub activity card. Koi swim freely under all of it; their size follows total contributions.</desc>
<defs>${defs.join("")}${sprites}</defs>
<g transform="scale(${f3(k)})">${bannerBack}</g>
<g id="koi">${fishSvg.join("")}</g>
<g transform="scale(${f3(k)})">${bannerFront}</g>
<svg class="cd" x="0" y="${SCENE.cardY}" width="1280" height="${SCENE.cardHeight}" viewBox="0 0 1280 850" overflow="hidden">${prepareCard(cardSvg)}</svg>
</svg>`;

  return { svg, meta: { routes, bytes: svg.length, fish, speedFactor: factor } };
}
