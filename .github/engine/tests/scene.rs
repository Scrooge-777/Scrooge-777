mod common;

use common::*;
use nyx::{
    card::{TEMPLATE, render_card},
    family::{Fish, plan_family, plan_family_with},
    life::{STATE_ORDER, hour_in, hunger_state, plan_life, scheduled_state},
    pipeline::HEADER,
    rules::{FamilyRules, rules},
    scene::{Member, Rng, build_scene, card_y, drift, plan_nest, route_period_ms, route_seed, scene_h},
};

fn five() -> FamilyRules {
    FamilyRules { max_fish: 5, ..rules().family.clone() } // the machinery is tested at full size, whatever limit is set today
}

fn kinds(f: &nyx::family::Family) -> Vec<&'static str> {
    let mut k: Vec<&str> = f.fish.iter().skip(1).map(|x| x.kind).collect();
    k.sort_unstable();
    k
}

// ---------- the route seed ----------
#[test]
fn the_route_seed_stays_the_same_for_5_hours_and_changes_after() {
    let period = route_period_ms();
    let t0 = ms("2026-11-07T00:00:00Z").div_euclid(period) * period;
    let a = route_seed("me", t0);
    assert_eq!(route_seed("me", t0 + period - 1), a);
    assert_ne!(route_seed("me", t0 + period), a);
    assert_ne!(route_seed("you", t0), a);
}

// ---------- the family ----------
#[test]
fn family_the_parent_is_always_there() {
    let f = plan_family_with(&[], ms("2026-11-07T00:00:00Z"), &five());
    assert_eq!(f.fish.len(), 1);
    assert_eq!(f.fish[0].kind, "parent");
}

#[test]
fn family_a_baby_for_every_full_7_days_of_streak_a_fish_per_milestone() {
    let mut days = run("2026-10-01", 15, 3);
    days.push(day("2026-10-16", 0));
    days.extend(run("2026-10-17", 3, 200));
    let f = plan_family_with(&days, ms("2026-10-20T00:00:00Z"), &five());
    assert_eq!(kinds(&f), ["milestone", "streak", "streak"]);
    assert_eq!(f.total, 45 + 600);
}

#[test]
fn family_at_most_5_fish_the_oldest_babies_retire() {
    let f = plan_family_with(&run("2026-08-01", 90, 1), ms("2026-11-07T00:00:00Z"), &five()); // a 90-day streak is 12 babies
    assert_eq!(f.fish.len(), 5);
    assert_eq!(f.retired, 12 - 4);
}

#[test]
fn family_with_the_limit_set_in_rules_json_a_long_streak_never_gives_more_fish_than_that() {
    let f = plan_family(&run("2026-08-01", 90, 1), ms("2026-11-07T00:00:00Z"));
    assert_eq!(f.fish.len(), rules().family.max_fish);
    assert_eq!(f.fish[0].kind, "parent");
}

#[test]
fn family_babies_grow_from_55_percent_to_full_size_over_30_days() {
    let now = ms("2026-11-07T00:00:00Z");
    let young = &plan_family_with(&run("2026-11-01", 7, 3), now, &five()).fish[1];
    assert!(young.growth < 0.6, "a week-old baby is small ({})", young.growth);
    let mut days = run("2026-08-01", 7, 3);
    // active every other day afterwards: no new streaks
    days.extend(run("2026-08-08", 91, 1).into_iter().enumerate().map(|(i, mut d)| {
        if i % 2 == 0 {
            d.count = 0;
        }
        d
    }));
    let older = plan_family_with(&days, now, &five());
    assert_eq!(older.fish[1].growth, 1.0, "a three-month-old baby is full size");
}

#[test]
fn family_after_14_idle_days_the_newest_fish_fades_the_parent_stays() {
    let mut days = run("2026-09-01", 14, 3);
    days.extend(run("2026-09-15", 30, 0)); // two babies, then silence
    assert_eq!(plan_family_with(&days, ms("2026-09-20T00:00:00Z"), &five()).fish.len(), 3);
    let idle = plan_family_with(&days, ms("2026-10-20T00:00:00Z"), &five());
    assert!(idle.idle >= 28.0);
    assert_eq!(idle.fish[0].kind, "parent");
    assert_eq!(idle.fish.len(), 1);
}

