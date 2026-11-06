//! The profile card: `data/card.svg` with four live parts filled in from the profile data.
//!
//! * `<!--@terrain-->`   the 3D bars, one per day of the last 12 weeks
//! * `<!--@radar-->`     the contribution-mix radar (commits, issues, pull requests, reviews, repos)
//! * `<!--@languages-->` the language donut and its legend
//! * `<!--@pills-->`     the row of totals along the bottom
//!
//! Pure functions: the same profile always gives the same SVG. Rules: `rules/activity-card.md`.
use std::f64::consts::PI;

use chrono::{Datelike, NaiveDate};

use crate::{
    Res,
    fmt::{esc, fixed, num},
    profile::{Day, Language, Profile, Totals},
    rules::rules,
};

pub const TEMPLATE: &str = include_str!("../data/card.svg");

/// The template's accent colour (Monochrome Platinum).
const ACCENT: &str = "#e2e8f0";

// ---------- 3D terrain ----------
pub const LEVEL_HEIGHT: [f64; 5] = [2.6, 5.24, 18.85, 34.43, 63.87];
const LEVEL_FLOAT: [i32; 5] = [-7, -7, -10, -12, -14];

fn level_number(level: &str) -> usize {
    match level {
        "FIRST_QUARTILE" => 1,
        "SECOND_QUARTILE" => 2,
        "THIRD_QUARTILE" => 3,
        "FOURTH_QUARTILE" => 4,
        _ => 0,
    }
}

/// The last N weeks as a grid of seven weekday slots; a partial week is placed by weekday.
fn grid_weeks(weeks: &[Vec<Day>]) -> Vec<[Option<&Day>; 7]> {
    let n = rules().card.terrain_weeks;
    let from = weeks.len().saturating_sub(n);
    weeks[from..]
        .iter()
        .map(|week| {
            let mut cells: [Option<&Day>; 7] = [None; 7];
            for day in week {
                if let Ok(date) = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d") {
                    cells[date.weekday().num_days_from_sunday() as usize] = Some(day);
                }
            }
            cells
        })
        .collect()
}

pub fn build_terrain(weeks: &[Vec<Day>]) -> String {
    let grid = grid_weeks(weeks);
    let (scale, cx, cy, wave_period) = (1.25, 400.0, 305.0, 3.0);
    let n = grid.len() as f64;
    let mid_x = ((n - 1.0) * 20.0 + (0.0 - 6.0) * 20.0) / 2.0 + 18.0;
    let mid_y = ((n - 1.0 + 6.0) * 11.547) / 2.0;
    let mut cells: Vec<(usize, usize, &Day)> = Vec::new();
    for (w, week) in grid.iter().enumerate() {
        for (d, day) in week.iter().enumerate() {
            if let Some(day) = day {
                cells.push((w, d, day));
            }
        }
    }
    cells.sort_by(|a, b| (a.0 + a.1).cmp(&(b.0 + b.1)).then(a.0.cmp(&b.0))); // back to front
    let cols: Vec<String> = cells
        .iter()
        .map(|&(w, d, day)| {
            let lvl = level_number(&day.level);
            let h = LEVEL_HEIGHT[lvl];
            let x = cx + (((w as f64 - d as f64) * 20.0) - mid_x) * scale;
            let y = cy + (((w + d) as f64 * 11.547 - 1.15 * h) - mid_y) * scale;
            let phase = (w as f64 * 0.42 + d as f64 * 0.26) % wave_period;
            let plural = if day.count == 1 { "" } else { "s" };
            format!(
                "<g class=\"iso-col\" transform=\"translate({} {}) scale({})\">\
<title>{}: {} contribution{}</title>\
<rect x=\"0\" y=\"0\" width=\"18\" height=\"18\" transform=\"skewY(-30) skewX(40.89) scale(1 1.15)\" class=\"c{lvl}t\" stroke=\"#fff\" stroke-opacity=\"0.06\" stroke-width=\"0.5\"></rect>\
<rect x=\"0\" y=\"0\" width=\"18\" height=\"{h2}\" transform=\"skewY(30) scale(1 1.15)\" class=\"c{lvl}l\"><animate attributeName=\"height\" values=\"2.6;{h2}\" dur=\"3s\" repeatCount=\"1\"></animate></rect>\
<rect x=\"0\" y=\"0\" width=\"18\" height=\"{h2}\" transform=\"translate(18 10.39) skewY(-30) scale(1 1.15)\" class=\"c{lvl}r\"><animate attributeName=\"height\" values=\"2.6;{h2}\" dur=\"3s\" repeatCount=\"1\"></animate></rect>\
<animateTransform attributeName=\"transform\" type=\"translate\" values=\"0,0; 0,{float}; 0,0\" dur=\"{wp}s\" begin=\"-{ph}s\" repeatCount=\"indefinite\" additive=\"sum\" calcMode=\"spline\" keySplines=\"0.45 0 0.55 1; 0.45 0 0.55 1\" keyTimes=\"0; 0.5; 1\"/>\
</g>",
                fixed(x, 2),
                fixed(y, 2),
                num(scale),
                day.date,
                day.count,
                plural,
                h2 = fixed(h, 2),
                float = LEVEL_FLOAT[lvl],
                wp = fixed(wave_period, 1),
                ph = fixed(phase, 2),
            )
        })
        .collect();
    format!("<g id=\"terrain-island\" class=\"terrain-3d\">\n{}\n</g>", cols.join("\n"))
}

