// The profile card: card/template.svg with four live parts filled in from the profile data.
//
//   <!--@terrain-->    the 3D bars, one per day of the last 12 weeks
//   <!--@radar-->      the contribution-mix radar (commits, issues, pull requests, reviews, repos)
//   <!--@languages-->  the language donut and its legend
//   <!--@pills-->      the row of totals along the bottom
//
// Pure functions: the same profile always gives the same SVG.

import { RULES } from "../rules/index.mjs";

const ACCENT = "#e2e8f0"; // the template's accent colour (Monochrome Platinum)

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n, d = 2) => Number(n).toFixed(d);

// ---------- 3D terrain ----------
export const WINDOW_WEEKS = RULES.card.terrainWeeks;
const LEVELS = { FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
export const LEVEL_HEIGHT = [2.6, 5.24, 18.85, 34.43, 63.87];
const LEVEL_FLOAT = [-7, -7, -10, -12, -14];

// One column per cell of a weeks-by-weekdays grid; a partial week is placed by weekday.
function gridWeeks(weeks) {
  return weeks.slice(-WINDOW_WEEKS).map((week) => {
    const cells = Array(7).fill(null);
    for (const day of week) cells[new Date(`${day.date}T00:00:00Z`).getUTCDay()] = day;
    return cells;
  });
}

export function buildTerrain(weeks) {
  const grid = gridWeeks(weeks);
  const scale = 1.25, cx = 400, cy = 305, wavePeriod = 3;
  const n = grid.length;
  const midX = ((n - 1) * 20 + (0 - 6) * 20) / 2 + 18;
  const midY = ((n - 1 + 6) * 11.547) / 2;
  const cells = [];
  grid.forEach((week, w) => week.forEach((day, d) => day && cells.push({ w, d, day })));
  cells.sort((a, b) => a.w + a.d - (b.w + b.d) || a.w - b.w); // back to front
  const cols = cells.map(({ w, d, day }) => {
    const lvl = LEVELS[day.level] || 0;
    const h = LEVEL_HEIGHT[lvl];
    const x = cx + ((w - d) * 20 - midX) * scale;
    const y = cy + ((w + d) * 11.547 - 1.15 * h - midY) * scale;
    const phase = (w * 0.42 + d * 0.26) % wavePeriod;
    const plural = day.count === 1 ? "" : "s";
    return `<g class="iso-col" transform="translate(${f(x)} ${f(y)}) scale(${scale})">`
      + `<title>${day.date}: ${day.count} contribution${plural}</title>`
      + `<rect x="0" y="0" width="18" height="18" transform="skewY(-30) skewX(40.89) scale(1 1.15)" class="c${lvl}t" stroke="#fff" stroke-opacity="0.06" stroke-width="0.5"></rect>`
      + `<rect x="0" y="0" width="18" height="${f(h)}" transform="skewY(30) scale(1 1.15)" class="c${lvl}l"><animate attributeName="height" values="2.6;${f(h)}" dur="3s" repeatCount="1"></animate></rect>`
      + `<rect x="0" y="0" width="18" height="${f(h)}" transform="translate(18 10.39) skewY(-30) scale(1 1.15)" class="c${lvl}r"><animate attributeName="height" values="2.6;${f(h)}" dur="3s" repeatCount="1"></animate></rect>`
      + `<animateTransform attributeName="transform" type="translate" values="0,0; 0,${LEVEL_FLOAT[lvl]}; 0,0" dur="${f(wavePeriod, 1)}s" begin="-${f(phase)}s" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" keyTimes="0; 0.5; 1"/>`
      + `</g>`;
  });
  return `<g id="terrain-island" class="terrain-3d">\n${cols.join("\n")}\n</g>`;
}

// ---------- radar ----------
const RADAR = { cx: 1015, cy: 310, rMin: RULES.radar.innerRing, rMax: RULES.radar.outerRing, labelR: 160, perLog: RULES.radar.pixelsPerLog };
const AXES = [
  { key: "commits", label: "Commit", deg: -90, anchor: "middle" },
  { key: "issues", label: "Issue", deg: -18, anchor: "start" },
  { key: "pullRequests", label: "PullReq", deg: 54, anchor: "start" },
  { key: "reviews", label: "Review", deg: 126, anchor: "end" },
  { key: "repos", label: "Repo", deg: 198, anchor: "end" },
];

// The classic contribution-mix shape: nothing sits on the inner ring (20.8) and a spoke grows by 10
// for every factor of e in the count, so 560 commits reach about 84 and 7 repos about 42.
export function radarRadius(value) {
  if (value <= 0) return RADAR.rMin;
  return Math.min(RADAR.rMax, RADAR.rMin + RADAR.perLog * Math.log(1 + value));
}

export function buildRadar(totals) {
  const pts = AXES.map((a) => {
    const r = radarRadius(totals[a.key]);
    const rad = (a.deg * Math.PI) / 180;
    return [RADAR.cx + r * Math.cos(rad), RADAR.cy + r * Math.sin(rad)];
  });
  const out = [`<polygon points="${pts.map(([x, y]) => `${f(x, 1)},${f(y, 1)}`).join(" ")}" fill="url(#radarFill)" stroke="${ACCENT}" stroke-width="1.8" stroke-linejoin="round"/>`];
  AXES.forEach((a, i) => {
    const rad = (a.deg * Math.PI) / 180;
    const lx = RADAR.cx + RADAR.labelR * Math.cos(rad), ly = RADAR.cy + RADAR.labelR * Math.sin(rad);
    out.push(
      `<circle class="radar-node" cx="${f(pts[i][0], 1)}" cy="${f(pts[i][1], 1)}" r="4" fill="${ACCENT}"/>`,
      `<text x="${f(lx, 1)}" y="${f(ly, 1)}" font-size="16" font-weight="600" text-anchor="${a.anchor}" class="fg">${a.label}</text>`,
      `<text x="${f(lx, 1)}" y="${f(ly + 18, 1)}" font-size="14" font-weight="700" text-anchor="${a.anchor}" class="strong">${totals[a.key]}</text>`,
    );
  });
  return out.join("\n");
}

// ---------- languages ----------
export function buildLanguages(languages) {
  const total = languages.reduce((a, l) => a + l.bytes, 0);
  if (!total) return "";
  const cx = 150, cy = 663, bigR = 90, smallR = 52;
  let angle = -Math.PI / 2;
  const slices = languages.map((l) => {
    const a1 = angle, a2 = angle + (l.bytes / total) * 2 * Math.PI;
    angle = a2;
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (r, a) => `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
    const d = `M${p(bigR, a1)}A${bigR},${bigR},0,${large},1,${p(bigR, a2)}L${p(smallR, a2)}A${smallR},${smallR},0,${large},0,${p(smallR, a1)}Z`;
    const size = l.bytes > 1024 ? `${f(l.bytes / 1024, 1)} KB` : `${l.bytes} B`;
    return `<path d="${d}" class="donut-slice" fill="${esc(l.color)}" stroke="none"><title>${esc(l.name)} ${size}</title><animate attributeName="fill-opacity" values="0;1" dur="1.2s" fill="freeze"/></path>`;
  });
  const rows = languages.map((l, i) => {
    const share = l.bytes / total, pct = share * 100;
    const pctText = pct < 1 ? `${f(pct, 1)}%` : `${Math.round(pct)}%`;
    const bar = Math.max(2, Math.round(132 * share));
    const y = 572 + i * 30;
    return `<rect x="270" y="${y}" width="13" height="13" rx="3" fill="${esc(l.color)}"/>\n`
      + `<text x="292" y="${y + 11}" font-size="14" class="fg">${esc(l.name)}</text>\n`
      + `<text x="424" y="${y + 11}" font-size="14" font-weight="700" text-anchor="end" class="weak">${pctText}</text>\n`
      + `<rect x="292" y="${y + 17}" width="132" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.08"/>\n`
      + `<rect x="292" y="${y + 17}" width="${bar}" height="3" rx="1.5" fill="${esc(l.color)}"/>`;
  });
  return `<g id="donut-hologram" class="donut-dial">\n${slices.join("\n")}\n</g>\n${rows.join("\n")}`;
}

// ---------- the row of totals ----------
const PILL_ROW_WIDTH = 1200; // the card is 1280 wide: a 30 px margin on the left, about 50 on the right
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function sinceLabel(date) {
  const [y, m] = date.split("-").map(Number);
  return `since ${MONTHS[m - 1]} ${y}`;
}

// Big totals are shortened so the row of pills always fits: 12345 -> "12.3k".
export function compact(n) {
  if (n < RULES.card.shortenFrom) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function buildPills(profile) {
  const t = profile.totals;
  const items = [
    { n: t.contributions, label: "contributions" },
    { n: t.commits, label: "commits" },
    { n: t.pullRequests, label: "pull requests" },
    { n: t.repos, label: "repos" },
    { n: t.stars, label: "stars" },
    { n: t.forks, label: "forks" },
    { n: t.contributions, label: sinceLabel(profile.firstContribution), note: `${t.contributions} contributions, ${profile.activeDays} active days` },
  ];
  let x = 30;
  const pills = items.map((it) => {
    const num = compact(it.n);
    const numW = Math.round(num.length * 17.4);
    const width = 18 + numW + 8 + Math.round(it.label.length * 7.6) + 18;
    const svg = `<rect x="${x}" y="786" width="${width}" height="46" rx="14" class="card kpi-pill"/>
`
      + `<text x="${x + 18}" y="818" font-size="26" font-weight="800" class="strong">${num}</text>
`
      + `<text x="${x + 18 + numW + 8}" y="817" font-size="14" class="weak">${esc(it.label)}${it.note ? `<title>${esc(it.note)}</title>` : ""}</text>`;
    x += width + 14;
    return svg;
  });
  // The row must stay inside the card: when the numbers grow, the whole row shrinks to fit.
  const natural = x - 14 - 30;
  const scale = Math.min(1, PILL_ROW_WIDTH / natural);
  const row = pills.join("\n");
  return scale < 1 ? `<g id="pill-row" transform="translate(30 786) scale(${f(scale, 4)}) translate(-30 -786)">
${row}
</g>` : row;
}

// ---------- the whole card ----------
export function renderCard(template, profile) {
  const fill = { terrain: buildTerrain(profile.weeks), radar: buildRadar(profile.totals), languages: buildLanguages(profile.languages), pills: buildPills(profile) };
  let svg = template.replace(/@user@/g, esc(profile.login));
  for (const [name, xml] of Object.entries(fill)) {
    const marker = `<!--@${name}-->`;
    if (!svg.includes(marker)) throw new Error(`card: template has no ${marker}`);
    svg = svg.replace(marker, () => xml);
  }
  if (/<!--@\w+-->|@user@/.test(svg)) throw new Error("card: a placeholder was left unfilled");
  return svg;
}