// ---------- the life of a fish ----------
fn fish(growth: f64) -> Fish {
    Fish { kind: "parent", reason: String::new(), age: f64::INFINITY, growth }
}

#[test]
fn an_adult_sleeps_23_to_06_is_calm_06_to_09_and_18_to_23_and_active_09_to_18() {
    let l = &rules().life;
    let at = |h| scheduled_state(h, false, l);
    assert!([23, 0, 3, 5].iter().all(|h| at(*h) == "sleep"));
    assert!([6, 8, 18, 22].iter().all(|h| at(*h) == "calm"));
    assert!([9, 12, 17].iter().all(|h| at(*h) == "active"));
}

#[test]
fn a_young_fish_sleeps_early_naps_after_lunch_and_is_active_otherwise_by_day() {
    let l = &rules().life;
    let at = |h| scheduled_state(h, true, l);
    assert!([21, 23, 2, 6].iter().all(|h| at(*h) == "sleep"));
    assert!([13, 14].iter().all(|h| at(*h) == "sleep"));
    assert!([9, 12, 15, 17].iter().all(|h| at(*h) == "active"));
    assert!([7, 18, 20].iter().all(|h| at(*h) == "calm"));
}

#[test]
fn every_hour_of_the_day_has_a_state_for_both_ages() {
    for young in [false, true] {
        for h in 0..24 {
            assert!(STATE_ORDER.contains(&scheduled_state(h, young, &rules().life)), "{young} {h}");
        }
    }
}

#[test]
fn hunger_3_days_slows_one_step_7_days_two_a_sleeper_keeps_sleeping_nobody_drops_below_rest() {
    let l = &rules().life;
    assert_eq!(hunger_state("active", 0.0, l), "active");
    assert_eq!(hunger_state("active", 2.0, l), "active");
    assert_eq!(hunger_state("active", 3.0, l), "calm");
    assert_eq!(hunger_state("calm", 3.0, l), "rest");
    assert_eq!(hunger_state("active", 7.0, l), "rest");
    assert_eq!(hunger_state("calm", 9.0, l), "rest");
    assert_eq!(hunger_state("rest", 30.0, l), "rest");
    assert_eq!(hunger_state("sleep", 30.0, l), "sleep");
}

#[test]
fn the_hour_comes_from_the_time_zone_and_each_fish_keeps_its_own_hours() {
    let t = at("2026-11-07T06:00:00Z"); // 11:30 in Kolkata
    assert_eq!(hour_in("Asia/Kolkata", t), 11);
    assert_eq!(hour_in("UTC", t), 6);
    let adults: Vec<Fish> = (0..5).map(|_| fish(1.0)).collect();
    let lives = plan_life(&adults, at("2026-11-07T17:30:00Z"), "Asia/Kolkata", 0.0); // 23:00 in Kolkata
    assert_eq!((lives[0].state, lives[0].hour), ("sleep", 23));
    assert_eq!(lives[1].hour, 0);
    assert_eq!((lives[2].hour, lives[2].state), (22, "calm")); // one fish is still up an hour earlier
}

#[test]
fn each_state_carries_speed_tail_beat_and_look_from_the_rules() {
    let [l] = <[_; 1]>::try_from(plan_life(&[fish(1.0)], at("2026-11-07T06:00:00Z"), "Asia/Kolkata", 0.0)).expect("one");
    assert_eq!((l.state, l.speed, l.tail, l.opacity, l.darts), ("active", 1.0, 1.0, 1.0, true));
    let [s] = <[_; 1]>::try_from(plan_life(&[fish(0.6)], at("2026-11-07T08:30:00Z"), "Asia/Kolkata", 0.0)).expect("one"); // 14:00: nap
    assert_eq!((s.state, s.opacity), ("sleep", 0.7));
}

