//! `nyx`: builds the profile picture.
//!
//! ```text
//! nyx build --login NAME --out assets/scene.svg              everything, live
//! nyx build ... --from-json graphql.json --snapshot s.json    the same from saved data
//! nyx card  --login NAME --from-json graphql.json --out card.svg [--profile-out profile.json]
//! nyx sprite --snapshot s.json --total N --out sprite.json
//! nyx scene --profile profile.json --card card.svg --sprite sprite.json --out scene.svg [--now ISO] [--seed N]
//! ```
//! The GitHub token comes from the environment (`PROFILE_TOKEN`, else `GITHUB_TOKEN`, else
//! `GH_TOKEN`), never from an argument. Any problem with the data stops the run before a file
//! is written.
use std::{collections::HashMap, env, fs, process::ExitCode};

use chrono::{DateTime, Utc};
use nyx::{
    Res,
    card::{TEMPLATE, render_card},
    pipeline::{Options, build, load_profile, load_snapshot, scene_from, write},
    profile::Profile,
    scene::Sprite,
    sprite::{pack, render_frames},
};

fn args() -> Res<(String, HashMap<String, String>)> {
    let mut it = env::args().skip(1);
    let command = it.next().ok_or("usage: nyx build|card|sprite|scene [--option value ...]")?;
    let mut map = HashMap::new();
    while let Some(key) = it.next() {
        let key = key.strip_prefix("--").ok_or(format!("unexpected argument {key}"))?.to_string();
        let value = it.next().ok_or(format!("--{key} needs a value"))?;
        map.insert(key, value);
    }
    Ok((command, map))
}

fn options(a: &HashMap<String, String>) -> Res<Options> {
    let now = match a.get("now") {
        Some(text) => Some(DateTime::parse_from_rfc3339(text).map_err(|e| format!("--now: {e}"))?.with_timezone(&Utc)),
        None => None,
    };
    let token = ["PROFILE_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"].iter().find_map(|k| env::var(k).ok().filter(|v| !v.is_empty()));
    Ok(Options {
        login: a.get("login").cloned().or_else(|| env::var("GITHUB_REPOSITORY_OWNER").ok()).unwrap_or_default(),
        time_zone: env::var("PROFILE_TZ").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| "Asia/Kolkata".into()),
        now,
        token,
        from_json: a.get("from-json").cloned(),
        snapshot: a.get("snapshot").cloned(),
        seed: a.get("seed").map(|s| s.parse::<u32>()).transpose().map_err(|e| format!("--seed: {e}"))?,
    })
}

fn need<'a>(a: &'a HashMap<String, String>, key: &str) -> Res<&'a String> {
    a.get(key).ok_or(format!("missing --{key}"))
}

fn json<T: serde::Serialize>(value: &T) -> Res<String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

fn run() -> Res<()> {
    let (command, a) = args()?;
    let o = options(&a)?;
    let now = o.now.unwrap_or_else(Utc::now);
    match command.as_str() {
        "build" => {
            let out = need(&a, "out")?;
            let built = build(&o)?;
            if let Some(dir) = a.get("keep") {
                write(&format!("{dir}/card.svg"), &built.card)?;
                write(&format!("{dir}/profile.json"), &json(&built.profile)?)?;
                write(&format!("{dir}/sprite.json"), &json(&built.sprite)?)?;
            }
            write(out, &built.svg)?;
            println!("{}", card_line(&built.profile));
            println!("{} -> {out}", built.summary);
        }
        "card" => {
            let out = need(&a, "out")?;
            let profile = load_profile(&o, now)?;
            write(out, &render_card(TEMPLATE, &profile)?)?;
            if let Some(p) = a.get("profile-out") {
                write(p, &json(&profile)?)?;
            }
            println!("{} -> {out}", card_line(&profile));
        }
        "sprite" => {
            let out = need(&a, "out")?;
            let snapshot = load_snapshot(&o, now)?;
            let total: u64 = need(&a, "total")?.parse().map_err(|e| format!("--total: {e}"))?;
            let sprite = pack(&render_frames(&snapshot, total)?)?;
            write(out, &json(&sprite)?)?;
            println!("sprite: {}x{} frames={} length={}", sprite.w, sprite.h, sprite.frames, sprite.length);
        }
        "scene" => {
            let out = need(&a, "out")?;
            let read = |k: &str| -> Res<String> {
                let p = need(&a, k)?;
                fs::read_to_string(p).map_err(|e| format!("{p}: {e}"))
            };
            let profile: Profile = serde_json::from_str(&read("profile")?).map_err(|e| format!("--profile: {e}"))?;
            let sprite: Sprite = serde_json::from_str(&read("sprite")?).map_err(|e| format!("--sprite: {e}"))?;
            let (svg, summary) = scene_from(&profile, &read("card")?, &sprite, now, o.seed)?;
            write(out, &svg)?;
            println!("{summary} -> {out}");
        }
        other => return Err(format!("unknown command {other}")),
    }
    Ok(())
}

fn card_line(p: &Profile) -> String {
    let t = &p.totals;
    format!(
        "card: {} ({}) {} contributions, {} commits, {} PRs, {} issues, {} reviews, {} repos, {} stars, {} forks; calendar ends {}; languages {}",
        p.login,
        p.time_zone,
        t.contributions,
        t.commits,
        t.pull_requests,
        t.issues,
        t.reviews,
        t.repos,
        t.stars,
        t.forks,
        p.days.last().map(|d| d.date.as_str()).unwrap_or("?"),
        p.languages.iter().map(|l| l.name.as_str()).collect::<Vec<_>>().join("/"),
    )
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("nyx: {message}");
            ExitCode::FAILURE
        }
    }
}
