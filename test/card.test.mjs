import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeProfile } from "../card/profile.mjs";
import { renderCard, buildTerrain, buildRadar, buildPills, buildLanguages, radarRadius, sinceLabel, compact, WINDOW_WEEKS } from "../card/card.mjs";
import { graphql } from "./fixture.mjs";

const template = fs.readFileSync(new URL("../card/template.svg", import.meta.url), "utf8");
const profile = (o) => normalizeProfile(graphql(o), { login: "me", now: new Date("2026-11-07T12:00:00Z") });

test("the card fills every placeholder and keeps the markup the scene relies on", () => {
  const svg = renderCard(template, profile());
  assert.ok(!/<!--@\w+-->|@user@/.test(svg));
  for (const needle of ['id="terrain-island"', 'id="donut-hologram"', 'class="radar-node"', 'fill="url(#radarFill)"', 'class="iso-col"', "kpi-pill"]) {
    assert.ok(svg.includes(needle), needle);
  }
  assert.ok(!/NaN|undefined/.test(svg));
});

test("the terrain has one bar per day of the last 12 weeks, partial weeks placed by weekday", () => {
  const p = profile();
  assert.equal(buildTerrain(p.weeks).match(/class="iso-col"/g).length, p.weeks.slice(-WINDOW_WEEKS).flat().length);
  const partial = p.weeks.map((w, i) => (i === p.weeks.length - 1 ? w.slice(0, 3) : w));
  assert.equal(buildTerrain(partial).match(/class="iso-col"/g).length, partial.slice(-WINDOW_WEEKS).flat().length);
});

test("the radar keeps its classic shape: 0 on the inner ring, slow growth, never past the outer ring", () => {
  assert.equal(radarRadius(0), 20.8);
  assert.ok(radarRadius(5) < radarRadius(10));
  assert.ok(Math.abs(radarRadius(561) - 84) < 1, "560 commits reach about 84");
  assert.ok(Math.abs(radarRadius(7) - 41.6) < 0.1, "7 repos reach about 42");
  assert.equal(radarRadius(1e12), 126);
  const low = buildRadar({ commits: 10, issues: 0, pullRequests: 0, reviews: 0, repos: 1 });
  const high = buildRadar({ commits: 500, issues: 20, pullRequests: 20, reviews: 20, repos: 15 });
  assert.notEqual(low, high);
  assert.match(high, />500<\/text>/);
  assert.ok(!/NaN/.test(low + high));
});

test("the row of totals never overlaps and stays inside the card, however big the numbers", () => {
  for (const totals of [
    { contributions: 573, commits: 561, pullRequests: 6, issues: 0, reviews: 0, repos: 7, stars: 0, forks: 0 },
    { contributions: 12345, commits: 9999, pullRequests: 1234, issues: 12, reviews: 5, repos: 120, stars: 4567, forks: 890 },
    { contributions: 123456, commits: 99999, pullRequests: 12345, issues: 12, reviews: 5, repos: 120, stars: 45678, forks: 8900 },
  ]) {
    const p = profile();
    p.totals = totals;
    const xml = buildPills(p);
    const scale = Number((xml.match(/scale\(([\d.]+)\)/) || [, 1])[1]);
    const rects = [...xml.matchAll(/<rect x="(\d+)" y="786" width="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[1]) + Number(m[2])]);
    assert.equal(rects.length, 7);
    rects.forEach((r, i) => { if (i) assert.ok(r[0] > rects[i - 1][1], "pills do not overlap"); });
    assert.ok(30 + (rects.at(-1)[1] - 30) * scale <= 1250, `pills fit (end ${30 + (rects.at(-1)[1] - 30) * scale})`);
  }
});

test("languages: shares add up and names are escaped", () => {
  const xml = buildLanguages([{ name: "A&B <x>", color: "#fff000", bytes: 3000 }, { name: "Z", color: "#000fff", bytes: 1000 }]);
  assert.match(xml, /A&amp;B &lt;x&gt;/);
  assert.match(xml, />75%</);
  assert.equal(buildLanguages([]), "");
});

test("sinceLabel and compact numbers", () => {
  assert.equal(sinceLabel("2026-08-19"), "since Aug 2026");
  assert.deepEqual([999, 9999, 10000, 12345, 123456, 2500000].map(compact), ["999", "9999", "10k", "12.3k", "123.5k", "2.5M"]);
});
