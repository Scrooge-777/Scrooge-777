// The rule sheets in rules/*.md say the same things as rules/rules.json and the code.
// If someone changes a number in one place and not the other, these tests fail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RULES } from "../rules/index.mjs";
import { radarRadius, LEVEL_HEIGHT } from "../src/card/card.mjs";

const sheet = (name) => fs.readFileSync(new URL(`../rules/${name}`, import.meta.url), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const pad = (h) => `${String(h).padStart(2, "0")}:00`;
const has = (text, needle, what) => assert.ok(text.includes(needle), `${what}: expected the sheet to say "${needle}"`);

test("the index lists every sheet and every sheet exists", () => {
  const index = sheet("README.md");
  const files = fs.readdirSync(new URL("../rules/", import.meta.url)).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(files.length >= 5);
  for (const f of files) has(index, `(${f})`, "README index");
  for (const [, link] of index.matchAll(/\]\(([^)]+\.md)\)/g)) assert.ok(fs.existsSync(new URL(`../rules/${link}`, import.meta.url)), link);
});

test("koi-family.md matches the family rules", () => {
  const t = sheet("koi-family.md"), f = RULES.family;
  for (const m of f.milestones) has(t, m.toLocaleString("en-US"), "milestone");
  has(t, `${f.streakDays} full days`, "streak days");
  has(t, `| Most fish at once | ${f.maxFish} `, "max fish");
  has(t, `${Math.round(f.babyStart * 100)}%`, "baby start");
  has(t, `| ${f.growDays} days |`, "grow days");
  has(t, `After ${f.idleDays} days`, "idle days");
  has(t, `after ${f.idleDays * 2}`, "second fade");
});

test("koi-life.md matches the life rules", () => {
  const t = sheet("koi-life.md"), l = RULES.life;
  for (const [state, s] of Object.entries(l.states)) {
    const row = t.split("\n").find((line) => line.startsWith(`| ${state[0].toUpperCase()}${state.slice(1)} |`));
    assert.ok(row, `a table row for ${state}`);
    if (state === "sleep") {
      has(row, `${s.speed} px a second`, "sleep speed");
      has(row, `${Math.round(s.opacity * 100)}%`, "sleep opacity");
    } else has(row, `${Math.round(s.speed * 100)}%`, `${state} speed`);
    if (s.tail !== 1) has(row, `${s.tail} times slower`, `${state} tail`);
  }
  for (const [who, slots] of Object.entries(l.schedule)) {
    const section = t.slice(t.indexOf(who === "adult" ? "Adult fish" : "Young fish"));
    for (const slot of slots) has(section, `| ${pad(slot.from)} | ${pad(slot.to)} | ${slot.state[0].toUpperCase()}${slot.state.slice(1)}`, `${who} ${slot.from}-${slot.to}`);
  }
  has(t, "+1, -1, +2 and -2", "stagger");
  assert.deepEqual(l.stagger, [0, 1, -1, 2, -2]);
  has(t, `| 3 to ${l.hunger.slowestAfterDays - 1} |`, "slower after");
  has(t, `| ${l.hunger.slowestAfterDays} or more |`, "slowest after");
  has(t, `${l.hunger.slowerAfterDays}`, "hunger days");
  has(t, `every ${RULES.route.periodHours} hours`, "route period");
  has(t, `${RULES.route.cruiseSpeed} px a second`, "cruise speed");
});

test("activity-card.md matches the card rules and the code", () => {
  const t = sheet("activity-card.md");
  has(t, `last ${RULES.card.terrainWeeks} weeks`, "terrain weeks");
  has(t, `The ${RULES.card.languagesShown} biggest`, "languages shown");
  has(t, RULES.card.shortenFrom.toLocaleString("en-US"), "shorten from");
  has(t, `inner ring (${RULES.radar.innerRing})`, "inner ring");
  has(t, `outer ring is ${RULES.radar.outerRing}`, "outer ring");
  has(t, `grows by ${RULES.radar.pixelsPerLog}`, "per log");
  // the example table of spoke lengths must be what the code really draws
  const rows = [...t.matchAll(/^\| ([\d,]+) \| ([\d.]+) \|$/gm)].map((m) => [Number(m[1].replace(/,/g, "")), Number(m[2])]);
  assert.ok(rows.length >= 6);
  for (const [count, length] of rows) assert.equal(radarRadius(count).toFixed(1), length.toFixed(1), `spoke for ${count}`);
  // and the bar heights
  const heights = [...t.matchAll(/^\| ([0-4]) \| [^|]+ \| ([\d.]+) \|$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(heights.length, 5);
  for (const [level, h] of heights) assert.equal(LEVEL_HEIGHT[level].toFixed(1), h.toFixed(1), `bar level ${level}`);
});

test("header-and-colours.md names the real palette", () => {
  const t = sheet("header-and-colours.md");
  const template = fs.readFileSync(new URL("../src/card/template.svg", import.meta.url), "utf8");
  for (const hex of ["#1b1f28", "#394254", "#58657d", "#94a3b8", "#e2e8f0"]) {
    has(t, hex, "palette");
    assert.ok(template.includes(hex), `the card template uses ${hex}`);
  }
  const header = fs.readFileSync(new URL("../src/scene/header.svg", import.meta.url), "utf8");
  const title = (header.match(/class="text"[^>]*>([^<]+)</) || [])[1];
  has(t, `| Text | ${title} |`, "title");
});

test("refresh.md matches the workflow", () => {
  const t = sheet("refresh.md");
  const wf = fs.readFileSync(new URL("../workflows/profile.yml", import.meta.url), "utf8");
  has(wf, '"0 */2 * * *"', "the 2-hour schedule");
  has(wf, '"30 18 * * *"', "midnight IST (18:30 UTC)");
  has(wf, 'rules/**', "rule changes trigger a rebuild");
  has(t, "Every 2 hours", "sheet schedule");
  has(t, "midnight", "sheet midnight");
  has(t, "PROFILE_TOKEN", "sheet secret");
  has(wf, "PROFILE_TOKEN", "workflow secret");
});
