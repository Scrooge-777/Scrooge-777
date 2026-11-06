//! Build the "roaming koi" profile scene as ONE animated SVG.
//!
//! GitHub renders README images with scripts disabled, so a koi cannot be steered live. This
//! module plans each fish's whole wander in advance (seeded, so every period gets a new route)
//! and bakes it into SMIL: a smooth closed route that sweeps the whole scene including every
//! corner, a speed profile with tail-beat surges and darts, and the fish rotating along its
//! heading. The header and the activity card are drawn exactly as they are in their own files.
//!
//! Pure functions, no I/O. Rules: `rules/koi-life.md` and `rules/koi-family.md`.
use std::collections::BTreeSet;
use std::f64::consts::PI;

use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};

use crate::{
    life::Life,
    fmt::{f1, f3, js_round, num},
    rules::rules,
};

pub type P = [f64; 2];
type Seg = [P; 4];

// The header is capsule-render's animated "venom" blob (854 x 220), scaled to the card's width.
pub const HEADER_W: f64 = 854.0;
pub const HEADER_H: f64 = 220.0;
const HEADER_SCALE: f64 = 1280.0 / HEADER_W;
pub const SCENE_W: f64 = 1280.0;
pub const CARD_H: f64 = 850.0;

/// Where the card starts below the header.
pub fn card_y() -> f64 {
    js_round(HEADER_H * HEADER_SCALE) + 16.0
}
pub fn scene_h() -> f64 {
    card_y() + CARD_H
}

const MARGIN_X: f64 = 60.0;
const MARGIN_TOP: f64 = 60.0;
const MARGIN_BOTTOM: f64 = 40.0;
const KICK_PERIOD: f64 = 0.9; // seconds between tail-beat surges
const SAMPLE_DT: f64 = 0.2; // keyframe spacing along the route
const MAX_CURVATURE: f64 = 1.0 / 110.0; // tightest turn allowed (1 / radius in px)
const KOI_SCALE: f64 = 0.6;

/// The 3D contribution terrain inside the card (scene px); the koi swims over it.
fn terrain() -> (f64, f64, f64, f64) {
    (170.0, card_y() + 160.0, 460.0, 280.0)
}

// ---------- the 5-hour route ----------
pub fn route_period_ms() -> i64 {
    rules().route.period_hours as i64 * 3600 * 1000
}

/// The seed is the login plus the number of 5-hour periods since 1970, so every run inside one
/// period reproduces the same route and only a new period gives a new one.
pub fn route_seed(login: &str, now_ms: i64) -> u32 {
    let mut h: u32 = 0;
    for unit in login.encode_utf16() {
        h = h.wrapping_mul(31).wrapping_add(unit as u32);
    }
    h.wrapping_add((now_ms.div_euclid(route_period_ms())) as u32)
}

// ---------- helpers ----------
/// A small, fast, seedable random generator (mulberry32).
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(seed)
    }
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

fn clamp(v: f64, a: f64, b: f64) -> f64 {
    b.min(a.max(v))
}
fn dist(a: P, b: P) -> f64 {
    (a[0] - b[0]).hypot(a[1] - b[1])
}

// ---------- route planning ----------
/// Closed Catmull-Rom spline as cubic Bezier segments.
pub fn closed_beziers(pts: &[P]) -> Vec<Seg> {
    let n = pts.len();
    (0..n)
        .map(|i| {
            let p0 = pts[(i + n - 1) % n];
            let p1 = pts[i];
            let p2 = pts[(i + 1) % n];
            let p3 = pts[(i + 2) % n];
            [
                p1,
                [p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0],
                [p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0],
                p2,
            ]
        })
        .collect()
}

