//! The checksums below were computed from the JavaScript version this engine replaced (branch
//! `backup/node-core`) for the same synthetic account. The Rust engine must produce exactly the
//! same bytes: that is the proof that the move to Rust changed nothing.
mod common;

use common::*;
use nyx::{
    card::{TEMPLATE, render_card},
    family::plan_family_with,
    life::plan_life_with,
    pipeline::HEADER,
    profile::normalize,
    rules::{FamilyRules, rules},
    scene::{Member, build_scene},
};

#[test]
fn the_card_is_byte_for_byte_what_the_javascript_version_drew() {
    let p = normalize(&graphql("2026-11-07", 371, &mixed), "me", now(), "Asia/Kolkata").expect("profile");
    assert_eq!(p.totals.contributions, 1174);
    assert_eq!(fnv(&render_card(TEMPLATE, &p).expect("card")), "977aa2a850f796fa");
}

#[test]
fn the_scenes_are_byte_for_byte_what_the_javascript_version_drew() {
    let p = normalize(&graphql("2026-11-07", 371, &mixed), "me", now(), "Asia/Kolkata").expect("profile");
    let card = render_card(TEMPLATE, &p).expect("card");
    let five = FamilyRules { max_fish: 5, ..rules().family.clone() };
    let cases = [
        ("day", "2026-11-07T06:00:00Z", 11, "5faccd954c463bf9"),
        ("night", "2026-11-07T21:30:00Z", 5, "e6378b39f89bc3a8"),
        ("nap", "2026-11-07T08:30:00Z", 3, "acb408bbdb4e50db"),
        ("hungry", "2026-11-15T06:00:00Z", 7, "94e9151f4383efa5"),
        ("fading", "2026-11-22T06:00:00Z", 8, "fed0427872c32825"),
    ];
    for (name, iso, seed, expected) in cases {
        let when = at(iso);
        let family = plan_family_with(&p.days, when.timestamp_millis(), &five);
        let lives = plan_life_with(&family.fish, when, "Asia/Kolkata", family.idle, &rules().life);
        let crew: Vec<Member> = family.fish.iter().zip(&lives).map(|(f, l)| Member { growth: f.growth, age: f.age, life: l.clone() }).collect();
        let scene = build_scene(seed, 1.0, &crew, &sprite(), HEADER, &card);
        assert_eq!(fnv(&scene.svg), expected, "the {name} scene changed");
    }
}
