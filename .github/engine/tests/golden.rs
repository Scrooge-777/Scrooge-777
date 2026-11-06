//! The checksums below were computed from the JavaScript version this engine replaced (branch
//! `backup/node-core`) for the same synthetic account (templates with LF line endings, as git checks them out on Linux). The Rust engine must produce exactly the
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
    assert_eq!(fnv(&render_card(TEMPLATE, &p).expect("card")), "db50f278d66f57ba");
}

#[test]
fn the_scenes_are_byte_for_byte_what_the_javascript_version_drew() {
    let p = normalize(&graphql("2026-11-07", 371, &mixed), "me", now(), "Asia/Kolkata").expect("profile");
    let card = render_card(TEMPLATE, &p).expect("card");
    let five = FamilyRules { max_fish: 5, ..rules().family.clone() };
    let cases = [
        ("day", "2026-11-07T06:00:00Z", 11, "80e382dc1390cfd3"),
        ("night", "2026-11-07T21:30:00Z", 5, "673b53926c99fc4a"),
        ("nap", "2026-11-07T08:30:00Z", 3, "3be9c2fbf7f969d5"),
        ("hungry", "2026-11-15T06:00:00Z", 7, "de5959f0de0ed06f"),
        ("fading", "2026-11-22T06:00:00Z", 8, "1d8b657cf3309fef"),
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