fn bez(seg: &Seg, t: f64) -> P {
    let u = 1.0 - t;
    let (a, b, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
    [a * seg[0][0] + b * seg[1][0] + c * seg[2][0] + d * seg[3][0], a * seg[0][1] + b * seg[1][1] + c * seg[2][1] + d * seg[3][1]]
}

#[derive(Debug, Clone)]
pub struct Poly {
    pub pts: Vec<P>,
    pub cum: Vec<f64>,
    pub length: f64,
}

fn sample_polyline(segs: &[Seg], per: usize) -> Poly {
    let mut pts: Vec<P> = Vec::new();
    let mut cum: Vec<f64> = Vec::new();
    let mut len = 0.0;
    for seg in segs {
        for k in 0..per {
            let p = bez(seg, k as f64 / per as f64);
            if let Some(&last) = pts.last() {
                len += dist(last, p);
            }
            pts.push(p);
            cum.push(len);
        }
    }
    let closing = bez(&segs[segs.len() - 1], 1.0);
    len += dist(pts[pts.len() - 1], closing);
    pts.push(closing);
    cum.push(len);
    Poly { pts, cum, length: len }
}

/// The point `s` px along a polyline.
pub fn pos_at(poly: &Poly, s: f64) -> P {
    if s <= 0.0 {
        return poly.pts[0];
    }
    if s >= poly.length {
        return poly.pts[poly.pts.len() - 1];
    }
    let (mut lo, mut hi) = (0usize, poly.cum.len() - 1);
    while hi - lo > 1 {
        let mid = (lo + hi) >> 1;
        if poly.cum[mid] <= s { lo = mid } else { hi = mid }
    }
    let f = (s - poly.cum[lo]) / 1e-9_f64.max(poly.cum[hi] - poly.cum[lo]);
    [poly.pts[lo][0] + (poly.pts[hi][0] - poly.pts[lo][0]) * f, poly.pts[lo][1] + (poly.pts[hi][1] - poly.pts[lo][1]) * f]
}

struct Bounds {
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
}

fn curvature(a: P, b: P, c: P) -> f64 {
    let (ab, bc, ca) = (dist(a, b), dist(b, c), dist(c, a));
    let cross = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).abs();
    (2.0 * cross) / (ab * bc * ca)
}

/// Largest curvature (1/radius) and scene coverage of a route.
fn judge(poly: &Poly, bounds: &Bounds) -> (f64, f64) {
    let pts = &poly.pts;
    let mut max_k = 0.0_f64;
    let step = 5;
    let mut i = step;
    while i + step < pts.len() {
        let (a, b, c) = (pts[i - step], pts[i], pts[i + step]);
        let (ab, bc) = (dist(a, b), dist(b, c));
        if !(ab < 1.0 || bc < 1.0) {
            max_k = max_k.max(curvature(a, b, c));
        }
        i += 2;
    }
    let (cols, rows) = (5usize, 6usize);
    let mut seen = BTreeSet::new();
    for p in pts {
        let cx = clamp((((p[0] - bounds.x0) / (bounds.x1 - bounds.x0)) * cols as f64).floor(), 0.0, cols as f64 - 1.0) as usize;
        let cy = clamp((((p[1] - bounds.y0) / (bounds.y1 - bounds.y0)) * rows as f64).floor(), 0.0, rows as f64 - 1.0) as usize;
        seen.insert(cx + cy * cols);
    }
    (max_k, seen.len() as f64 / (cols * rows) as f64)
}

#[derive(Debug, Clone)]
pub struct Route {
    pub pts: Vec<P>,
    pub segs: Vec<Seg>,
    pub poly: Poly,
    pub max_k: f64,
    pub coverage: f64,
    pub corners_hit: usize,
}

