import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scheduledState, hungerState, planLife, hourIn, STATE_ORDER } from "../src/scene/life.mjs";
import { buildScene, planNest, drift, SCENE } from "../src/scene/scene.mjs";
import { RULES } from "../rules/index.mjs";
import { normalizeProfile } from "../src/card/profile.mjs";
import { renderCard } from "../src/card/card.mjs";
import { graphql } from "./fixture.mjs";

const adult = { growth: 1 };
const baby = { growth: 0.6 };

test("an adult sleeps 23:00-06:00, is calm 06-09 and 18-23, active 09-18", () => {
  const at = (h) => scheduledState(h, false);
  assert.deepEqual([23, 0, 3, 5].map(at), ["sleep", "sleep", "sleep", "sleep"]);
  assert.deepEqual([6, 8, 18, 22].map(at), ["calm", "calm", "calm", "calm"]);
  assert.deepEqual([9, 12, 17].map(at), ["active", "active", "active"]);
});

test("a young fish sleeps early, naps 13:00-15:00 and is active otherwise by day", () => {
  const at = (h) => scheduledState(h, true);
  assert.deepEqual([21, 23, 2, 6].map(at), ["sleep", "sleep", "sleep", "sleep"]);
  assert.deepEqual([13, 14].map(at), ["sleep", "sleep"]);
  assert.deepEqual([9, 12, 15, 17].map(at), ["active", "active", "active", "active"]);
  assert.deepEqual([7, 18, 20].map(at), ["calm", "calm", "calm"]);
});

test("every hour of the day has a state, for both ages", () => {
  for (const young of [false, true]) for (let h = 0; h < 24; h++) assert.ok(STATE_ORDER.includes(scheduledState(h, young)), `${young} ${h}`);
});

test("hunger: 3 days slows one step, 7 days two, a sleeper keeps sleeping, nobody drops below rest", () => {
  assert.equal(hungerState("active", 0), "active");
  assert.equal(hungerState("active", 2), "active");
  assert.equal(hungerState("active", 3), "calm");
  assert.equal(hungerState("calm", 3), "rest");
  assert.equal(hungerState("active", 7), "rest");
  assert.equal(hungerState("calm", 9), "rest");
  assert.equal(hungerState("rest", 30), "rest");
  assert.equal(hungerState("sleep", 30), "sleep");
});

test("the hour comes from the time zone, and each fish keeps its own hours", () => {
  const t = new Date("2026-11-07T06:00:00Z"); // 11:30 in Kolkata
  assert.equal(hourIn("Asia/Kolkata", t), 11);
  assert.equal(hourIn("UTC", t), 6);
  const lives = planLife([adult, adult, adult, adult, adult], { now: new Date("2026-11-07T17:30:00Z"), timeZone: "Asia/Kolkata" }); // 23:00 in Kolkata
  assert.equal(lives[0].state, "sleep");
  assert.equal(lives[0].hour, 23);
  assert.equal(lives[1].hour, 0);
  assert.equal(lives[2].hour, 22, "one fish is still up an hour earlier");
  assert.equal(lives[2].state, "calm");
});

test("each state carries speed, tail beat and look from the rules", () => {
  const [l] = planLife([adult], { now: new Date("2026-11-07T06:00:00Z"), timeZone: "Asia/Kolkata" });
  assert.deepEqual([l.state, l.speed, l.tail, l.opacity, l.darts], ["active", 1, 1, 1, true]);
  const [s] = planLife([baby], { now: new Date("2026-11-07T08:30:00Z"), timeZone: "Asia/Kolkata" }); // 14:00: nap
  assert.deepEqual([s.state, s.opacity], ["sleep", 0.7]);
});

test("a sleeper drifts in a small oval on the terrain floor, slowly", () => {
  const { radiusX, radiusY } = RULES.life.nest;
  for (let i = 0; i < 5; i++) {
    const route = planNest(i, () => 0.5);
    const xs = route.pts.map((p) => p[0]), ys = route.pts.map((p) => p[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 2 * radiusX + 1);
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 2 * radiusX + 1);
    assert.ok(Math.min(...xs) > 170 && Math.max(...xs) < 640, "inside the terrain's width");
    assert.ok(Math.min(...ys) > SCENE.cardY + 160 && Math.max(...ys) < SCENE.cardY + 470, "on the terrain floor");
    const sim = drift(route, RULES.life.states.sleep.speed);
    const pace = route.poly.length / sim.duration;
    assert.ok(Math.abs(pace - 6) < 0.01, "6 px a second");
  }
});

const header = fs.readFileSync(new URL("../src/scene/header.svg", import.meta.url), "utf8");
const card = renderCard(fs.readFileSync(new URL("../src/card/template.svg", import.meta.url), "utf8"), normalizeProfile(graphql({ counts: (i) => (i % 2 ? 12 : 3) }), { login: "me", now: new Date("2026-11-07T12:00:00Z") }));
const sprite = { w: 40, h: 20, frames: 8, b64: "AAAA", pivot: [10, 10] };
const family = (state) => [0, 1, 2].map((i) => ({ kind: i ? "streak" : "parent", growth: i ? 0.8 : 1, age: i ? 20 : Infinity, life: { state, ...RULES.life.states[state] } }));

test("sleeping fish are dimmed and slow, and do not make the bars sway", () => {
  const night = buildScene({ seed: 3, sprite, family: family("sleep"), headerSvg: header, cardSvg: card });
  const day = buildScene({ seed: 3, sprite, family: family("active"), headerSvg: header, cardSvg: card });
  assert.equal(night.meta.swayingBars, 0);
  assert.ok(day.meta.swayingBars > 0);
  assert.ok(night.svg.includes('opacity="0.7"'));
  assert.ok(night.svg.includes('id="koi-sprite-6"'), "the slow tail beat has its own sprite");
  assert.ok(night.svg.length < day.svg.length / 3, "a sleeping scene is much lighter");
  assert.ok(night.meta.routes.every((r) => r.state === "sleep" && r.speed < 8));
});

test("calm and rest fish are slower than active ones and do not dart", () => {
  const speed = (state) => buildScene({ seed: 3, sprite, family: family(state), headerSvg: header, cardSvg: card }).meta.routes[0];
  const [a, c, r] = [speed("active"), speed("calm"), speed("rest")];
  assert.ok(a.darts > 0 && c.darts === 0 && r.darts === 0);
  assert.ok(a.speed > c.speed && c.speed > r.speed, `${a.speed} > ${c.speed} > ${r.speed}`);
  assert.deepEqual([a.length, c.length, r.length].map((n) => Math.round(n)), [Math.round(a.length), Math.round(a.length), Math.round(a.length)], "the route itself does not depend on mood");
});
