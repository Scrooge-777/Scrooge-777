use regex::Regex;

pub fn update_svg_content(
    mut svg: String,
    terrain_xml: Option<String>,
    languages_xml: Option<String>,
    c_cnt: u32,
    m_cnt: u32,
    p_cnt: u32,
    r_cnt: u32,
    s_cnt: u32,
    f_cnt: u32,
    at_val: Option<(u32, u32)>,
) -> String {
    // 1. Sync 3D columns
    if let Some(wrapped_island) = terrain_xml {
        if let (Some(v2_start), Some(v2_grid_end)) = (svg.find("<g id=\"terrain-island\""), svg.find("<rect x=\"780\" y=\"96\"")) {
            svg = format!("{}{}\n{}", &svg[..v2_start], wrapped_island, &svg[v2_grid_end..]);
            let re_weeks = Regex::new(r">(Last 12 months|Activity since [^<]*|Last \d+ weeks)<").unwrap();
            svg = re_weeks.replace_all(&svg, ">Last 12 weeks<").to_string();
        }
    }

    // 2. Sync Top Languages section
    if let Some(langs_xml) = languages_xml {
        if let (Some(langs_start), Some(kpi_start)) = (svg.find("Top languages</text>"), svg.find("<rect x=\"30\" y=\"786\"")) {
            svg = format!("{}{}{}", &svg[..langs_start], langs_xml, &svg[kpi_start..]);
        }
    }

    // 3. Update bottom KPI capsules
    let re_c = Regex::new(r#"(<rect[^>]*width="200"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_c.replace_all(&svg, format!("${{1}}{}${{2}}", c_cnt)).to_string();

    let re_m = Regex::new(r#"(<rect[^>]*width="150"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_m.replace_all(&svg, format!("${{1}}{}${{2}}", m_cnt)).to_string();

    let re_p = Regex::new(r#"(<rect[^>]*width="170"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_p.replace_all(&svg, format!("${{1}}{}${{2}}", p_cnt)).to_string();

    let re_r = Regex::new(r#"(<rect[^>]*width="120"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_r.replace_all(&svg, format!("${{1}}{}${{2}}", r_cnt)).to_string();

    let re_s = Regex::new(r#"(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>stars</text>)"#).unwrap();
    svg = re_s.replace_all(&svg, format!("${{1}}{}${{2}}", s_cnt)).to_string();

    let re_f = Regex::new(r#"(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>forks</text>)"#).unwrap();
    svg = re_f.replace_all(&svg, format!("${{1}}{}${{2}}", f_cnt)).to_string();

    // All-time pill
    if let Some((at_contribs, active_days)) = at_val {
        let re_alltime = Regex::new(r"(?s)<!-- alltime -->.*?<!-- /alltime -->\n?").unwrap();
        svg = re_alltime.replace_all(&svg, "").to_string();

        let label_x = 992 + 18 * at_contribs.to_string().len() + 8;
        let pill_xml = format!(
            "<!-- alltime -->\n            <rect x=\"974\" y=\"786\" width=\"214\" height=\"46\" rx=\"14\" class=\"card kpi-pill\"/>\n            <text x=\"992\" y=\"818\" font-size=\"26\" font-weight=\"800\" class=\"strong\">{}</text>\n            <text x=\"{}\" y=\"817\" font-size=\"14\" class=\"weak\">since Sep 2026<title>{} contributions, {} active days</title></text>\n            <!-- /alltime -->\n",
            at_contribs, label_x, at_contribs, active_days
        );
        svg = svg.replace("</svg>", &format!("{}</svg>", pill_xml));
    }

    // 4. Update Radar labels
    let re_radar_m = Regex::new(r#"(<text[^>]*x="1015\.0"[^>]*y="168\.0"[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_radar_m.replace_all(&svg, format!("${{1}}{}${{2}}", m_cnt)).to_string();

    let re_radar_p = Regex::new(r#"(<text[^>]*x="1109\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_radar_p.replace_all(&svg, format!("${{1}}{}${{2}}", p_cnt)).to_string();

    let re_radar_r = Regex::new(r#"(<text[^>]*x="862\.8"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)"#).unwrap();
    svg = re_radar_r.replace_all(&svg, format!("${{1}}{}${{2}}", r_cnt)).to_string();

    // 5. Purge any floating/roaming koi layer from template
    if svg.contains("id=\"roaming-koi\"") {
        let re_koi1 = Regex::new(r"(?s)<!-- Living Roaming Activity Koi -->\s*<g id=\x22roaming-koi\x22>.*?</g>\n?").unwrap();
        svg = re_koi1.replace_all(&svg, "").to_string();
        let re_koi2 = Regex::new(r"(?s)<g id=\x22roaming-koi\x22>.*?</g>\n?").unwrap();
        svg = re_koi2.replace_all(&svg, "").to_string();
    }

    svg
}