/// A truly random wander: the fish keeps picking a random spot anywhere in the scene (often near
/// an edge or corner), turns toward it as sharply as a real fish can, and picks another the moment
/// it gets there. The wander is simulated, then joined back to its start with one smooth
/// connecting curve, so the baked route loops without a jump.
pub fn plan_route(rng: &mut Rng) -> Route {
    let (scene_h, card_y) = (scene_h(), card_y());
    let bounds = Bounds { x0: MARGIN_X, y0: MARGIN_TOP, x1: SCENE_W - MARGIN_X, y1: scene_h - MARGIN_BOTTOM };
    let (tx, _ty, tw, th) = terrain();
    const STEP: f64 = 16.0; // px of travel per simulation step
    let max_turn = STEP * MAX_CURVATURE; // radians per step
    let (min_length, max_length) = (11000.0, 24000.0);

    let random_spot = |rng: &mut Rng| -> P {
        let roll = rng.next();
        if roll < 0.2 {
            // inside the 3D terrain
            let x = tx + rng.next() * tw;
            return [x, card_y + 160.0 + rng.next() * th];
        }
        if roll < 0.32 {
            // along the row of stat pills at the bottom
            let x = bounds.x0 + rng.next() * (bounds.x1 - bounds.x0);
            return [x, card_y + 800.0 + rng.next() * 45.0];
        }
        if rng.next() < 0.3 {
            // an edge or corner region
            let cx = if rng.next() < 0.5 { bounds.x0 + rng.next() * 200.0 } else { bounds.x1 - rng.next() * 200.0 };
            let cy = if rng.next() < 0.5 { bounds.y0 + rng.next() * 260.0 } else { bounds.y1 - rng.next() * 260.0 };
            return [cx, cy];
        }
        let x = bounds.x0 + rng.next() * (bounds.x1 - bounds.x0);
        [x, bounds.y0 + rng.next() * (bounds.y1 - bounds.y0)]
    };
    let ang_diff = |a: f64, b: f64| ((a - b + PI) % (2.0 * PI) + 2.0 * PI) % (2.0 * PI) - PI;

    let sx = bounds.x0 + rng.next() * (bounds.x1 - bounds.x0);
    let mut pos: P = [sx, bounds.y0 + rng.next() * (bounds.y1 - bounds.y0)];
    let mut theta = rng.next() * PI * 2.0;
    let (start, start_theta) = (pos, theta);
    let mut target = random_spot(rng);
    let mut trail: Vec<(P, f64)> = vec![(pos, theta)];
    let mut wobble = 0.0_f64;
    let mut travelled = 0.0;
    while travelled < max_length {
        if dist(pos, target) < 130.0 {
            loop {
                target = random_spot(rng);
                if dist(pos, target) >= 320.0 {
                    break;
                }
            }
        }
        // head for the target, but turn back toward the middle if the turning circle would
        // carry the fish well past the edge of the scene
        let mut want = (target[1] - pos[1]).atan2(target[0] - pos[0]);
        let ahead = [pos[0] + theta.cos() * 150.0, pos[1] + theta.sin() * 150.0];
        if ahead[0] < bounds.x0 - 60.0 || ahead[0] > bounds.x1 + 60.0 || ahead[1] < bounds.y0 - 60.0 || ahead[1] > bounds.y1 + 60.0 {
            want = ((bounds.y0 + bounds.y1) / 2.0 - pos[1]).atan2((bounds.x0 + bounds.x1) / 2.0 - pos[0]);
        }
        wobble = wobble * 0.92 + (rng.next() - 0.5) * 0.05;
        theta += clamp(clamp(ang_diff(want, theta), -max_turn, max_turn) + wobble * max_turn, -max_turn, max_turn);
        pos = [pos[0] + theta.cos() * STEP, pos[1] + theta.sin() * STEP];
        trail.push((pos, theta));
        travelled += STEP;
    }

    // Join the end back to the start with a cubic whose end tangents match the headings; pick the
    // cut-off point whose connector bends least.
    let connector = |i: usize| -> Option<(Vec<P>, f64)> {
        let (ep, eth) = trail[i];
        let d = dist(ep, start);
        if d < 260.0 {
            return None;
        }
        let c1 = [ep[0] + eth.cos() * d * 0.4, ep[1] + eth.sin() * d * 0.4];
        let c2 = [start[0] - start_theta.cos() * d * 0.4, start[1] - start_theta.sin() * d * 0.4];
        let seg: Seg = [ep, c1, c2, start];
        let n = 4.max(js_round(d / 40.0) as usize);
        let pts: Vec<P> = (1..n).map(|k| bez(&seg, k as f64 / n as f64)).collect();
        let dense: Vec<P> = (0..=40).map(|k| bez(&seg, k as f64 / 40.0)).collect();
        let mut max_k = 0.0_f64;
        for k in 1..dense.len() - 1 {
            max_k = max_k.max(curvature(dense[k - 1], dense[k], dense[k + 1]));
        }
        let overshoot = pts.iter().any(|p| p[0] < -60.0 || p[0] > SCENE_W + 60.0 || p[1] < -60.0 || p[1] > scene_h + 60.0);
        if overshoot { None } else { Some((pts, max_k)) }
    };
    let mut best: Option<(usize, Vec<P>, f64)> = None;
    let mut i = (min_length / STEP).floor() as usize;
    while i < trail.len() {
        if let Some((pts, max_k)) = connector(i) {
            if best.as_ref().is_none_or(|b| max_k < b.2) {
                best = Some((i, pts, max_k));
            }
        }
        i += 6;
    }
    let cut = best.as_ref().map(|b| b.0).unwrap_or(trail.len() - 1);
    let mut pts: Vec<P> = trail[..=cut].iter().enumerate().filter(|(i, _)| i % 3 == 0).map(|(_, o)| o.0).collect();
    if let Some((_, extra, _)) = &best {
        pts.extend(extra.iter().copied());
    }
    let segs = closed_beziers(&pts);
    let poly = sample_polyline(&segs, 12);
    let (max_k, coverage) = judge(&poly, &bounds);
    let corners = [[bounds.x0, bounds.y0], [bounds.x1, bounds.y0], [bounds.x1, bounds.y1], [bounds.x0, bounds.y1]];
    let corners_hit = corners.iter().filter(|c| poly.pts.iter().any(|p| dist(*p, **c) < 150.0)).count();
    let poly = sample_polyline(&segs, 40);
    Route { pts, segs, poly, max_k, coverage, corners_hit }
}

