//! The rule sheets in `.github/rules/*.md` say the same things as `rules.json` and the code.
//! If someone changes a number in one place and not the other, these tests fail.
mod common;

use std::fs;

use common::*;
use nyx::{
    card::{LEVEL_HEIGHT, radar_radius},
    fmt::{fixed, with_commas},
    rules::rules,
};
use regex::Regex;

fn has(text: &str, needle: &str, what: &str) {
    assert!(text.contains(needle), "{what}: expected the sheet to say \"{needle}\"");
}

fn pad(h: u32) -> String {
    format!("{h:02}:00")
}

fn title_case(s: &str) -> String {
    let mut c = s.chars();
    c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
}

#[test]
fn the_index_lists_every_sheet_and_every_sheet_exists() {
    let index = sheet("README.md");
    let dir = root().join(".github/rules");
    let files: Vec<String> = fs::read_dir(&dir)
        .expect("rules folder")
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|f| f.ends_with(".md") && f != "README.md")
        .collect();
    assert!(files.len() >= 5);
    for f in &files {
        has(&index, &format!("({f})"), "README index");
    }
    for c in Regex::new(r"\]\(([^)]+\.md)\)").expect("regex").captures_iter(&index) {
        assert!(dir.join(&c[1]).exists(), "{}", &c[1]);
    }
}

#[test]
fn koi_family_md_matches_the_family_rules() {
    let (t, f) = (sheet("koi-family.md"), &rules().family);
    for m in &f.milestones {
        has(&t, &with_commas(*m), "milestone");
    }
    has(&t, &format!("{} full days", f.streak_days), "streak days");
    has(&t, &format!("| Most fish at once | {} ", f.max_fish), "max fish");
    has(&t, &format!("{}%", (f.baby_start * 100.0).round()), "baby start");
    has(&t, &format!("| {} days |", f.grow_days), "grow days");
    has(&t, &format!("After {} days", f.idle_days), "idle days");
    has(&t, &format!("after {}", f.idle_days * 2.0), "second fade");
}

#[test]
fn koi_life_md_matches_the_life_rules() {
    let (t, l) = (sheet("koi-life.md"), &rules().life);
    for (name, s) in [("active", &l.states.active), ("calm", &l.states.calm), ("rest", &l.states.rest), ("sleep", &l.states.sleep)] {
        let row = t.lines().find(|line| line.starts_with(&format!("| {} |", title_case(name)))).unwrap_or_else(|| panic!("a table row for {name}"));
        if name == "sleep" {
            has(row, &format!("{} px a second", s.speed), "sleep speed");
            has(row, &format!("{}%", (s.opacity * 100.0).round()), "sleep opacity");
        } else {
            has(row, &format!("{}%", (s.speed * 100.0).round()), &format!("{name} speed"));
        }
        if s.tail != 1.0 {
            has(row, &format!("{} times slower", s.tail), &format!("{name} tail"));
        }
    }
    for (who, slots) in [("Adult fish", &l.schedule.adult), ("Young fish", &l.schedule.young)] {
        let section = &t[t.find(who).expect("a section")..];
        for slot in slots {
            has(section, &format!("| {} | {} | {}", pad(slot.from), pad(slot.to), title_case(&slot.state)), &format!("{who} {}-{}", slot.from, slot.to));
        }
    }
    has(&t, "+1, -1, +2 and -2", "stagger");
    assert_eq!(l.stagger, [0, 1, -1, 2, -2]);
    has(&t, &format!("| 3 to {} |", l.hunger.slowest_after_days - 1.0), "slower after");
    has(&t, &format!("| {} or more |", l.hunger.slowest_after_days), "slowest after");
    has(&t, &format!("{}", l.hunger.slower_after_days), "hunger days");
    has(&t, &format!("every {} hours", rules().route.period_hours), "route period");
    has(&t, &format!("{} px a second", rules().route.cruise_speed), "cruise speed");
}

#[test]
fn activity_card_md_matches_the_card_rules_and_the_code() {
    let (t, r) = (sheet("activity-card.md"), rules());
    has(&t, &format!("last {} weeks", r.card.terrain_weeks), "terrain weeks");
    has(&t, &format!("The {} biggest", r.card.languages_shown), "languages shown");
    has(&t, &with_commas(r.card.shorten_from), "shorten from");
    has(&t, &format!("inner ring ({})", r.radar.inner_ring), "inner ring");
    has(&t, &format!("outer ring is {}", r.radar.outer_ring), "outer ring");
    has(&t, &format!("grows by {}", r.radar.pixels_per_log), "per log");
    // the example table of spoke lengths must be what the code really draws
    let spokes = Regex::new(r"(?m)^\| ([\d,]+) \| ([\d.]+) \|$").expect("regex");
    let rows: Vec<(f64, String)> = spokes.captures_iter(&t).map(|c| (c[1].replace(',', "").parse().expect("count"), c[2].to_string())).collect();
    assert!(rows.len() >= 6);
    for (count, length) in rows {
        assert_eq!(fixed(radar_radius(count), 1), fixed(length.parse().expect("length"), 1), "spoke for {count}");
    }
    // and the bar heights
    let bars = Regex::new(r"(?m)^\| ([0-4]) \| [^|]+ \| ([\d.]+) \|$").expect("regex");
    let heights: Vec<(usize, f64)> = bars.captures_iter(&t).map(|c| (c[1].parse().expect("level"), c[2].parse().expect("height"))).collect();
    assert_eq!(heights.len(), 5);
    for (level, h) in heights {
        assert_eq!(fixed(LEVEL_HEIGHT[level], 1), fixed(h, 1), "bar level {level}");
    }
}

#[test]
fn header_and_colours_md_names_the_real_palette() {
    let t = sheet("header-and-colours.md");
    let template = include_str!("../data/card.svg");
    for hex in ["#1b1f28", "#394254", "#58657d", "#94a3b8", "#e2e8f0"] {
        has(&t, hex, "palette");
        assert!(template.contains(hex), "the card template uses {hex}");
    }
    let header = include_str!("../data/header.svg");
    let title = Regex::new(r#"class="text"[^>]*>([^<]+)<"#).expect("regex").captures(header).map(|c| c[1].to_string()).expect("a title");
    has(&t, &format!("| Text | {title} |"), "title");
}

#[test]
fn refresh_md_matches_the_workflow() {
    let t = sheet("refresh.md");
    let wf = read(".github/workflows/profile.yml");
    has(&wf, "\"0 */2 * * *\"", "the 2-hour schedule");
    has(&wf, "\"30 18 * * *\"", "midnight IST (18:30 UTC)");
    has(&wf, "rules/**", "rule changes trigger a rebuild");
    has(&t, "Every 2 hours", "sheet schedule");
    has(&t, "midnight", "sheet midnight");
    has(&t, "PROFILE_TOKEN", "sheet secret");
    has(&wf, "PROFILE_TOKEN", "workflow secret");
}
