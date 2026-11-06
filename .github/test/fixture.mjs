// A synthetic GraphQL response shaped like GitHub's, for tests.
export function day(date, count) {
  const level = count === 0 ? "NONE" : count < 5 ? "FIRST_QUARTILE" : count < 15 ? "SECOND_QUARTILE" : count < 30 ? "THIRD_QUARTILE" : "FOURTH_QUARTILE";
  return { date, contributionCount: count, contributionLevel: level };
}

// `counts(i)` gives the count for day i (0 = oldest). The calendar ends on `end`.
export function graphql({ end = "2026-11-07", days = 371, counts = (i) => (i % 3 === 0 ? 4 : 0), overrides = {} } = {}) {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const all = Array.from({ length: days }, (_, i) => day(new Date(endMs - (days - 1 - i) * 86400000).toISOString().slice(0, 10), counts(i)));
  const weeks = [];
  for (let i = 0; i < all.length; i += 7) weeks.push({ contributionDays: all.slice(i, i + 7) });
  const total = all.reduce((a, d) => a + d.contributionCount, 0);
  return {
    data: {
      user: {
        createdAt: "2026-08-19T10:56:50Z",
        contributionsCollection: {
          totalCommitContributions: 100,
          totalIssueContributions: 2,
          totalPullRequestContributions: 6,
          totalPullRequestReviewContributions: 1,
          totalRepositoryContributions: 5,
          restrictedContributionsCount: 30,
          contributionCalendar: { totalContributions: total, weeks },
        },
        repositories: {
          totalCount: 4,
          nodes: [
            { isFork: false, stargazerCount: 3, forkCount: 1, languages: { edges: [{ size: 900, node: { name: "Rust", color: "#dea584" } }, { size: 100, node: { name: "Shell", color: null } }] } },
            { isFork: false, stargazerCount: 0, forkCount: 0, languages: { edges: [{ size: 500, node: { name: "C#", color: "#178600" } }, { size: 80, node: { name: "Python", color: "#3572A5" } }, { size: 60, node: { name: "HTML", color: "#e34c26" } }, { size: 40, node: { name: "CSS", color: "#563d7c" } }, { size: 20, node: { name: "Dockerfile", color: "#384d54" } }] } },
            { isFork: true, stargazerCount: 9, forkCount: 9, languages: { edges: [{ size: 99999, node: { name: "Go", color: "#00ADD8" } }] } },
          ],
        },
        ...overrides,
      },
    },
  };
}
