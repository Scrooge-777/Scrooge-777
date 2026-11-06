mod common;

use common::*;
use nyx::{
    card::{LEVEL_HEIGHT, TEMPLATE, build_languages, build_pills, build_radar, build_terrain, compact, radar_radius, render_card, since_label},
    profile::Language,
    rules::rules,
};
use regex::Regex;

fn count(text: &str, needle: &str) -> usize {
    text.matches(needle).count()
}

#[test]
fn the_card_fills_every_placeholder_and_keeps_the_markup_the_scene_relies_on() {
    let svg = render_card(TEMPLATE, &profile(&every_third)).expect("renders");
    assert!(!svg.contains("<!--@") && !svg.contains("@user@"));
    for needle in ["id=\"terrain-island\"", "id=\"donut-hologram\"", "class=\"radar-node\"", "fill=\"url(#radarFill)\"", "class=\"iso-col\"", "kpi-pill"] {
        assert!(svg.contains(needle), "{needle}");
    }
    assert!(!svg.contains("NaN") && !svg.contains("undefined"));
    assert!(render_card("<svg></svg>", &profile(&every_third)).is_err(), "a template without placeholders is an error");
}

#[test]
fn the_terrain_has_one_bar_per_day_of_the_last_12_weeks_partial_weeks_placed_by_weekday() {
    let p = profile(&every_third);
    let weeks = rules().card.terrain_weeks;
    let expected: usize = p.weeks[p.weeks.len() - weeks..].iter().map(Vec::len).sum();
    assert_eq!(count(&build_terrain(&p.weeks), "class=\"iso-col\""), expected);
    let mut cut = p.weeks.clone();
    let last = cut.len() - 1;
    cut[last].truncate(3); // a week cut short
    let expected: usize = cut[cut.len() - weeks..].iter().map(Vec::len).sum();
    assert_eq!(count(&build_terrain(&cut), "class=\"iso-col\""), expected);
}

#[test]
fn the_radar_keeps_its_classic_shape() {
    assert_eq!(radar_radius(0.0), 20.8);
    assert!(radar_radius(5.0) < radar_radius(10.0));
    assert!((radar_radius(561.0) - 84.0).abs() < 1.0, "560 commits reach about 84");
    assert!((radar_radius(7.0) - 41.6).abs() < 0.1, "7 repos reach about 42");
    assert_eq!(radar_radius(1e12), 126.0);
    let totals = |c, i, p, r, repos| nyx::profile::Totals { contributions: 0, commits: c, pull_requests: p, issues: i, reviews: r, repos, stars: 0, forks: 0 };
    let low = build_radar(&totals(10, 0, 0, 0, 1));
    let high = build_radar(&totals(500, 20, 20, 20, 15));
    assert_ne!(low, high);
    assert!(high.contains(">500</text>"));
    assert!(!(low + &high).contains("NaN"));
}

#[test]
fn the_row_of_totals_never_overlaps_and_stays_inside_the_card_however_big_the_numbers() {
    let rect = Regex::new(r#"<rect x="([\d.]+)" y="786" width="([\d.]+)""#).expect("regex");
    let scale_re = Regex::new(r"scale\(([\d.]+)\)").expect("regex");
    let totals = [(573, 561, 6, 0, 7, 0, 0), (12345, 9999, 1234, 12, 120, 4567, 890), (123_456, 99_999, 12_345, 12, 120, 45_678, 8900)];
    for (contributions, commits, prs, issues, repos, stars, forks) in totals {
        let mut p = profile(&every_third);
        p.totals = nyx::profile::Totals { contributions, commits, pull_requests: prs, issues, reviews: 5, repos, stars, forks };
        let xml = build_pills(&p);
        let scale: f64 = scale_re.captures(&xml).map(|c| c[1].parse().expect("number")).unwrap_or(1.0);
        let rects: Vec<(f64, f64)> = rect.captures_iter(&xml).map(|c| (c[1].parse::<f64>().expect("x"), c[1].parse::<f64>().expect("x") + c[2].parse::<f64>().expect("w"))).collect();
        assert_eq!(rects.len(), 7);
        for pair in rects.windows(2) {
            assert!(pair[1].0 > pair[0].1, "pills do not overlap");
        }
        let end = 30.0 + (rects[6].1 - 30.0) * scale;
        assert!(end <= 1250.0, "pills fit (end {end})");
    }
}

#[test]
fn languages_shares_add_up_and_names_are_escaped() {
    let xml = build_languages(&[
        Language { name: "A&B <x>".into(), color: "#fff000".into(), bytes: 3000 },
        Language { name: "Z".into(), color: "#000fff".into(), bytes: 1000 },
    ]);
    assert!(xml.contains("A&amp;B &lt;x&gt;"));
    assert!(xml.contains(">75%<"));
    assert_eq!(build_languages(&[]), "");
}

#[test]
fn since_label_and_compact_numbers() {
    assert_eq!(since_label("2026-08-19"), "since Aug 2026");
    let got: Vec<String> = [999, 9999, 10000, 12345, 123_456, 2_500_000].iter().map(|n| compact(*n)).collect();
    assert_eq!(got, ["999", "9999", "10k", "12.3k", "123.5k", "2.5M"]);
}

#[test]
fn the_bar_heights_rise_with_the_level() {
    assert!(LEVEL_HEIGHT.windows(2).all(|w| w[0] < w[1]));
}
