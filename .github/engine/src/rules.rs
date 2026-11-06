//! The numbers in `.github/rules/rules.json`, read once. Edit that file to change behaviour;
//! the sheets beside it describe the same numbers in words.
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub family: FamilyRules,
    pub life: LifeRules,
    pub route: RouteRules,
    pub radar: RadarRules,
    pub card: CardRules,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyRules {
    pub milestones: Vec<u64>,
    pub streak_days: u32,
    pub max_fish: usize,
    pub idle_days: f64,
    pub grow_days: f64,
    pub baby_start: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeRules {
    pub stagger: Vec<i32>,
    pub schedule: Schedule,
    pub hunger: Hunger,
    pub states: States,
    pub nest: Nest,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Schedule {
    pub adult: Vec<Slot>,
    pub young: Vec<Slot>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Slot {
    pub from: u32,
    pub to: u32,
    pub state: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunger {
    pub slower_after_days: f64,
    pub slowest_after_days: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct States {
    pub active: StateRule,
    pub calm: StateRule,
    pub rest: StateRule,
    pub sleep: StateRule,
}

impl States {
    pub fn get(&self, name: &str) -> &StateRule {
        match name {
            "calm" => &self.calm,
            "rest" => &self.rest,
            "sleep" => &self.sleep,
            _ => &self.active,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StateRule {
    pub speed: f64,
    pub tail: f64,
    pub opacity: f64,
    pub darts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nest {
    pub radius_x: f64,
    pub radius_y: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteRules {
    pub period_hours: u64,
    pub cruise_speed: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RadarRules {
    pub inner_ring: f64,
    pub outer_ring: f64,
    pub pixels_per_log: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardRules {
    pub terrain_weeks: usize,
    pub languages_shown: usize,
    pub shorten_from: u64,
}

/// The rules, parsed on first use. They are part of the program: a change to `rules.json`
/// needs a new build, which the workflow does on every run.
pub fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| {
        serde_json::from_str(include_str!("../../rules/rules.json")).expect("rules/rules.json is valid")
    })
}
