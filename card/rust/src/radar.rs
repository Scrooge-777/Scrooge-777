pub fn generate_radar_geometry(
    m_cnt: u32,
    i_cnt: u32,
    p_cnt: u32,
    v_cnt: u32,
    r_cnt: u32,
) -> (String, Vec<(f64, f64)>) {
    let cx = 1015.0;
    let cy = 310.0;
    let r_min = 18.0;
    let r_max = 126.0;

    let get_r = |val: f64, cap: f64| -> f64 {
        if val <= 0.0 {
            r_min
        } else {
            let ratio = (1.0f64).min((1.0 + val).ln() / (1.0 + cap).ln());
            r_min + ratio * (r_max - r_min)
        }
    };

    let angles_deg: [f64; 5] = [-90.0, -18.0, 54.0, 126.0, 198.0];
    let values = [
        m_cnt as f64,
        i_cnt as f64,
        p_cnt as f64,
        v_cnt as f64,
        r_cnt as f64,
    ];
    let caps = [500.0, 20.0, 20.0, 20.0, 15.0];

    let mut points = Vec::new();
    let mut nodes = Vec::new();

    for (val, (cap, deg)) in values.iter().zip(caps.iter().zip(angles_deg.iter())) {
        let rad = (*deg).to_radians();
        let dist = get_r(*val, *cap);
        let px = cx + dist * rad.cos();
        let py = cy + dist * rad.sin();
        points.push(format!("{:.1},{:.1}", px, py));
        nodes.push((px, py));
    }

    (points.join(" "), nodes)
}
