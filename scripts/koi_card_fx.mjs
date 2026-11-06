// koi_card_fx.mjs: upgrades for the activity card, applied when the scene is built.
//
// The card (docs/profile_card.svg) is generated elsewhere; these are additive effects on its
// markup, written in SMIL so they run inside a README image. Every effect looks for the
// markup it needs and silently skips itself if it is not there, so a changed card can never
// break the scene. All effects share one 8 second beat so they move in sync, and the same
// koi that bends the 3D bars also nudges the radar, the donut slices and the stat pills.
//
//   enhanceTerrain(terrainSvg)            3D bars: floor shadow, level pulses synced to the legend
//   enhanceCard(cardRest, track, opts)    radar, donut, legend, stat pills
//
// `track` is { path: [[x, y], ...], step, duration, cardY }: the koi's scene position every
// `step` seconds across one loop.

export const BEAT = 8; // seconds: the shared rhythm of every effect

const f1 = (n) => (Math.round(n * 10) / 10).toString();
const f2 = (n) => (Math.round(n * 100) / 100).toString();
const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (u) => u * u * (3 - 2 * u);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- shared: spring-damped reaction to the koi ----------
// `targetAt(p)` gives the pushed-to offset ([dx, dy]) when the koi is at p. A damped spring
// follows it, so things overshoot and settle instead of snapping. Two loops are run so the
// end of the series matches its start.
function reactionSeries(track, targetAt, hertz = 1.6, damping = 0.3) {
  const omega = 2 * Math.PI * hertz;
  const state = [[0, 0], [0, 0]]; // position, velocity per axis
  const series = [];
  const steps = track.path.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < steps; i++) {
      const target = targetAt([track.path[i][0], track.path[i][1] - track.cardY]);
      for (let axis = 0; axis < 2; axis++) {
        const acc = omega * omega * (target[axis] - state[0][axis]) - 2 * damping * omega * state[1][axis];
        state[1][axis] += acc * track.step;
        state[0][axis] += state[1][axis] * track.step;
      }
      if (pass === 1) series.push([state[0][0], state[0][1]]);
    }
  }
  return series;
}

// Indices worth keeping: the first, the last, and anything moving (plus neighbours).
function sparseIndices(series, track, every = 2, threshold = 0.15) {
  const idx = [];
  const n = series.length;
  const moving = (i) => i >= 0 && i < n && (Math.abs(series[i][0]) > threshold || Math.abs(series[i][1]) > threshold);
  for (let i = 0; i < n; i += every) if (i === 0 || moving(i) || moving(i - every) || moving(i + every)) idx.push(i);
  return idx;
}

const timesOf = (idx, track) => idx.map((i) => i * track.step);
const keyTimesOf = (times, track) => times.map((t) => f3(clamp(t / track.duration, 0, 1))).join(";");
const reached = (track, centre, radius) => track.path.some((p) => dist([p[0], p[1] - track.cardY], centre) < radius);

// Push away from the koi, strongest when it is close.
function pushAway(centre, p, radius, core, magnitude) {
  const d = dist(p, centre);
  if (d >= radius) return [0, 0];
  const u = smooth(clamp((radius - d) / (radius - core), 0, 1));
  const dx = (centre[0] - p[0]) / (d || 1), dy = (centre[1] - p[1]) / (d || 1);
  return [dx * magnitude * u, dy * magnitude * u];
}

