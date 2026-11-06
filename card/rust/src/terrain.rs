use serde::{Deserialize, Serialize};

pub const WINDOW_WEEKS: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionDay {
    pub date: String,
    #[serde(rename = "contributionCount")]
    pub contribution_count: u32,
    #[serde(rename = "contributionLevel")]
    pub contribution_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionWeek {
    #[serde(rename = "contributionDays")]
    pub contribution_days: Vec<ContributionDay>,
}

pub fn level_to_num(lvl: &str) -> usize {
    match lvl {
        "FIRST_QUARTILE" => 1,
        "SECOND_QUARTILE" => 2,
        "THIRD_QUARTILE" => 3,
        "FOURTH_QUARTILE" => 4,
        _ => 0,
    }
}

pub fn level_height(lvl: usize) -> f64 {
    match lvl {
        1 => 5.24,
        2 => 18.85,
        3 => 34.43,
        4 => 63.87,
        _ => 2.6,
    }
}

pub fn level_float(lvl: usize) -> i32 {
    match lvl {
        2 => -10,
        3 => -12,
        4 => -14,
        _ => -7,
    }
}

pub fn build_rolling_terrain(calendar_weeks: &[ContributionWeek]) -> Option<String> {
    if calendar_weeks.is_empty() {
        return None;
    }

    let mut weeks = calendar_weeks.to_vec();
    if let Some(last_week) = weeks.last_mut() {
        while last_week.contribution_days.len() < 7 {
            last_week.contribution_days.push(ContributionDay {
                date: "2026-11-07".to_string(),
                contribution_count: 0,
                contribution_level: "NONE".to_string(),
            });
        }
    }

    let start_idx = if weeks.len() > WINDOW_WEEKS {
        weeks.len() - WINDOW_WEEKS
    } else {
        0
    };
    let active_weeks = &weeks[start_idx..];

    let scale = 1.25;
    let target_cx = 400.0;
    let target_cy = 305.0;
    let wave_period = 3.0;
    let n = active_weeks.len() as f64;
    let mid_x = ((n - 1.0) * 20.0 + (0.0 - 6.0) * 20.0) / 2.0 + 18.0;
    let mid_y = ((n - 1.0 + 6.0) * 11.547) / 2.0;

    let mut cells = Vec::new();
    for (rel_w, wk) in active_weeks.iter().enumerate() {
        for (d, day) in wk.contribution_days.iter().enumerate() {
            cells.push((rel_w, d, day));
        }
    }
    cells.sort_by_key(|c| (c.0 + c.1, c.0));

    let mut cols = Vec::new();
    for (rel_w, d, day) in cells {
        let lvl = level_to_num(&day.contribution_level);
        let h = level_height(lvl);
        let float_h = level_float(lvl);
        let x_u = (rel_w as f64 - d as f64) * 20.0;
        let floor_y = (rel_w as f64 + d as f64) * 11.547;
        let new_x = target_cx + (x_u - mid_x) * scale;
        let new_y = target_cy + (floor_y - 1.15 * h - mid_y) * scale;
        let phase = ((rel_w as f64 * 0.42) + (d as f64 * 0.26)) % wave_period;
        let cnt = day.contribution_count;
        let plural = if cnt == 1 { "" } else { "s" };

        cols.push(format!(
            "<g class=\"iso-col\" transform=\"translate({:.2} {:.2}) scale({})\">\
            <title>{}: {} contribution{}</title>\
            <rect x=\"0\" y=\"0\" width=\"18\" height=\"18\" transform=\"skewY(-30) skewX(40.89) scale(1 1.15)\" class=\"c{}t\" stroke=\"#fff\" stroke-opacity=\"0.06\" stroke-width=\"0.5\"></rect>\
            <rect x=\"0\" y=\"0\" width=\"18\" height=\"{:.2}\" transform=\"skewY(30) scale(1 1.15)\" class=\"c{}l\"><animate attributeName=\"height\" values=\"2.6;{:.2}\" dur=\"3s\" repeatCount=\"1\"></animate></rect>\
            <rect x=\"0\" y=\"0\" width=\"18\" height=\"{:.2}\" transform=\"translate(18 10.39) skewY(-30) scale(1 1.15)\" class=\"c{}r\"><animate attributeName=\"height\" values=\"2.6;{:.2}\" dur=\"3s\" repeatCount=\"1\"></animate></rect>\
            <animateTransform attributeName=\"transform\" type=\"translate\" values=\"0,0; 0,{}; 0,0\" dur=\"{:.1}s\" begin=\"-{:.2}s\" repeatCount=\"indefinite\" additive=\"sum\" calcMode=\"spline\" keySplines=\"0.45 0 0.55 1; 0.45 0 0.55 1\" keyTimes=\"0; 0.5; 1\"/>\
            </g>",
            new_x, new_y, scale, day.date, cnt, plural, lvl, h, lvl, h, h, lvl, h, float_h, wave_period, phase
        ));
    }

    Some(format!(
        "<g id=\"terrain-island\" class=\"terrain-3d\">\n{}\n</g>",
        cols.join("\n")
    ))
}
