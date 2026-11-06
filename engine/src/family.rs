//! Which koi are in the pond, worked out from the account's contribution history.
//! Rules: `rules/koi-family.md`, numbers: `rules/rules.json`.
//!
//! The parent is always there. A new fish is born at every contribution milestone and for every
//! full streak of daily contributions; at most `maxFish` swim at once (the oldest of the others
//! retire first); after `idleDays` without a contribution the newest fish fades. A baby starts
//! small and grows to full size.
use crate::{
    fmt::with_commas,
    profile::{Day, date_ms},
    rules::{FamilyRules, rules},
};

const DAY_MS: f64 = 86_400_000.0;

#[derive(Debug, Clone)]
pub struct Fish {
    /// `parent`, `milestone` or `streak`.
    pub kind: &'static str,
    pub reason: String,
    /// Days since it was born (infinite for the parent).
    pub age: f64,
    /// 1.0 is full size.
    pub growth: f64,
}

#[derive(Debug, Clone)]
pub struct Family {
    pub fish: Vec<Fish>,
    pub total: u64,
    /// Days since the last contribution (infinite if there is none).
    pub idle: f64,
    pub faded: usize,
    pub retired: usize,
}

struct Born {
    kind: &'static str,
    reason: String,
    at: i64,
}

pub fn plan_family(days: &[Day], now_ms: i64) -> Family {
    plan_family_with(days, now_ms, &rules().family)
}

pub fn plan_family_with(days: &[Day], now_ms: i64, rules: &FamilyRules) -> Family {
    let mut born: Vec<Born> = Vec::new();
    let mut total = 0u64;
    let mut reached: Vec<u64> = Vec::new();
    let mut streak = 0u32;
    for d in days {
        total += d.count;
        for &m in &rules.milestones {
            if total >= m && !reached.contains(&m) {
                reached.push(m);
                born.push(Born { kind: "milestone", reason: format!("{} contributions", with_commas(m)), at: date_ms(&d.date) });
            }
        }
        if d.count > 0 {
            streak += 1;
            if streak % rules.streak_days == 0 {
                born.push(Born { kind: "streak", reason: format!("{streak}-day streak"), at: date_ms(&d.date) });
            }
        } else {
            streak = 0;
        }
    }
    born.sort_by_key(|b| b.at); // stable, like the version this replaces

    let keep = rules.max_fish.saturating_sub(1);
    let first_kept = born.len().saturating_sub(keep); // the oldest retire first
    let total_born = born.len();
    let mut kept: Vec<Born> = born.drain(first_kept..).collect();

    let last = days.iter().filter(|d| d.count > 0).map(|d| date_ms(&d.date)).last();
    let idle = match last {
        None => f64::INFINITY,
        Some(last) => ((((now_ms - last) as f64) / DAY_MS).floor()).max(0.0),
    };
    let faded = (kept.len() as f64).min((idle / rules.idle_days).floor()) as usize;
    if faded > 0 {
        kept.truncate(kept.len() - faded); // the newest fade first
    }

    let mut fish = vec![Fish { kind: "parent", reason: "total contributions".into(), age: f64::INFINITY, growth: 1.0 }];
    for b in &kept {
        let age = ((now_ms - b.at) as f64 / DAY_MS).max(0.0);
        let growth = rules.baby_start + (1.0 - rules.baby_start) * (age / rules.grow_days).min(1.0);
        fish.push(Fish { kind: b.kind, reason: b.reason.clone(), age, growth });
    }
    Family { fish, total, idle, faded, retired: total_born - kept.len() - faded }
}
