//! Shared helpers for the tests: a synthetic GitHub answer, small builders and file readers.
#![allow(dead_code)]

use std::{fs, path::PathBuf, process::Command};

use chrono::{DateTime, Duration, NaiveDate, Utc};
use nyx::{
    life::Life,
    profile::{Day, Profile, normalize},
    rules::rules,
    scene::Sprite,
};
use serde_json::{Value, json};

/// The repository root (`.github/engine` is two levels down).
pub fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// A file from the repository, with Windows line endings flattened.
pub fn read(rel: &str) -> String {
    fs::read_to_string(root().join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}")).replace("\r\n", "\n")
}

pub fn sheet(name: &str) -> String {
    read(&format!(".github/rules/{name}"))
}

/// Files tracked by git, or `None` when this is not a git checkout.
pub fn tracked() -> Option<Vec<String>> {
    let out = Command::new("git").arg("ls-files").current_dir(root()).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).lines().map(str::to_string).collect())
}

pub fn at(iso: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(iso).expect("time").with_timezone(&Utc)
}

pub fn ms(iso: &str) -> i64 {
    at(iso).timestamp_millis()
}

fn level(count: u64) -> &'static str {
    match count {
        0 => "NONE",
        1..=4 => "FIRST_QUARTILE",
        5..=14 => "SECOND_QUARTILE",
        15..=29 => "THIRD_QUARTILE",
        _ => "FOURTH_QUARTILE",
    }
}

pub fn date_plus(start: &str, days: i64) -> String {
    (NaiveDate::parse_from_str(start, "%Y-%m-%d").expect("date") + Duration::days(days)).to_string()
}

/// A synthetic GraphQL answer shaped like GitHub's. `counts(i)` is the count for day i
/// (0 = oldest); the calendar ends on `end`.
pub fn graphql(end: &str, days: usize, counts: &dyn Fn(usize) -> u64) -> Value {
    let all: Vec<(String, u64)> = (0..days).map(|i| (date_plus(end, i as i64 - (days as i64 - 1)), counts(i))).collect();
    let weeks: Vec<Value> = all
        .chunks(7)
        .map(|w| json!({ "contributionDays": w.iter().map(|(d, c)| json!({ "date": d, "contributionCount": c, "contributionLevel": level(*c) })).collect::<Vec<_>>() }))
        .collect();
    let total: u64 = all.iter().map(|d| d.1).sum();
    json!({ "data": { "user": {
        "createdAt": "2026-08-19T10:56:50Z",
        "contributionsCollection": {
            "totalCommitContributions": 100, "totalIssueContributions": 2, "totalPullRequestContributions": 6,
            "totalPullRequestReviewContributions": 1, "totalRepositoryContributions": 5, "restrictedContributionsCount": 30,
            "contributionCalendar": { "totalContributions": total, "weeks": weeks }
        },
        "repositories": { "totalCount": 4, "nodes": [
            { "isFork": false, "stargazerCount": 3, "forkCount": 1, "languages": { "edges": [
                { "size": 900, "node": { "name": "Rust", "color": "#dea584" } }, { "size": 100, "node": { "name": "Shell", "color": null } } ] } },
            { "isFork": false, "stargazerCount": 0, "forkCount": 0, "languages": { "edges": [
                { "size": 500, "node": { "name": "C#", "color": "#178600" } }, { "size": 80, "node": { "name": "Python", "color": "#3572A5" } },
                { "size": 60, "node": { "name": "HTML", "color": "#e34c26" } }, { "size": 40, "node": { "name": "CSS", "color": "#563d7c" } },
                { "size": 20, "node": { "name": "Dockerfile", "color": "#384d54" } } ] } },
            { "isFork": true, "stargazerCount": 9, "forkCount": 9, "languages": { "edges": [ { "size": 99999, "node": { "name": "Go", "color": "#00ADD8" } } ] } }
        ] }
    } } })
}

pub fn every_third(i: usize) -> u64 {
    if i % 3 == 0 { 4 } else { 0 }
}

/// A calendar like a busy real one: a few big days, some small ones.
pub fn mixed(i: usize) -> u64 {
    if i % 11 == 0 {
        20
    } else if i % 3 == 0 {
        4
    } else if i % 5 == 0 {
        1
    } else {
        0
    }
}

pub fn now() -> DateTime<Utc> {
    at("2026-11-07T12:00:00Z")
}

pub fn profile_with(end: &str, days: usize, counts: &dyn Fn(usize) -> u64) -> Profile {
    normalize(&graphql(end, days, counts), "me", now(), "Asia/Kolkata").expect("a good answer")
}

pub fn profile(counts: &dyn Fn(usize) -> u64) -> Profile {
    profile_with("2026-11-07", 371, counts)
}

/// `n` days in a row starting at `start`, each with `count` contributions.
pub fn run(start: &str, n: usize, count: u64) -> Vec<Day> {
    (0..n).map(|i| Day { date: date_plus(start, i as i64), count, level: "NONE".into() }).collect()
}

pub fn day(date: &str, count: u64) -> Day {
    Day { date: date.into(), count, level: "NONE".into() }
}

pub fn life(state: &'static str) -> Life {
    let s = rules().life.states.get(state);
    Life { state, hour: 12, young: false, speed: s.speed, tail: s.tail, opacity: s.opacity, darts: s.darts }
}

pub fn sprite() -> Sprite {
    Sprite { w: 40, h: 20, frames: 8, length: 30, pivot: [10.0, 10.0], b64: "AAAA".into() }
}

/// FNV-1a, 64 bit: the checksum the golden tests use.
pub fn fnv(text: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in text.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}