fn path_data(segs: &[Seg]) -> String {
    let mut d = format!("M{} {}", f1(segs[0][0][0]), f1(segs[0][0][1]));
    for s in segs {
        d += &format!("C{} {} {} {} {} {}", f1(s[1][0]), f1(s[1][1]), f1(s[2][0]), f1(s[2][1]), f1(s[3][0]), f1(s[3][1]));
    }
    d + "Z"
}

// ---------- a sleeping fish: a slow drift in a small oval among the bars ----------
/// Card coordinates on the terrain floor.
const NESTS: [P; 5] = [[250.0, 390.0], [335.0, 425.0], [425.0, 415.0], [505.0, 390.0], [300.0, 335.0]];

pub fn plan_nest(index: usize, rng: &mut Rng) -> Route {
    let [nx, ny] = NESTS[index % NESTS.len()];
    let (cx, cy) = (nx, card_y() + ny);
    let nest = &rules().life.nest;
    let tilt = (rng.next() - 0.5) * 0.6;
    let pts: Vec<P> = (0..6)
        .map(|i| {
            let a = (i as f64 / 6.0) * 2.0 * PI;
            let (x, y) = (nest.radius_x * a.cos(), nest.radius_y * a.sin());
            [cx + x * tilt.cos() - y * tilt.sin(), cy + x * tilt.sin() + y * tilt.cos()]
        })
        .collect();
    let segs = closed_beziers(&pts);
    let poly = sample_polyline(&segs, 40);
    Route { pts, segs, poly, max_k: 0.0, coverage: 0.0, corners_hit: 0 }
}

#[derive(Debug, Clone)]
pub struct Sim {
    /// (time, distance along the route)
    pub samples: Vec<(f64, f64)>,
    pub duration: f64,
    pub darts: usize,
}

/// Constant slow speed, no tail-beat surges.
pub fn drift(route: &Route, pixels_per_second: f64) -> Sim {
    let length = route.poly.length;
    let duration = length / pixels_per_second;
    let mut samples = Vec::new();
    let mut t = 0.0;
    while t < duration {
        samples.push((t, t * pixels_per_second));
        t += SAMPLE_DT;
    }
    samples.push((duration, length));
    Sim { samples, duration, darts: 0 }
}

// ---------- speed profile: tail-beat surges, smooth darts ----------
pub fn simulate(route: &Route, rng: &mut Rng, speed_factor: f64, with_darts: bool) -> Sim {
    let length = route.poly.length;
    let mut darts: Vec<(f64, f64)> = Vec::new();
    let dart_count = 2 + (rng.next() * 3.0).floor() as usize;
    for _ in 0..dart_count {
        let d = (rng.next() * length, 300.0 + rng.next() * 260.0); // drawn either way, so a route never depends on the fish's mood
        if with_darts {
            darts.push(d);
        }
    }
    let mut samples = Vec::new();
    let (mut t, mut s) = (0.0_f64, 0.0_f64);
    let dt = 0.02;
    let mut next_sample = 0.0;
    let base = rules().route.cruise_speed;
    while s < length && t < 600.0 {
        if t >= next_sample {
            samples.push((t, s));
            next_sample += SAMPLE_DT;
        }
        let kick = 0.5 - 0.5 * (2.0 * PI * t / KICK_PERIOD).cos(); // smooth 0..1
        let mut v = base * speed_factor * (0.78 + 0.5 * kick);
        for &(ds, dlen) in &darts {
            if s >= ds && s < ds + dlen {
                let u = (s - ds) / dlen;
                v *= 1.0 + 0.9 * (PI * u).sin().powi(2); // smooth burst
            }
        }
        s += v * dt;
        t += dt;
    }
    samples.push((t, length));
    Sim { samples, duration: t, darts: darts.len() }
}