#[test]
fn a_sleeper_drifts_in_a_small_oval_on_the_terrain_floor_slowly() {
    let nest = &rules().life.nest;
    for i in 0..5 {
        let route = plan_nest(i, &mut Rng::new(1));
        let xs: Vec<f64> = route.pts.iter().map(|p| p[0]).collect();
        let ys: Vec<f64> = route.pts.iter().map(|p| p[1]).collect();
        let span = |v: &[f64]| v.iter().cloned().fold(f64::MIN, f64::max) - v.iter().cloned().fold(f64::MAX, f64::min);
        assert!(span(&xs) <= 2.0 * nest.radius_x + 1.0);
        assert!(span(&ys) <= 2.0 * nest.radius_x + 1.0);
        assert!(xs.iter().all(|x| *x > 170.0 && *x < 640.0), "inside the terrain's width");
        assert!(ys.iter().all(|y| *y > card_y() + 160.0 && *y < card_y() + 470.0), "on the terrain floor");
        let sim = drift(&route, rules().life.states.sleep.speed);
        assert!((route.poly.length / sim.duration - 6.0).abs() < 0.01, "6 px a second");
    }
}

// ---------- the scene ----------
fn card() -> String {
    render_card(TEMPLATE, &profile(&|i| if i % 2 == 1 { 12 } else { 3 })).expect("card")
}

fn crew(state: &'static str) -> Vec<Member> {
    (0..3).map(|i| Member { growth: if i == 0 { 1.0 } else { 0.8 }, age: if i == 0 { f64::INFINITY } else { 20.0 }, life: life(state) }).collect()
}

#[test]
fn sleeping_fish_are_dimmed_and_slow_and_do_not_make_the_bars_sway() {
    let card = card();
    let night = build_scene(3, 1.0, &crew("sleep"), &sprite(), HEADER, &card);
    let day = build_scene(3, 1.0, &crew("active"), &sprite(), HEADER, &card);
    assert_eq!(night.swaying_bars, 0);
    assert!(day.swaying_bars > 0);
    assert!(night.svg.contains("opacity=\"0.7\""));
    assert!(night.svg.contains("id=\"koi-sprite-6\""), "the slow tail beat has its own sprite");
    assert!(night.svg.len() < day.svg.len() / 3, "a sleeping scene is much lighter");
    assert!(night.routes.iter().all(|r| r.state == "sleep" && r.speed < 8.0));
}

#[test]
fn calm_and_rest_fish_are_slower_than_active_ones_and_do_not_dart() {
    let card = card();
    let first = |state| build_scene(3, 1.0, &crew(state), &sprite(), HEADER, &card).routes.remove(0);
    let (a, c, r) = (first("active"), first("calm"), first("rest"));
    assert!(a.darts > 0 && c.darts == 0 && r.darts == 0);
    assert!(a.speed > c.speed && c.speed > r.speed, "{} > {} > {}", a.speed, c.speed, r.speed);
    assert_eq!([a.length.round(), c.length.round()], [a.length.round(), a.length.round()], "the route itself does not depend on mood");
}

#[test]
fn the_scene_draws_one_animated_fish_per_family_member_all_inside_the_scene() {
    let card = card();
    let family = plan_family_with(&run("2026-10-01", 15, 3), ms("2026-11-07T00:00:00Z"), &five());
    let lives = plan_life(&family.fish, at("2026-11-07T06:00:00Z"), "Asia/Kolkata", family.idle);
    let members: Vec<Member> = family.fish.iter().zip(&lives).map(|(f, l)| Member { growth: f.growth, age: f.age, life: l.clone() }).collect();
    let scene = build_scene(7, 1.0, &members, &sprite(), HEADER, &card);
    assert_eq!(scene.svg.matches("<animateMotion").count(), members.len());
    assert_eq!(scene.routes.len(), members.len());
    for r in &scene.routes {
        for [x, y] in &r.waypoints {
            assert!(*x > -80.0 && *x < 1280.0 + 80.0 && *y > -80.0 && *y < scene_h() + 80.0);
        }
    }
}
