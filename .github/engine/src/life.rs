//! How each koi lives through the day. Rules: `rules/koi-life.md`, numbers: `rules/rules.json`.
//!
//! A README picture cannot read the clock, so the state is worked out when the picture is built
//! (every 2 hours) from the time in the owner's time zone and from how recently they contributed.
use chrono::{DateTime, Timelike, Utc};
use chrono_tz::Tz;

use crate::{
    family::Fish,
    rules::{LifeRules, Slot, StateRule, rules},
};

/// From least to most energetic.
pub const STATE_ORDER: [&str; 4] = ["sleep", "rest", "calm", "active"];

#[derive(Debug, Clone)]
pub struct Life {
    pub state: &'static str,
    pub hour: u32,
    pub young: bool,
    pub speed: f64,
    pub tail: f64,
    pub opacity: f64,
    pub darts: bool,
}

/// The hour of day (0-23) in a time zone; an unknown zone falls back to UTC.
pub fn hour_in(time_zone: &str, now: DateTime<Utc>) -> u32 {
    match time_zone.parse::<Tz>() {
        Ok(tz) => now.with_timezone(&tz).hour(),
        Err(_) => now.hour(),
    }
}

/// Ranges are [from, to) and may wrap past midnight (from 23 to 6).
fn in_range(hour: u32, slot: &Slot) -> bool {
    if slot.from <= slot.to { hour >= slot.from && hour < slot.to } else { hour >= slot.from || hour < slot.to }
}

fn static_state(name: &str) -> &'static str {
    STATE_ORDER.iter().copied().find(|s| *s == name).unwrap_or("active")
}

/// Young fish (still growing) keep a baby's hours: early nights and a nap after lunch.
pub fn scheduled_state(hour: u32, young: bool, life: &LifeRules) -> &'static str {
    let slots = if young { &life.schedule.young } else { &life.schedule.adult };
    slots.iter().find(|s| in_range(hour, s)).map(|s| static_state(&s.state)).unwrap_or("active")
}

/// A fish that has not been fed (no contributions) slows down; a sleeping fish just sleeps on.
pub fn hunger_state(state: &'static str, idle_days: f64, life: &LifeRules) -> &'static str {
    if state == "sleep" {
        return state;
    }
    let steps = if idle_days >= life.hunger.slowest_after_days {
        2
    } else if idle_days >= life.hunger.slower_after_days {
        1
    } else {
        0
    };
    let at = STATE_ORDER.iter().position(|s| *s == state).unwrap_or(3) as i64;
    STATE_ORDER[(at - steps).max(1) as usize] // hungry fish rest, they do not sleep
}

pub fn plan_life(fish: &[Fish], now: DateTime<Utc>, time_zone: &str, idle_days: f64) -> Vec<Life> {
    plan_life_with(fish, now, time_zone, idle_days, &rules().life)
}

pub fn plan_life_with(fish: &[Fish], now: DateTime<Utc>, time_zone: &str, idle_days: f64, life: &LifeRules) -> Vec<Life> {
    let clock = hour_in(time_zone, now) as i32;
    fish.iter()
        .enumerate()
        .map(|(i, f)| {
            let young = f.growth < 1.0;
            let shift = life.stagger[i % life.stagger.len()];
            let hour = (clock + shift + 24).rem_euclid(24) as u32; // every fish keeps its own hours
            let state = hunger_state(scheduled_state(hour, young, life), idle_days, life);
            let s: &StateRule = life.states.get(state);
            Life { state, hour, young, speed: s.speed, tail: s.tail, opacity: s.opacity, darts: s.darts }
        })
        .collect()
}