// ---------- radar ----------
const CX: f64 = 1015.0;
const CY: f64 = 310.0;
const LABEL_R: f64 = 160.0;

struct Axis {
    key: &'static str,
    label: &'static str,
    deg: f64,
    anchor: &'static str,
}

const AXES: [Axis; 5] = [
    Axis { key: "commits", label: "Commit", deg: -90.0, anchor: "middle" },
    Axis { key: "issues", label: "Issue", deg: -18.0, anchor: "start" },
    Axis { key: "pullRequests", label: "PullReq", deg: 54.0, anchor: "start" },
    Axis { key: "reviews", label: "Review", deg: 126.0, anchor: "end" },
    Axis { key: "repos", label: "Repo", deg: 198.0, anchor: "end" },
];

/// The classic contribution-mix shape: nothing sits on the inner ring and a spoke grows by a
/// fixed step for every factor of e in the count, never past the outer ring.
pub fn radar_radius(value: f64) -> f64 {
    let r = &rules().radar;
    if value <= 0.0 {
        return r.inner_ring;
    }
    r.outer_ring.min(r.inner_ring + r.pixels_per_log * (1.0 + value).ln())
}

pub fn build_radar(totals: &Totals) -> String {
    let points: Vec<(f64, f64)> = AXES
        .iter()
        .map(|a| {
            let r = radar_radius(totals.by_key(a.key) as f64);
            let rad = a.deg * PI / 180.0;
            (CX + r * rad.cos(), CY + r * rad.sin())
        })
        .collect();
    let poly: Vec<String> = points.iter().map(|(x, y)| format!("{},{}", fixed(*x, 1), fixed(*y, 1))).collect();
    let mut out = vec![format!(
        "<polygon points=\"{}\" fill=\"url(#radarFill)\" stroke=\"{ACCENT}\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/>",
        poly.join(" ")
    )];
    for (i, a) in AXES.iter().enumerate() {
        let rad = a.deg * PI / 180.0;
        let (lx, ly) = (CX + LABEL_R * rad.cos(), CY + LABEL_R * rad.sin());
        out.push(format!("<circle class=\"radar-node\" cx=\"{}\" cy=\"{}\" r=\"4\" fill=\"{ACCENT}\"/>", fixed(points[i].0, 1), fixed(points[i].1, 1)));
        out.push(format!("<text x=\"{}\" y=\"{}\" font-size=\"16\" font-weight=\"600\" text-anchor=\"{}\" class=\"fg\">{}</text>", fixed(lx, 1), fixed(ly, 1), a.anchor, a.label));
        out.push(format!("<text x=\"{}\" y=\"{}\" font-size=\"14\" font-weight=\"700\" text-anchor=\"{}\" class=\"strong\">{}</text>", fixed(lx, 1), fixed(ly + 18.0, 1), a.anchor, totals.by_key(a.key)));
    }
    out.join("\n")
}

