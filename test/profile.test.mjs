import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfile, fetchProfile, ProfileError } from "../src/card/profile.mjs";
import { graphql } from "./fixture.mjs";

const now = new Date("2026-11-07T12:00:00Z");

test("a good response becomes a profile with every number", () => {
  const p = normalizeProfile(graphql(), { login: "me", now });
  assert.equal(p.days.length, 371);
  assert.equal(p.totals.contributions, p.days.reduce((a, d) => a + d.count, 0));
  assert.equal(p.totals.commits, 130, "commits = public commits + private (restricted) contributions");
  assert.deepEqual([p.totals.pullRequests, p.totals.issues, p.totals.reviews, p.totals.repos], [6, 2, 1, 4]);
  assert.deepEqual([p.totals.stars, p.totals.forks], [12, 10]);
});

test("languages: forks are ignored, the top 4 stay and the rest become Others", () => {
  const p = normalizeProfile(graphql(), { login: "me", now });
  assert.deepEqual(p.languages.map((l) => l.name), ["Rust", "C#", "Shell", "Python", "Others"]);
  assert.equal(p.languages.at(-1).bytes, 60 + 40 + 20);
  assert.ok(p.languages.every((l) => /^#[0-9a-f]{6}$/i.test(l.color)), "a missing colour gets a default");
});

test("it refuses to build from bad data instead of falling back to old numbers", () => {
  const broken = (fn) => { const g = graphql(); fn(g.data.user); return g; };
  const bad = [
    [{ errors: [{ message: "Bad credentials" }] }, /errors/],
    [{ data: { user: null } }, /no such user/],
    [graphql({ overrides: { contributionsCollection: { contributionCalendar: { weeks: [] } } } }), /empty/],
    [graphql({ end: "2026-10-01" }), /not near today/],
    [graphql({ days: 20 }), /only 20 days/],
    [broken((u) => { u.contributionsCollection.contributionCalendar.totalContributions += 5; }), /add up/],
    [broken((u) => { delete u.contributionsCollection.totalCommitContributions; }), /totalCommitContributions/],
    [broken((u) => { u.repositories = null; }), /repository list/],
  ];
  for (const [json, why] of bad) {
    assert.throws(() => normalizeProfile(json, { login: "me", now }), (e) => e instanceof ProfileError && why.test(e.message), String(why));
  }
});

test("fetchProfile asks GitHub for the calendar in the chosen time zone", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => graphql() }; };
  const p = await fetchProfile({ login: "me", token: "t", timeZone: "Asia/Kolkata", now, fetchImpl });
  assert.equal(seen.init.headers["Time-Zone"], "Asia/Kolkata");
  assert.equal(seen.init.headers.Authorization, "Bearer t");
  assert.equal(p.timeZone, "Asia/Kolkata");
  await assert.rejects(fetchProfile({ login: "me", token: "", now, fetchImpl }), /no GitHub token/);
  await assert.rejects(fetchProfile({ login: "me", token: "t", now, fetchImpl: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
});