// ---------- 3D terrain ----------
export function enhanceTerrain(terrainSvg) {
  if (!terrainSvg) return terrainSvg;
  const cols = [...terrainSvg.matchAll(/<g class="iso-col" transform="translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  let out = terrainSvg;
  // each level's top faces pulse in turn, in time with the legend squares
  out = out.replace(/(<rect[^>]*class="c(\d)t"[^>]*>)(<\/rect>)/g, (m, open, level, close) => {
    const begin = f1(Number(level) * (BEAT / 5));
    return `${open}<animate attributeName="opacity" values="1;0.55;1;1" keyTimes="0;0.07;0.16;1" dur="${BEAT}s" begin="${begin}s" repeatCount="indefinite"/>${close}`;
  });
  if (cols.length) {
    const xs = cols.map((c) => c[0]), ys = cols.map((c) => c[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 12;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 52;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 70;
    const ry = (Math.max(...ys) - Math.min(...ys)) / 2 * 0.55 + 36;
    out = `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="#000" opacity="0.4" filter="url(#fx-blur)"/>${out}`;
  }
  return out;
}

// ---------- the rest of the card ----------
const DEFS = `<defs>
<filter id="fx-blur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="fx-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="fx-scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd700" stop-opacity="0"/><stop offset="1" stop-color="#ffd700" stop-opacity="0.28"/></linearGradient>
<radialGradient id="fx-gloss" cx="50%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;

function enhanceRadar(svg, track, report) {
  const dataRe = /<polygon points="([^"]+)" fill="url\(#radarFill\)"([^>]*)\/>/;
  const m = svg.match(dataRe);
  const centreMatch = svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="#9aa0b8"/);
  if (!m || !centreMatch) return svg;
  const verts = m[1].trim().split(/\s+/).map((p) => p.split(",").map(Number));
  const centre = [Number(centreMatch[1]), Number(centreMatch[2])];
  const R = 135;
  // rotating scan wedge, drawn under the data polygon
  const wedge = `<g transform="translate(${centre[0]} ${centre[1]})"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${BEAT}s" repeatCount="indefinite"/>`
    + `<path d="M0 0 L0 ${-R} A${R} ${R} 0 0 1 ${f1(R * Math.sin(0.7))} ${f1(-R * Math.cos(0.7))} Z" fill="url(#fx-scan)"/>`
    + `<line x1="0" y1="0" x2="0" y2="${-R}" stroke="#ffd700" stroke-opacity="0.35"/></g></g>`;
  // the koi nudges every vertex of the data polygon and its node away from it
  const series = verts.map((v) => reactionSeries(track, (p) => pushAway(v, p, 130, 30, 13)));
  const any = series.some((s) => s.some(([x, y]) => Math.abs(x) > 0.15 || Math.abs(y) > 0.15));
  let polygon, nodeTags = "";
  if (any && verts.some((v) => reached(track, v, 130))) {
    const idx = [...new Set(series.flatMap((s) => sparseIndices(s, track)))].sort((a, b) => a - b);
    if (idx[idx.length - 1] !== series[0].length - 1) idx.push(series[0].length - 1);
    const times = timesOf(idx, track);
    const kt = keyTimesOf(times, track);
    const pointValues = idx.map((i) => verts.map((v, vi) => `${f1(v[0] + series[vi][i][0])},${f1(v[1] + series[vi][i][1])}`).join(" ")).join(";");
    polygon = `<polygon points="${m[1]}" fill="url(#radarFill)"${m[2]} filter="url(#fx-glow)"><animate attributeName="points" dur="${f1(track.duration)}s" repeatCount="indefinite" keyTimes="${kt}" values="${pointValues}"/>`
      + `<animate attributeName="opacity" values="0.8;1;0.8" dur="${BEAT / 2}s" repeatCount="indefinite"/></polygon>`;
    nodeTags = verts.map((v, vi) => ({ v, vi }));
    report.radar = "nudged";
  } else {
    polygon = `<polygon points="${m[1]}" fill="url(#radarFill)"${m[2]} filter="url(#fx-glow)"><animate attributeName="opacity" values="0.8;1;0.8" dur="${BEAT / 2}s" repeatCount="indefinite"/></polygon>`;
    report.radar = "static";
  }
  let out = svg.replace(dataRe, wedge + polygon);
  // nodes: follow their vertex and send out a pulse ring
  let vi = 0;
  out = out.replace(/<circle class="radar-node" cx="([\d.]+)" cy="([\d.]+)" r="4" fill="#ffd700"\/>/g, (all, cx, cy) => {
    const i = vi++;
    const ring = `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="#ffd700" stroke-width="1.5" opacity="0"><animate attributeName="r" values="4;16" dur="${BEAT / 2}s" begin="${f1(i * 0.8)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="${BEAT / 2}s" begin="${f1(i * 0.8)}s" repeatCount="indefinite"/></circle>`;
    if (report.radar === "nudged" && series[i]) {
      const idx = [...new Set(series.flatMap((s) => sparseIndices(s, track)))].sort((a, b) => a - b);
      if (idx[idx.length - 1] !== series[0].length - 1) idx.push(series[0].length - 1);
      const kt = keyTimesOf(timesOf(idx, track), track);
      const xs = idx.map((k) => f1(Number(cx) + series[i][k][0])).join(";");
      const ys = idx.map((k) => f1(Number(cy) + series[i][k][1])).join(";");
      return `${ring}<circle class="radar-node" cx="${cx}" cy="${cy}" r="4" fill="#ffd700"><animate attributeName="cx" dur="${f1(track.duration)}s" repeatCount="indefinite" keyTimes="${kt}" values="${xs}"/><animate attributeName="cy" dur="${f1(track.duration)}s" repeatCount="indefinite" keyTimes="${kt}" values="${ys}"/></circle>`;
    }
    return `${ring}${all}`;
  });
  return out;
}

function parseSlices(svg) {
  const slices = [];
  const re = /<path d="M([\d.]+),([\d.]+)A([\d.]+),([\d.]+),0,(\d),(\d),([\d.]+),([\d.]+)L[^"]*" class="donut-slice" fill="([^"]+)"[^>]*><title>([^<]*)<\/title>/g;
  let m;
  while ((m = re.exec(svg))) {
    slices.push({ x0: Number(m[1]), y0: Number(m[2]), R: Number(m[3]), sweep: Number(m[6]), x1: Number(m[7]), y1: Number(m[8]), fill: m[9], title: m[10], tag: m[0] });
  }
  return slices;
}

function enhanceDonut(svg, track, report) {
  const slices = parseSlices(svg);
  if (slices.length < 2) return svg;
  const R = slices[0].R;
  // the first slice starts at the top of the ring, so the centre is straight below it
  const centre = [slices[0].x0, slices[0].y0 + R];
  if (Math.abs(dist([slices[1].x0, slices[1].y0], centre) - R) > 1.5) return svg;
  const percents = [...svg.matchAll(/<text x="424" y="[\d.]+" font-size="14" font-weight="700" text-anchor="end" class="weak">([^<]+)<\/text>/g)].map((m) => m[1]);
  let out = svg;
  const n = slices.length;
  const slotSeconds = BEAT / n;
  slices.forEach((s, i) => {
    let a0 = Math.atan2(s.y0 - centre[1], s.x0 - centre[0]);
    let a1 = Math.atan2(s.y1 - centre[1], s.x1 - centre[0]);
    if (s.sweep === 1 && a1 < a0) a1 += 2 * Math.PI;
    const mid = (a0 + a1) / 2;
    const dir = [Math.cos(mid), Math.sin(mid)];
    const anchor = [centre[0] + dir[0] * (R * 0.75), centre[1] + dir[1] * (R * 0.75)];
    // 1) one slice at a time pops out, in sync with the beat
    const popBegin = f1(i * slotSeconds);
    const pop = `<animateTransform attributeName="transform" type="translate" additive="sum" dur="${BEAT}s" begin="${popBegin}s" repeatCount="indefinite" keyTimes="0;0.06;0.2;1" values="0 0;${f1(dir[0] * 5)} ${f1(dir[1] * 5)};0 0;0 0"/>`;
    // 2) the koi pushes the slice outward when it swims near
    let react = "";
    if (reached(track, anchor, 125)) {
      const series = reactionSeries(track, (p) => {
        const d = dist(p, anchor);
        if (d >= 125) return [0, 0];
        const u = smooth(clamp((125 - d) / 80, 0, 1)) * 10;
        return [dir[0] * u, dir[1] * u];
      });
      const idx = sparseIndices(series, track);
      if (idx[idx.length - 1] !== series.length - 1) idx.push(series.length - 1);
      const kt = keyTimesOf(timesOf(idx, track), track);
      react = `<animateTransform attributeName="transform" type="translate" additive="sum" dur="${f1(track.duration)}s" repeatCount="indefinite" keyTimes="${kt}" values="${idx.map((k) => `${f1(series[k][0])} ${f1(series[k][1])}`).join(";")}"/>`;
    }
    out = out.replace(s.tag, `${s.tag}${pop}${react}`);
  });
  // centre read-out: the language whose slice is popping, with its share
  const names = slices.map((s) => s.title.replace(/\s[\d.]+\sKB$/, ""));
  let centreText = "";
  names.forEach((name, i) => {
    const a = i / n, b = (i + 1) / n;
    const keyTimes = `0;${f3(Math.max(0, a))};${f3(a + 0.015)};${f3(b - 0.015)};${f3(b)};1`;
    const values = "0;0;1;1;0;0";
    centreText += `<g opacity="0"><animate attributeName="opacity" dur="${BEAT}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/>`
      + `<text x="${centre[0]}" y="${centre[1] + 2}" text-anchor="middle" font-size="22" font-weight="800" fill="${slices[i].fill}">${percents[i] || ""}</text>`
      + `<text x="${centre[0]}" y="${centre[1] + 20}" text-anchor="middle" font-size="12" class="weak">${name}</text></g>`;
  });
  const ring = `<circle cx="${centre[0]}" cy="${centre[1]}" r="${R + 12}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-dasharray="2 9" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 ${centre[0]} ${centre[1]}" to="360 ${centre[0]} ${centre[1]}" dur="40s" repeatCount="indefinite"/></circle>`
    + `<circle cx="${centre[0]}" cy="${centre[1]}" r="${R}" fill="url(#fx-gloss)" pointer-events="none"/>`;
  out = out.replace(/(<g id="donut-hologram"[^>]*>)/, `${ring}$1`).replace(/(<g id="donut-hologram"[\s\S]*?<\/g>)/, `$1${centreText}`);
  // language bars grow in
  out = out.replace(/<rect x="292" y="(\d+)" width="(\d+)" height="3" rx="1.5" fill="(#[0-9a-fA-F]{6})"\/>/g, (all, y, w, fill) => {
    if (fill.toLowerCase() === "#ffffff") return all;
    return `<rect x="292" y="${y}" width="${w}" height="3" rx="1.5" fill="${fill}"><animate attributeName="width" from="0" to="${w}" dur="1.4s" fill="freeze"/></rect>`;
  });
  report.donut = n;
  return out;
}

function enhanceLegend(svg, terrainSvg, report) {
  const rectRe = /<rect x="(\d+)" y="91" width="14" height="14" rx="3" class="c(\d)t"\/>/g;
  const squares = [...svg.matchAll(rectRe)];
  const less = svg.match(/<text x="40" y="102" font-size="12" class="weak">Less<\/text>/);
  const more = svg.match(/<text x="168" y="102" font-size="12" class="weak">More<\/text>/);
  if (squares.length !== 5 || !less || !more) return svg;
  // the real range of contributions behind each shade, read from the terrain's tooltips
  const ranges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (const m of (terrainSvg || "").matchAll(/<title>[^:]*: (\d+) contributions?<\/title><rect[^>]*class="c(\d)t"/g)) {
    const level = Number(m[2]), count = Number(m[1]);
    ranges[level][0] = Math.min(ranges[level][0], count);
    ranges[level][1] = Math.max(ranges[level][1], count);
  }
  const label = ([lo, hi], level) => (lo === Infinity ? "" : lo === hi ? `${lo}` : level === 4 ? `${lo}+` : `${lo}–${hi}`);
  const W = 32, GAP = 8, X0 = 72, Y = 86;
  let block = `<text x="40" y="${Y + 14}" font-size="12" class="weak">Less</text>`;
  squares.forEach((m, k) => {
    const x = X0 + k * (W + GAP);
    const begin = f1(k * (BEAT / 5));
    block += `<rect x="${x}" y="${Y}" width="${W}" height="${W - 4}" rx="5" class="c${k}t" stroke="#ffffff" stroke-opacity="0.12">`
      + `<animate attributeName="opacity" values="1;0.5;1;1" keyTimes="0;0.07;0.16;1" dur="${BEAT}s" begin="${begin}s" repeatCount="indefinite"/></rect>`
      + `<text x="${x + W / 2}" y="${Y + W + 8}" font-size="10" text-anchor="middle" class="weak">${label(ranges[k], k)}</text>`;
  });
  block += `<text x="${X0 + 5 * (W + GAP) - GAP + 8}" y="${Y + 14}" font-size="12" class="weak">More</text>`;
  report.legend = ranges.map(label).join(" | ");
  let out = svg.replace(rectRe, "").replace(less[0], "").replace(more[0], "");
  // put the new legend where the old one was: right before the terrain slot (after the title text)
  return out.replace(/(<text x="40" y="68"[^>]*>Last 12 weeks<\/text>)/, `$1${block}`);
}

function enhancePills(svg, track, report) {
  const lines = svg.split("\n");
  const out = [];
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="14" class="card kpi-pill"\/>/);
    if (!m) { out.push(lines[i]); continue; }
    const group = [lines[i]];
    while (i + 1 < lines.length && lines[i + 1].startsWith("<text")) group.push(lines[++i]);
    const [x, y, w, h] = m.slice(1).map(Number);
    const centre = [x + w / 2, y + h / 2];
    const idx = count++;
    // a small wave along the row, one pill after another, on the shared beat
    let anims = `<animateTransform attributeName="transform" type="translate" additive="sum" dur="${BEAT}s" begin="${f1(idx * (BEAT / 8))}s" repeatCount="indefinite" keyTimes="0;0.08;0.2;1" values="0 0;0 -3;0 0;0 0"/>`;
    if (reached(track, centre, 110)) {
      const series = reactionSeries(track, (p) => {
        const d = dist(p, centre);
        if (d >= 110) return [0, 0];
        return [0, -smooth(clamp((110 - d) / 70, 0, 1)) * 9];
      });
      const sparse = sparseIndices(series, track);
      if (sparse[sparse.length - 1] !== series.length - 1) sparse.push(series.length - 1);
      anims += `<animateTransform attributeName="transform" type="translate" additive="sum" dur="${f1(track.duration)}s" repeatCount="indefinite" keyTimes="${keyTimesOf(timesOf(sparse, track), track)}" values="${sparse.map((k) => `${f1(series[k][0])} ${f1(series[k][1])}`).join(";")}"/>`;
    }
    out.push(`<g>${group.join("\n")}${anims}</g>`);
  }
  if (count) report.pills = count;
  return out.join("\n");
}

export function enhanceCard(cardRest, terrainSvg, track) {
  const report = {};
  let svg = cardRest;
  try {
    svg = enhanceRadar(svg, track, report);
    svg = enhanceDonut(svg, track, report);
    svg = enhanceLegend(svg, terrainSvg, report);
    svg = enhancePills(svg, track, report);
  } catch (error) {
    // a card we do not understand must never break the build: fall back to the plain card
    return { svg: cardRest, report: { error: String(error) } };
  }
  return { svg: DEFS + svg, report };
}