// ---------- languages ----------
pub fn build_languages(languages: &[Language]) -> String {
    let total: u64 = languages.iter().map(|l| l.bytes).sum();
    if total == 0 {
        return String::new();
    }
    let (cx, cy, big_r, small_r) = (150.0, 663.0, 90.0, 52.0);
    let mut angle = -PI / 2.0;
    let slices: Vec<String> = languages
        .iter()
        .map(|l| {
            let a1 = angle;
            let a2 = angle + (l.bytes as f64 / total as f64) * 2.0 * PI;
            angle = a2;
            let large = if a2 - a1 > PI { 1 } else { 0 };
            let p = |r: f64, a: f64| format!("{},{}", fixed(cx + r * a.cos(), 2), fixed(cy + r * a.sin(), 2));
            let d = format!("M{}A{big_r},{big_r},0,{large},1,{}L{}A{small_r},{small_r},0,{large},0,{}Z", p(big_r, a1), p(big_r, a2), p(small_r, a2), p(small_r, a1));
            let size = if l.bytes > 1024 { format!("{} KB", fixed(l.bytes as f64 / 1024.0, 1)) } else { format!("{} B", l.bytes) };
            format!("<path d=\"{d}\" class=\"donut-slice\" fill=\"{}\" stroke=\"none\"><title>{} {size}</title><animate attributeName=\"fill-opacity\" values=\"0;1\" dur=\"1.2s\" fill=\"freeze\"/></path>", esc(&l.color), esc(&l.name))
        })
        .collect();
    let rows: Vec<String> = languages
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let share = l.bytes as f64 / total as f64;
            let pct = share * 100.0;
            let pct_text = if pct < 1.0 { format!("{}%", fixed(pct, 1)) } else { format!("{}%", crate::fmt::js_round(pct)) };
            let bar = (crate::fmt::js_round(132.0 * share) as i64).max(2);
            let y = 572 + i as i64 * 30;
            format!(
                "<rect x=\"270\" y=\"{y}\" width=\"13\" height=\"13\" rx=\"3\" fill=\"{c}\"/>\n\
<text x=\"292\" y=\"{y1}\" font-size=\"14\" class=\"fg\">{n}</text>\n\
<text x=\"424\" y=\"{y1}\" font-size=\"14\" font-weight=\"700\" text-anchor=\"end\" class=\"weak\">{pct_text}</text>\n\
<rect x=\"292\" y=\"{y2}\" width=\"132\" height=\"3\" rx=\"1.5\" fill=\"#ffffff\" fill-opacity=\"0.08\"/>\n\
<rect x=\"292\" y=\"{y2}\" width=\"{bar}\" height=\"3\" rx=\"1.5\" fill=\"{c}\"/>",
                c = esc(&l.color),
                n = esc(&l.name),
                y1 = y + 11,
                y2 = y + 17,
            )
        })
        .collect();
    format!("<g id=\"donut-hologram\" class=\"donut-dial\">\n{}\n</g>\n{}", slices.join("\n"), rows.join("\n"))
}

// ---------- the row of totals ----------
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/// The card is 1280 wide: a 30 px margin on the left, about 50 on the right.
const PILL_ROW_WIDTH: f64 = 1200.0;

