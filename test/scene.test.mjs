import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { routeSeed, ROUTE_PERIOD_MS, buildScene, SCENE } from "../scene/scene.mjs";
import { planFamily } from "../scene/family.mjs";

test("the route seed stays the same for 5 hours and changes after", () => {
  const t0 = Math.floor(Date.parse("2026-11-07T00:00:00Z") / ROUTE_PERIOD_MS) * ROUTE_PERIOD_MS;
  const a = routeSeed("me", new Date(t0));
  assert.equal(routeSeed("me", new Date(t0 + ROUTE_PERIOD_MS - 1)), a);
  assert.notEqual(routeSeed("me", new Date(t0 + ROUTE_PERIOD_MS)), a);
  assert.notEqual(routeSeed("you", new Date(t0)), a);
});

const D = (date, count) => ({ date, count });
const run = (start, n, count = 3) => Array.from({ length: n }, (_, i) => D(new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), count));
const NOW = new Date("2026-11-07T00:00:00Z");

test("family: the parent is always there", () => {
  const f = planFamily([], NOW);
  assert.equal(f.fish.length, 1);
  assert.equal(f.fish[0].kind, "parent");
});

test("family: a baby for every full 7 days of streak, a fish per milestone", () => {
  const f = planFamily([...run("2026-10-01", 15), D("2026-10-16", 0), ...run("2026-10-17", 3, 200)], new Date("2026-10-20T00:00:00Z"));
  assert.deepEqual(f.fish.slice(1).map((x) => x.kind).sort(), ["milestone", "streak", "streak"]);
  assert.equal(f.total, 45 + 600);
});

test("family: at most 5 fish, the oldest babies retire", () => {
  const f = planFamily(run("2026-08-01", 90, 1), NOW); // a 90-day streak is 12 babies
  assert.equal(f.fish.length, 5);
  assert.equal(f.retired, 12 - 4);
});

test("family: babies grow from 55% to full size over 30 days", () => {
  const keepActive = (from, to) => run(from, to, 1).map((d, i) => (i % 2 ? d : { ...d, count: 0 })); // active every other day: no streaks
  const young = planFamily([...run("2026-11-01", 7)], NOW).fish[1];
  assert.ok(young.growth < 0.6, `a week-old baby is small (${young.growth})`);
  const older = planFamily([...run("2026-08-01", 7), ...keepActive("2026-08-08", 91)], NOW);
  assert.equal(older.fish[1].growth, 1, "a three-month-old baby is full size");
});

test("family: after 14 idle days the newest fish fades, the parent stays", () => {
  const days = [...run("2026-09-01", 14), ...run("2026-09-15", 30, 0)]; // two babies, then silence
  assert.equal(planFamily(days, new Date("2026-09-20T00:00:00Z")).fish.length, 3);
  const idle = planFamily(days, new Date("2026-10-20T00:00:00Z"));
  assert.ok(idle.idle >= 28);
  assert.equal(idle.fish[0].kind, "parent");
  assert.equal(idle.fish.length, 1);
});

test("the scene draws one animated fish per family member, all inside the scene", () => {
  const sprite = { w: 40, h: 20, frames: 8, b64: "AAAA", pivot: [10, 10] };
  const header = fs.readFileSync(new URL("../scene/header.svg", import.meta.url), "utf8");
  const card = fs.readFileSync(new URL("../card/template.svg", import.meta.url), "utf8").replace(/<!--@\w+-->/g, "").replace("@user@", "me");
  const family = planFamily(run("2026-10-01", 15), NOW).fish;
  const { svg, meta } = buildScene({ seed: 7, sprite, family, headerSvg: header, cardSvg: card });
  assert.equal((svg.match(/<animateMotion/g) || []).length, family.length);
  assert.equal(meta.routes.length, family.length);
  for (const r of meta.routes) for (const [x, y] of r.waypoints) assert.ok(x > -80 && x < SCENE.width + 80 && y > -80 && y < SCENE.height + 80);
});
