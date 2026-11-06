// Live GitHub data for the profile card: one GraphQL request, strictly validated.
//
// The card must never quietly fall back to old numbers. If GitHub returns an error, a missing
// user, an empty calendar or a calendar that stops days ago, normalizeProfile() throws, the
// workflow fails (so you see it in the Actions tab) and the last good picture stays online.
//
// Days are bucketed in YOUR time zone (PROFILE_TZ, default Asia/Kolkata). Without the Time-Zone
// header GitHub buckets in UTC, which is why a Kolkata evening could be missing from the card.

import { RULES } from "../../rules/index.mjs";

export const QUERY = `
query ($login: String!) {
  user(login: $login) {
    createdAt
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER) {
      totalCount
      nodes {
        isFork
        stargazerCount
        forkCount
        languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

export class ProfileError extends Error {}

export async function fetchProfile({ login, token, timeZone = "Asia/Kolkata", now = new Date(), fetchImpl = fetch }) {
  if (!login) throw new ProfileError("profile: no login given");
  if (!token) throw new ProfileError("profile: no GitHub token given (set PROFILE_TOKEN or GITHUB_TOKEN)");
  const res = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-card",
      "Time-Zone": timeZone,
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new ProfileError(`profile: GitHub answered HTTP ${res.status}`);
  return normalizeProfile(await res.json(), { login, now, timeZone });
}

const need = (cond, msg) => {
  if (!cond) throw new ProfileError(`profile: ${msg}`);
};
const count = (v, name) => {
  need(Number.isInteger(v) && v >= 0, `${name} is missing or not a count`);
  return v;
};

export function normalizeProfile(json, { login = "", now = new Date(), timeZone = "UTC" } = {}) {
  need(json && typeof json === "object", "response is not JSON");
  if (json.errors) throw new ProfileError(`profile: GitHub reported errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  const user = json.data?.user;
  need(user, `no such user${login ? ` "${login}"` : ""}`);
  const cc = user.contributionsCollection;
  need(cc?.contributionCalendar?.weeks?.length > 0, "the contribution calendar is empty");

  const weeks = cc.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => {
      need(/^\d{4}-\d{2}-\d{2}$/.test(d.date), `bad calendar date "${d.date}"`);
      return { date: d.date, count: count(d.contributionCount, "contributionCount"), level: d.contributionLevel || "NONE" };
    }),
  );
  const days = weeks.flat();
  need(days.length >= 84, `the calendar has only ${days.length} days`);

  // The calendar must reach "today" (in the chosen zone, give or take a day); otherwise it is stale.
  const last = Date.parse(`${days[days.length - 1].date}T00:00:00Z`);
  const ageDays = (now.getTime() - last) / 86400000;
  need(ageDays < 3 && ageDays > -3, `the calendar ends ${days[days.length - 1].date}, which is not near today`);

  const total = count(cc.contributionCalendar.totalContributions, "totalContributions");
  const sum = days.reduce((a, d) => a + d.count, 0);
  need(sum === total, `calendar days add up to ${sum} but GitHub says ${total}`);

  const repos = user.repositories;
  need(repos && Array.isArray(repos.nodes), "no repository list");
  const owned = repos.nodes.filter(Boolean);
  const stars = owned.reduce((a, r) => a + (r.stargazerCount || 0), 0);
  const forks = owned.reduce((a, r) => a + (r.forkCount || 0), 0);

  const bytes = new Map();
  for (const r of owned) {
    if (r.isFork) continue;
    for (const e of r.languages?.edges ?? []) {
      const entry = bytes.get(e.node.name) || { name: e.node.name, color: e.node.color || "#8b949e", bytes: 0 };
      entry.bytes += e.size;
      bytes.set(e.node.name, entry);
    }
  }
  const ranked = [...bytes.values()].sort((a, b) => b.bytes - a.bytes);
  const languages = ranked.slice(0, RULES.card.languagesShown);
  const rest = ranked.slice(RULES.card.languagesShown).reduce((a, l) => a + l.bytes, 0);
  if (rest > 0) languages.push({ name: "Others", color: "#8b949e", bytes: rest });

  const active = days.filter((d) => d.count > 0);
  return {
    login,
    timeZone,
    generatedAt: now.toISOString(),
    // GitHub keeps private work out of the commit count and reports it as one number.
    totals: {
      contributions: total,
      commits: count(cc.totalCommitContributions, "totalCommitContributions") + count(cc.restrictedContributionsCount, "restrictedContributionsCount"),
      pullRequests: count(cc.totalPullRequestContributions, "totalPullRequestContributions"),
      issues: count(cc.totalIssueContributions, "totalIssueContributions"),
      reviews: count(cc.totalPullRequestReviewContributions, "totalPullRequestReviewContributions"),
      repos: count(repos.totalCount, "repositories.totalCount"),
      stars,
      forks,
    },
    firstContribution: active.length ? active[0].date : days[0].date,
    activeDays: active.length,
    weeks,
    days,
    languages,
  };
}