pub fn since_label(date: &str) -> String {
    let mut parts = date.split('-');
    let year = parts.next().unwrap_or("");
    let month: usize = parts.next().and_then(|m| m.parse().ok()).unwrap_or(1);
    format!("since {} {}", MONTHS[(month.clamp(1, 12)) - 1], year)
}

/// Big totals are shortened so the row of pills always fits: 12345 becomes `12.3k`.
pub fn compact(n: u64) -> String {
    let trim = |s: String| s.strip_suffix(".0").map(str::to_string).unwrap_or(s);
    if n < rules().card.shorten_from {
        n.to_string()
    } else if n < 1_000_000 {
        format!("{}k", trim(fixed(n as f64 / 1000.0, 1)))
    } else {
        format!("{}M", trim(fixed(n as f64 / 1_000_000.0, 1)))
    }
}

pub fn build_pills(profile: &Profile) -> String {
    let t = &profile.totals;
    let since = since_label(&profile.first_contribution);
    let note = format!("{} contributions, {} active days", t.contributions, profile.active_days);
    let items: Vec<(u64, String, Option<String>)> = vec![
        (t.contributions, "contributions".into(), None),
        (t.commits, "commits".into(), None),
        (t.pull_requests, "pull requests".into(), None),
        (t.repos, "repos".into(), None),
        (t.stars, "stars".into(), None),
        (t.forks, "forks".into(), None),
        (t.contributions, since, Some(note)),
    ];
    let mut x = 30.0;
    let mut pills = Vec::new();
    for (n, label, note) in &items {
        let text = compact(*n);
        let num_w = (text.chars().count() as f64 * 17.4).round_js();
        let width = 18.0 + num_w + 8.0 + (label.chars().count() as f64 * 7.6).round_js() + 18.0;
        let title = note.as_ref().map(|n| format!("<title>{}</title>", esc(n))).unwrap_or_default();
        pills.push(format!(
            "<rect x=\"{}\" y=\"786\" width=\"{}\" height=\"46\" rx=\"14\" class=\"card kpi-pill\"/>\n\
<text x=\"{}\" y=\"818\" font-size=\"26\" font-weight=\"800\" class=\"strong\">{text}</text>\n\
<text x=\"{}\" y=\"817\" font-size=\"14\" class=\"weak\">{}{title}</text>",
            num(x),
            num(width),
            num(x + 18.0),
            num(x + 18.0 + num_w + 8.0),
            esc(label),
        ));
        x += width + 14.0;
    }
    // The row must stay inside the card: when the numbers grow, the whole row shrinks to fit.
    let natural = x - 14.0 - 30.0;
    let scale = (PILL_ROW_WIDTH / natural).min(1.0);
    let row = pills.join("\n");
    if scale < 1.0 {
        format!("<g id=\"pill-row\" transform=\"translate(30 786) scale({}) translate(-30 -786)\">\n{row}\n</g>", fixed(scale, 4))
    } else {
        row
    }
}

trait RoundJs {
    fn round_js(self) -> f64;
}
impl RoundJs for f64 {
    fn round_js(self) -> f64 {
        crate::fmt::js_round(self)
    }
}

// ---------- the whole card ----------
pub fn render_card(template: &str, profile: &Profile) -> Res<String> {
    let mut svg = template.replace("@user@", &esc(&profile.login));
    let parts = [
        ("terrain", build_terrain(&profile.weeks)),
        ("radar", build_radar(&profile.totals)),
        ("languages", build_languages(&profile.languages)),
        ("pills", build_pills(profile)),
    ];
    for (name, xml) in parts {
        let marker = format!("<!--@{name}-->");
        if !svg.contains(&marker) {
            return Err(format!("card: template has no {marker}"));
        }
        svg = svg.replacen(&marker, &xml, 1);
    }
    if svg.contains("<!--@") || svg.contains("@user@") {
        return Err("card: a placeholder was left unfilled".into());
    }
    Ok(svg)
}