// ---------- inlining the activity card ----------
/// Prefix every rule of a stylesheet with a scope selector. The card must be inlined (not
/// `<image>`-embedded): GitHub renders nested SVG images statically, which would freeze the
/// card's own animations.
pub fn scope_css(css: &str, scope: &str) -> String {
    let comments = Regex::new(r"(?s)/\*.*?\*/").expect("regex");
    let keyframes_re = Regex::new(r"@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}").expect("regex");
    let rules_re = Regex::new(r"([^{}@]+)\{([^{}]*)\}").expect("regex");
    let marker_re = Regex::new(r"@@KF(\d+)@@").expect("regex");
    let mut keyframes: Vec<String> = Vec::new();
    let no_comments = comments.replace_all(css, "");
    let text = keyframes_re.replace_all(&no_comments, |c: &Captures| {
        keyframes.push(c[0].to_string());
        format!("@@KF{}@@", keyframes.len() - 1)
    });
    let text = rules_re.replace_all(&text, |c: &Captures| {
        let scoped: Vec<String> = c[1].split(',').map(|x| format!("{scope} {}", x.trim())).collect();
        format!("{}{{{}}}", scoped.join(","), &c[2])
    });
    marker_re.replace_all(&text, |c: &Captures| keyframes[c[1].parse::<usize>().unwrap_or(0)].clone()).into_owned()
}

fn inner_svg(svg: &str) -> String {
    let open = Regex::new(r"(?s)^.*?<svg[^>]*>").expect("regex");
    let close = Regex::new(r"(?s)</svg>\s*$").expect("regex");
    close.replace(&open.replace(svg, ""), "").into_owned()
}

pub fn prepare_card(svg: &str) -> String {
    let inner = inner_svg(svg);
    let titles = Regex::new(r"(?s)<title.*?</title>|<desc.*?</desc>").expect("regex");
    let inner = titles.replace_all(&inner, "").into_owned();
    let style = Regex::new(r"(?s)<style>(.*?)</style>").expect("regex");
    style.replace(&inner, |c: &Captures| format!("<style>{}</style>", scope_css(&c[1], "svg.cd"))).into_owned()
}

// ---------- the 3D terrain: pull it out of the card so the koi can swim over it ----------
pub fn split_terrain(card_inner: &str) -> (String, String) {
    let Some(start) = card_inner.find("<g id=\"terrain-island\"") else {
        return (String::new(), card_inner.to_string());
    };
    let tag = Regex::new(r"<g\b|</g>").expect("regex");
    let mut depth = 0i32;
    let mut end = None;
    for m in tag.find_iter(&card_inner[start..]) {
        if m.as_str() == "</g>" {
            depth -= 1;
            if depth == 0 {
                end = Some(start + m.end());
                break;
            }
        } else {
            depth += 1;
        }
    }
    match end {
        None => (String::new(), card_inner.to_string()),
        Some(end) => (card_inner[start..end].to_string(), format!("{}{}", &card_inner[..start], &card_inner[end..])),
    }
}

struct Grass {
    radius: f64,
    core: f64,
    max_degrees: f64,
    hertz: f64,
    damping: f64,
    step: f64,
    out: f64,
}
const GRASS: Grass = Grass { radius: 150.0, core: 45.0, max_degrees: 12.0, hertz: 1.4, damping: 0.32, step: 0.05, out: 0.1 };

/// A fish's route and the speed it swims it at.
pub struct Path {
    pub route: Route,
    pub sim: Sim,
}

/// Position of a fish at time t on its looping route.
fn fish_at(path: &Path, t: f64) -> P {
    let samples = &path.sim.samples;
    let duration = path.sim.duration;
    let tt = ((t % duration) + duration) % duration;
    let (mut lo, mut hi) = (0usize, samples.len() - 1);
    while hi - lo > 1 {
        let mid = (lo + hi) >> 1;
        if samples[mid].0 <= tt { lo = mid } else { hi = mid }
    }
    let f = (tt - samples[lo].0) / 1e-9_f64.max(samples[hi].0 - samples[lo].0);
    pos_at(&path.route.poly, samples[lo].1 + (samples[hi].1 - samples[lo].1) * f)
}

