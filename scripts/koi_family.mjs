// Which koi are in the pond, worked out from the account's contribution history.
//
//   - the parent: always there, its size follows total contributions (drawn by the sprite)
//   - a new fish for every contribution milestone reached (500, 1,000, 2,500, 5,000, 10,000)
//   - a baby for every full 7 days of a daily contribution streak (7, 14, 21 ... days in a row)
//   - at most 5 fish at once: when there are more, the oldest of the others retires
//   - after 14 days without a contribution the newest fish fades away, then another one
//     every further 14 days; the parent always stays
//   - a baby starts at 55% of full size and grows to full size over 30 days
//
// days: [{ date: "YYYY-MM-DD", contribution_count }] in date order; now: a Date.
export const FAMILY = {
  milestones: [500, 1000, 2500, 5000, 10000],
  streakDays: 7,
  maxFish: 5,
  idleDays: 14,
  growDays: 30,
  babyStart: 0.55,
};

const DAY = 86400000;
const at = (date) => Date.parse(`${date}T00:00:00Z`);

export function planFamily(days, now = new Date(), rules = FAMILY) {
  const born = []; // { kind, reason, born (ms) }
  let total = 0;
  const reached = new Set();
  let streak = 0;
  for (const d of days) {
    total += d.contribution_count;
    for (const m of rules.milestones) {
      if (total >= m && !reached.has(m)) {
        reached.add(m);
        born.push({ kind: "milestone", reason: `${m.toLocaleString("en-US")} contributions`, born: at(d.date) });
      }
    }
    if (d.contribution_count > 0) {
      streak++;
      if (streak % rules.streakDays === 0) born.push({ kind: "streak", reason: `${streak}-day streak`, born: at(d.date) });
    } else {
      streak = 0;
    }
  }
  born.sort((a, b) => a.born - b.born);

  let kept = born.slice(Math.max(0, born.length - (rules.maxFish - 1))); // the oldest retire first
  const last = days.filter((d) => d.contribution_count > 0).map((d) => at(d.date)).pop();
  const idle = last === undefined ? Infinity : Math.max(0, Math.floor((now.getTime() - last) / DAY));
  const faded = Math.min(kept.length, Math.floor(idle / rules.idleDays));
  if (faded > 0) kept = kept.slice(0, kept.length - faded); // the newest fade first

  const fish = [{ kind: "parent", reason: "total contributions", age: Infinity, growth: 1 }];
  for (const f of kept) {
    const age = Math.max(0, (now.getTime() - f.born) / DAY);
    fish.push({ ...f, age, growth: rules.babyStart + (1 - rules.babyStart) * Math.min(1, age / rules.growDays) });
  }
  return { fish, total, idle, faded, retired: born.length - kept.length - faded };
}
