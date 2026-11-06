//! The whole run, end to end: live data, card, koi family, sprite, scene.
use std::{fs, path::Path};

use chrono::{DateTime, Utc};
use git_koi::{
    collect::{GhCli, collect_account_snapshot},
    history::AccountSnapshot,
};

use crate::{
    Res,
    card::{TEMPLATE, render_card},
    family::plan_family,
    fmt::{js_round, num},
    life::plan_life,
    profile::{Profile, fetch, normalize},
    scene::{Member, Sprite, build_scene, route_seed},
    sprite::{pack, render_frames},
};

pub const HEADER: &str = include_str!("../data/header.svg");

/// What to build and from what. Anything left out is fetched live.
#[derive(Default)]
pub struct Options {
    pub login: String,
    pub time_zone: String,
    pub now: Option<DateTime<Utc>>,
    /// GitHub token for the profile data (the koi snapshot uses `gh`'s own `GH_TOKEN`).
    pub token: Option<String>,
    /// A saved GraphQL answer instead of asking GitHub (offline runs and tests).
    pub from_json: Option<String>,
    /// A saved koi snapshot instead of collecting one.
    pub snapshot: Option<String>,
    pub seed: Option<u32>,
}

pub struct Built {
    pub profile: Profile,
    pub card: String,
    pub sprite: Sprite,
    pub svg: String,
    pub summary: String,
}

pub fn load_profile(o: &Options, now: DateTime<Utc>) -> Res<Profile> {
    match &o.from_json {
        Some(path) => {
            let text = fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
            let json = serde_json::from_str(&text).map_err(|e| format!("{path}: {e}"))?;
            normalize(&json, &o.login, now, &o.time_zone)
        }
        None => fetch(&o.login, o.token.as_deref(), &o.time_zone, now),
    }
}

pub fn load_snapshot(o: &Options, now: DateTime<Utc>) -> Res<AccountSnapshot> {
    match &o.snapshot {
        Some(path) => {
            let text = fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
            serde_json::from_str(&text).map_err(|e| format!("{path}: {e}"))
        }
        None => collect_account_snapshot(&GhCli, &o.login, now.date_naive()).map_err(|e| format!("koi: {e}")),
    }
}

/// Run every stage and return the finished picture. Writes nothing.
pub fn build(o: &Options) -> Res<Built> {
    let now = o.now.unwrap_or_else(Utc::now);
    let profile = load_profile(o, now)?;
    let card = render_card(TEMPLATE, &profile)?;
    let snapshot = load_snapshot(o, now)?;
    let sprite = pack(&render_frames(&snapshot, profile.totals.contributions)?)?;
    let (svg, summary) = scene_from(&profile, &card, &sprite, now, o.seed)?;
    Ok(Built { profile, card, sprite, svg, summary })
}

/// Plan the family and their day, then bake the scene.
pub fn scene_from(profile: &Profile, card: &str, sprite: &Sprite, now: DateTime<Utc>, seed: Option<u32>) -> Res<(String, String)> {
    let family = plan_family(&profile.days, now.timestamp_millis());
    let lives = plan_life(&family.fish, now, &profile.time_zone, family.idle);
    let crew: Vec<Member> = family.fish.iter().zip(&lives).map(|(f, l)| Member { growth: f.growth, age: f.age, life: l.clone() }).collect();
    let seed = seed.unwrap_or_else(|| route_seed(&profile.login, now.timestamp_millis()));
    let scene = build_scene(seed, 1.0, &crew, sprite, HEADER, card);
    if !scene.svg.contains("<animateMotion") || scene.svg.len() < 5000 {
        return Err("scene: the generated picture looks wrong; refusing to write it".into());
    }
    let first = &scene.routes[0];
    let kinds: Vec<String> = family
        .fish
        .iter()
        .zip(&lives)
        .map(|(f, l)| {
            let who = if f.kind == "parent" { "parent".to_string() } else { format!("{} ({}, {}d)", f.kind, f.reason, js_round(f.age)) };
            format!("{who} {}", l.state)
        })
        .collect();
    let summary = format!(
        "scene: seed {seed}, {} KB, loop {:.0} s, {:.0} px/s\nscene: hour {} in {}; {} koi: {}; idle {}d, faded {}, retired {}",
        js_round(scene.svg.len() as f64 / 1024.0),
        first.duration,
        first.speed,
        lives[0].hour,
        profile.time_zone,
        crew.len(),
        kinds.join(", "),
        num(family.idle),
        family.faded,
        family.retired,
    );
    Ok((scene.svg, summary))
}

/// Write a file, making its folder first.
pub fn write(path: &str, text: &str) -> Res<()> {
    if let Some(dir) = Path::new(path).parent().filter(|d| !d.as_os_str().is_empty()) {
        fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    fs::write(path, text).map_err(|e| format!("{path}: {e}"))
}