/// Make every terrain bar lean away from the koi as it swims past and spring back with a small
/// wobble, like grass: one rotate animation per bar, only for bars the koi reaches.
/// Returns the new terrain and how many bars sway.
pub fn add_grass(terrain_svg: &str, path: &Path, card_y: f64) -> (String, usize) {
    let t_total = path.sim.duration;
    let steps = js_round(t_total / GRASS.step) as usize;
    let fish_path: Vec<P> = (0..steps).map(|i| fish_at(path, i as f64 * GRASS.step)).collect();
    let omega = 2.0 * PI * GRASS.hertz;
    let mut swaying = 0usize;
    let col_re = Regex::new(r#"(?s)<g class="iso-col" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">(.*?)</g>"#).expect("regex");
    let height_re = Regex::new(r#"class="c\dl"[^>]*><animate attributeName="height" values="[\d.]+;([\d.]+)""#).expect("regex");
    let out = col_re.replace_all(terrain_svg, |c: &Captures| {
        let whole = c[0].to_string();
        let (tx, ty, sc): (f64, f64, f64) = (c[1].parse().unwrap_or(0.0), c[2].parse().unwrap_or(0.0), c[3].parse().unwrap_or(1.0));
        let height = height_re.captures(&c[4]).and_then(|m| m[1].parse::<f64>().ok()).unwrap_or(3.0);
        let (base_y, base_x) = (height * 1.15 + 10.0, 9.0);
        let centre: P = [tx + base_x * sc, card_y + ty + base_y * 0.45 * sc];
        let reach = 0.45 + 0.55 * clamp(height / 55.0, 0.0, 1.0); // taller bars sway more
        let target = |p: P| -> f64 {
            let d = dist(p, centre);
            if d >= GRASS.radius {
                return 0.0;
            }
            let u = clamp((GRASS.radius - d) / (GRASS.radius - GRASS.core), 0.0, 1.0);
            let diff = centre[0] - p[0];
            (if diff == 0.0 { 1.0 } else { diff }).signum() * GRASS.max_degrees * reach * u * u * (3.0 - 2.0 * u)
        };
        if !fish_path.iter().any(|p| dist(*p, centre) < GRASS.radius) {
            return whole;
        }
        // damped spring, run two loops so the end matches the start
        let (mut a, mut v) = (0.0_f64, 0.0_f64);
        let mut series = Vec::with_capacity(steps);
        for pass in 0..2 {
            for fp in fish_path.iter().take(steps) {
                let acc = omega * omega * (target(*fp) - a) - 2.0 * GRASS.damping * omega * v;
                v += acc * GRASS.step;
                a += v * GRASS.step;
                if pass == 1 {
                    series.push(a);
                }
            }
        }
        let every = js_round(GRASS.out / GRASS.step) as usize;
        let mut keys: Vec<(f64, f64)> = Vec::new();
        let mut i = 0;
        while i < steps {
            let lo = series[i.saturating_sub(every)].abs();
            let hi = series[(i + every).min(steps - 1)].abs();
            let active = series[i].abs() > 0.12 || lo > 0.12 || hi > 0.12;
            if active || i == 0 {
                keys.push((i as f64 * GRASS.step, series[i]));
            }
            i += every;
        }
        if keys[keys.len() - 1].0 < t_total - 1e-6 {
            keys.push((t_total, series[0]));
        }
        if keys.len() < 3 {
            return whole;
        }
        swaying += 1;
        let key_times: Vec<String> = keys.iter().map(|(t, _)| f3(clamp(t / t_total, 0.0, 1.0))).collect();
        let values: Vec<String> = keys.iter().map(|(_, ang)| format!("{} {} {}", num(js_round(ang * 100.0) / 100.0), num(base_x), f1(base_y))).collect();
        let anim = format!(
            "<animateTransform attributeName=\"transform\" type=\"rotate\" additive=\"sum\" dur=\"{}s\" repeatCount=\"indefinite\" calcMode=\"linear\" keyTimes=\"{}\" values=\"{}\"/>",
            f1(t_total),
            key_times.join(";"),
            values.join(";")
        );
        format!("{}{anim}</g>", &whole[..whole.len() - 4])
    });
    (out.into_owned(), swaying)
}

// ---------- the scene ----------
/// The header's colours: a dim slate blob behind a light title, so the title reads everywhere.
const HEADER_BLOB: &str = "#394254";
const HEADER_TEXT: &str = "#e2e8f0";

/// The header SVG comes from capsule-render. Namespace its ids, classes and keyframes so they
/// cannot clash with the card's, and drop the outer `<svg>` tag.
pub fn prepare_header(svg: &str) -> String {
    let mut inner = inner_svg(svg);
    let swaps: [(&str, String); 8] = [
        (r"\.text\b", ".hd-text".into()),
        (r"\.desc\b", ".hd-desc".into()),
        (r#"class="text""#, r#"class="hd-text""#.into()),
        (r#"class="desc""#, r#"class="hd-desc""#.into()),
        (r"\btwinkling\b", "hd-twinkling".into()),
        (r"\bmyPath\b", "hd-myPath".into()),
        // percentages would resolve against the whole scene, so pin them to the header's own size
        (r#"x="50%""#, format!("x=\"{}\"", num(HEADER_W / 2.0))),
        (r#"y="40%""#, format!("y=\"{}\"", num(HEADER_H * 0.4))),
    ];
    for (pattern, with) in &swaps {
        inner = Regex::new(pattern).expect("regex").replace_all(&inner, with.as_str()).into_owned();
    }
    let blob = Regex::new(r##"(<path id="hd-myPath" fill=")#[0-9a-fA-F]{6}("[^>]*>)"##).expect("regex");
    inner = blob.replace(&inner, |c: &Captures| format!("{}{HEADER_BLOB}{}", &c[1], &c[2])).into_owned();
    Regex::new(r"(?i)fill:#ffffff;").expect("regex").replace_all(&inner, format!("fill:{HEADER_TEXT};").as_str()).into_owned()
}

/// One strip of koi frames, drawn side by side (see `sprite`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprite {
    pub w: u32,
    pub h: u32,
    pub frames: u32,
    pub length: u32,
    pub pivot: [f64; 2],
    pub b64: String,
}

/// One fish to draw.
#[derive(Debug, Clone)]
pub struct Member {
    pub growth: f64,
    /// Days since it was born (a newborn fades in).
    pub age: f64,
    pub life: Life,
}

#[derive(Debug, Clone)]
pub struct RouteMeta {
    pub duration: f64,
    pub length: f64,
    pub speed: f64,
    pub max_curvature: f64,
    pub coverage: f64,
    pub corners_hit: usize,
    pub darts: usize,
    pub state: &'static str,
    pub waypoints: Vec<P>,
}

pub struct Scene {
    pub svg: String,
    pub routes: Vec<RouteMeta>,
    pub swaying_bars: usize,
}

pub fn build_scene(seed: u32, speed: f64, crew: &[Member], sprite: &Sprite, header_svg: &str, card_svg: &str) -> Scene {
    let banner = prepare_header(header_svg);
    let (fw, fh, frames) = (f64::from(sprite.w), f64::from(sprite.h), f64::from(sprite.frames));
    let [pivot_x, pivot_y] = sprite.pivot;
    // The route is followed by a point on the fish's body axis just behind the nose, so the head
    // leads and the body and fins trail along the direction of travel.
    let frame_vals: Vec<String> = (0..sprite.frames).map(|i| format!("{} 0", num(-(f64::from(i)) * fw))).collect();
    let flip_dur: f64 = f3(frames * 70.0 / 1000.0).parse().unwrap_or(0.56);

    let mut routes = Vec::new();
    let mut paths: Vec<Path> = Vec::new();
    let mut defs = Vec::new();
    let mut fish_svg = Vec::new();
    let mut tails: Vec<f64> = Vec::new(); // one sprite per tail-beat speed in use
    for (i, member) in crew.iter().enumerate() {
        let mut rng = Rng::new(seed.wrapping_add((i as u32).wrapping_mul(7919)));
        let life = &member.life;
        let asleep = life.state == "sleep";
        let route = if asleep { plan_nest(i, &mut rng) } else { plan_route(&mut rng) };
        let sim = if asleep { drift(&route, life.speed) } else { simulate(&route, &mut rng, speed * life.speed * if i == 0 { 1.0 } else { 1.12 }, life.darts) };
        let t = sim.duration;
        let length = route.poly.length;
        let key_points: Vec<String> = sim.samples.iter().map(|&(_, s)| f3(clamp(s / length, 0.0, 1.0))).collect();
        let key_times: Vec<String> = sim.samples.iter().map(|&(st, _)| f3(clamp(st / t, 0.0, 1.0))).collect();
        let scale = KOI_SCALE * member.growth;
        if !tails.contains(&life.tail) {
            tails.push(life.tail);
        }
        let pop = if member.age < 2.0 { "<animate attributeName=\"opacity\" values=\"0;1\" dur=\"2.5s\" fill=\"freeze\"/>" } else { "" }; // a newborn fades in
        let d = path_data(&route.segs);
        defs.push(format!("<path id=\"route{i}\" d=\"{d}\" fill=\"none\"/>"));
        let tail = num(life.tail);
        fish_svg.push(format!(
            "<g class=\"fish\">{pop}<animateMotion dur=\"{}s\" repeatCount=\"indefinite\" rotate=\"auto\" calcMode=\"linear\" keyPoints=\"{}\" keyTimes=\"{}\"><mpath href=\"#route{i}\" xlink:href=\"#route{i}\"/></animateMotion>\
<g opacity=\"{}\" transform=\"scale({}) translate({} {})\"><use href=\"#koi-sprite-{tail}\" xlink:href=\"#koi-sprite-{tail}\"/></g></g>",
            f1(t),
            key_points.join(";"),
            key_times.join(";"),
            num(life.opacity),
            f3(scale),
            num(-pivot_x),
            num(-pivot_y),
        ));
        routes.push(RouteMeta {
            duration: t,
            length,
            speed: length / t,
            max_curvature: route.max_k,
            coverage: route.coverage,
            corners_hit: route.corners_hit,
            darts: sim.darts,
            state: life.state,
            waypoints: route.pts.clone(),
        });
        if !asleep {
            paths.push(Path { route, sim }); // bars lean away from swimmers, not from a sleeper
        }
    }

    let sprites: String = tails
        .iter()
        .map(|&tail| {
            let tail_id = num(tail);
            format!(
                "<g id=\"koi-sprite-{tail_id}\"><svg x=\"0\" y=\"0\" width=\"{w}\" height=\"{h}\" viewBox=\"0 0 {w} {h}\" overflow=\"hidden\">\
<image width=\"{iw}\" height=\"{h}\" href=\"data:image/png;base64,{b64}\" xlink:href=\"data:image/png;base64,{b64}\">\
<animateTransform attributeName=\"transform\" type=\"translate\" calcMode=\"discrete\" dur=\"{dur}s\" repeatCount=\"indefinite\" values=\"{vals}\"/></image></svg></g>",
                w = num(fw),
                h = num(fh),
                iw = num(fw * frames),
                b64 = sprite.b64,
                dur = f3(flip_dur * tail),
                vals = frame_vals.join(";"),
            )
        })
        .collect();

    let k = HEADER_SCALE;
    let (cy, sh) = (card_y(), scene_h());
    // Layer order: header background < 3D terrain < koi < header text < rest of the card. The koi
    // swims over the terrain (whose bars sway like grass) and under everything else.
    let (mut terrain_svg, card_rest) = split_terrain(&prepare_card(card_svg));
    let mut swaying = 0usize;
    if !terrain_svg.is_empty() {
        for path in &paths {
            let (svg, n) = add_grass(&terrain_svg, path, cy); // every fish bends the bars
            terrain_svg = svg;
            swaying = swaying.max(n);
        }
    }
    let text_at = banner.find("<text");
    let (banner_back, banner_front) = match text_at {
        Some(at) if at > 0 => (&banner[..at], &banner[at..]),
        _ => (banner.as_str(), ""),
    };
    let svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 {sw} {sh}\" width=\"{sw}\" height=\"{sh}\" role=\"img\" aria-labelledby=\"scene-t scene-d\">\n\
<title id=\"scene-t\">Scrooge-777 profile with roaming koi</title>\n\
<desc id=\"scene-d\">The profile header and GitHub activity card. Koi swim freely under all of it; their size follows total contributions.</desc>\n\
<defs>{defs}{sprites}</defs>\n\
<g transform=\"scale({k3})\">{banner_back}</g>\n\
<svg class=\"cd\" x=\"0\" y=\"{cy}\" width=\"1280\" height=\"{ch}\" viewBox=\"0 0 1280 850\" overflow=\"hidden\">{terrain_svg}</svg>\n\
<g id=\"koi\">{fish}</g>\n\
<g transform=\"scale({k3})\">{banner_front}</g>\n\
<svg class=\"cd\" x=\"0\" y=\"{cy}\" width=\"1280\" height=\"{ch}\" viewBox=\"0 0 1280 850\" overflow=\"hidden\">{card_rest}</svg>\n\
</svg>",
        sw = num(SCENE_W),
        sh = num(sh),
        defs = defs.join(""),
        k3 = f3(k),
        cy = num(cy),
        ch = num(CARD_H),
        fish = fish_svg.join(""),
    );
    Scene { svg, routes, swaying_bars: swaying }
}
