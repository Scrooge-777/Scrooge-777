//! Live GitHub data for the profile card: one GraphQL request, strictly validated.
//!
//! The card must never quietly fall back to old numbers. If GitHub returns an error, a missing
//! user, an empty calendar or a calendar that stops days ago, [`normalize`] fails, the workflow
//! fails (so it shows in the Actions tab) and the last good picture stays online.
//!
//! Days are bucketed in the owner's time zone (`PROFILE_TZ`, default `Asia/Kolkata`). Without the
//! `Time-Zone` header GitHub buckets in UTC, which would cut an Indian evening off the card.
use std::process::Command;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Res, rules::rules};

pub const QUERY: &str = r#"
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
}"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Day {
    pub date: String,
    pub count: u64,
    pub level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Totals {
    pub contributions: u64,
    pub commits: u64,
    #[serde(rename = "pullRequests")]
    pub pull_requests: u64,
    pub issues: u64,
    pub reviews: u64,
    pub repos: u64,
    pub stars: u64,
    pub forks: u64,
}

impl Totals {
    /// A total by the name of its radar spoke.
    pub fn by_key(&self, key: &str) -> u64 {
        match key {
            "commits" => self.commits,
            "issues" => self.issues,
            "pullRequests" => self.pull_requests,
            "reviews" => self.reviews,
            "repos" => self.repos,
            _ => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Language {
    pub name: String,
    pub color: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub login: String,
    #[serde(rename = "timeZone")]
    pub time_zone: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub totals: Totals,
    #[serde(rename = "firstContribution")]
    pub first_contribution: String,
    #[serde(rename = "activeDays")]
    pub active_days: usize,
    pub weeks: Vec<Vec<Day>>,
    pub days: Vec<Day>,
    pub languages: Vec<Language>,
}

fn need(cond: bool, msg: impl Into<String>) -> Res<()> {
    if cond { Ok(()) } else { Err(format!("profile: {}", msg.into())) }
}

fn count(v: Option<&Value>, name: &str) -> Res<u64> {
    v.and_then(Value::as_u64).ok_or_else(|| format!("profile: {name} is missing or not a count"))
}

/// The `gh` arguments for the request: the calendar is asked for in the owner's time zone.
pub fn gh_args(login: &str, time_zone: &str) -> Vec<String> {
    vec![
        "api".into(),
        "graphql".into(),
        "-H".into(),
        format!("Time-Zone: {time_zone}"),
        "-f".into(),
        format!("query={QUERY}"),
        "-f".into(),
        format!("login={login}"),
    ]
}

/// Ask GitHub (through the `gh` command, which reads `GH_TOKEN`) and validate the answer.
pub fn fetch(login: &str, token: Option<&str>, time_zone: &str, now: DateTime<Utc>) -> Res<Profile> {
    need(!login.is_empty(), "no login given")?;
    let token = token.filter(|t| !t.is_empty()).ok_or("profile: no GitHub token given (set PROFILE_TOKEN or GITHUB_TOKEN)")?;
    let output = Command::new("gh")
        .args(gh_args(login, time_zone))
        .env("GH_TOKEN", token)
        .output()
        .map_err(|e| format!("profile: could not run gh: {e}"))?;
    if !output.status.success() {
        return Err(format!("profile: GitHub request failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let json: Value = serde_json::from_slice(&output.stdout).map_err(|e| format!("profile: response is not JSON: {e}"))?;
    normalize(&json, login, now, time_zone)
}

/// Turn GitHub's answer into a [`Profile`], or say what is wrong with it.
pub fn normalize(json: &Value, login: &str, now: DateTime<Utc>, time_zone: &str) -> Res<Profile> {
    need(json.is_object(), "response is not JSON")?;
    if let Some(errors) = json.get("errors") {
        let text = errors.to_string();
        return Err(format!("profile: GitHub reported errors: {}", &text[..text.len().min(300)]));
    }
    let user = json.pointer("/data/user").filter(|u| !u.is_null());
    let user = user.ok_or_else(|| format!("profile: no such user{}", if login.is_empty() { String::new() } else { format!(" \"{login}\"") }))?;
    let cc = &user["contributionsCollection"];
    let weeks_json = cc.pointer("/contributionCalendar/weeks").and_then(Value::as_array).filter(|w| !w.is_empty());
    let weeks_json = weeks_json.ok_or("profile: the contribution calendar is empty")?;

    let mut weeks: Vec<Vec<Day>> = Vec::new();
    for w in weeks_json {
        let mut week = Vec::new();
        for d in w["contributionDays"].as_array().ok_or("profile: a calendar week has no days")? {
            let date = d["date"].as_str().unwrap_or("");
            let well_formed = date.len() == 10 && date.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() });
            need(well_formed, format!("bad calendar date \"{date}\""))?;
            week.push(Day {
                date: date.to_string(),
                count: count(d.get("contributionCount"), "contributionCount")?,
                level: d["contributionLevel"].as_str().unwrap_or("NONE").to_string(),
            });
        }
        weeks.push(week);
    }
    let days: Vec<Day> = weeks.iter().flatten().cloned().collect();
    need(days.len() >= 84, format!("the calendar has only {} days", days.len()))?;

    // The calendar must reach "today" (give or take a few days); otherwise it is stale.
    let last_day = days.last().map(|d| d.date.clone()).unwrap_or_default();
    let last_ms = date_ms(&last_day);
    let age_days = (now.timestamp_millis() - last_ms) as f64 / 86_400_000.0;
    need(age_days < 3.0 && age_days > -3.0, format!("the calendar ends {last_day}, which is not near today"))?;

    let total = count(cc.pointer("/contributionCalendar/totalContributions"), "totalContributions")?;
    let sum: u64 = days.iter().map(|d| d.count).sum();
    need(sum == total, format!("calendar days add up to {sum} but GitHub says {total}"))?;

    let repos = user.get("repositories").filter(|r| !r.is_null());
    let repos = repos.ok_or("profile: no repository list")?;
    let nodes: Vec<&Value> = repos["nodes"].as_array().ok_or("profile: no repository list")?.iter().filter(|n| !n.is_null()).collect();
    let stars: u64 = nodes.iter().map(|r| r["stargazerCount"].as_u64().unwrap_or(0)).sum();
    let forks: u64 = nodes.iter().map(|r| r["forkCount"].as_u64().unwrap_or(0)).sum();

    // Bytes per language over the repositories you wrote (forks left out), in first-seen order.
    let mut bytes: Vec<Language> = Vec::new();
    for r in &nodes {
        if r["isFork"].as_bool().unwrap_or(false) {
            continue;
        }
        for e in r["languages"]["edges"].as_array().into_iter().flatten() {
            let name = e["node"]["name"].as_str().unwrap_or("").to_string();
            let size = e["size"].as_u64().unwrap_or(0);
            if let Some(existing) = bytes.iter_mut().find(|l| l.name == name) {
                existing.bytes += size;
            } else {
                bytes.push(Language { name, color: e["node"]["color"].as_str().unwrap_or("#8b949e").to_string(), bytes: size });
            }
        }
    }
    bytes.sort_by(|a, b| b.bytes.cmp(&a.bytes)); // stable: equal sizes keep first-seen order
    let shown = rules().card.languages_shown;
    let mut languages: Vec<Language> = bytes.iter().take(shown).cloned().collect();
    let rest: u64 = bytes.iter().skip(shown).map(|l| l.bytes).sum();
    if rest > 0 {
        languages.push(Language { name: "Others".into(), color: "#8b949e".into(), bytes: rest });
    }

    let active: Vec<&Day> = days.iter().filter(|d| d.count > 0).collect();
    // GitHub keeps private work out of the commit count and reports it as one number.
    let commits = count(cc.get("totalCommitContributions"), "totalCommitContributions")? + count(cc.get("restrictedContributionsCount"), "restrictedContributionsCount")?;
    Ok(Profile {
        login: login.to_string(),
        time_zone: time_zone.to_string(),
        generated_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        totals: Totals {
            contributions: total,
            commits,
            pull_requests: count(cc.get("totalPullRequestContributions"), "totalPullRequestContributions")?,
            issues: count(cc.get("totalIssueContributions"), "totalIssueContributions")?,
            reviews: count(cc.get("totalPullRequestReviewContributions"), "totalPullRequestReviewContributions")?,
            repos: count(repos.get("totalCount"), "repositories.totalCount")?,
            stars,
            forks,
        },
        first_contribution: active.first().map(|d| d.date.clone()).unwrap_or_else(|| days[0].date.clone()),
        active_days: active.len(),
        weeks,
        days,
        languages,
    })
}

/// Midnight UTC of a `YYYY-MM-DD` date, in milliseconds since 1970.
pub fn date_ms(date: &str) -> i64 {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| d.and_hms_opt(0, 0, 0).expect("midnight").and_utc().timestamp_millis())
        .unwrap_or(0)
}
