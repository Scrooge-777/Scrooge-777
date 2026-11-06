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
    koi_base64: Option<&str>,
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
            "<!-- alltime -->\n\
            <rect x=\"974\" y=\"786\" width=\"214\" height=\"46\" rx=\"14\" class=\"card kpi-pill\"/>\n\
            <text x=\"992\" y=\"818\" font-size=\"26\" font-weight=\"800\" class=\"strong\">{}</text>\n\
            <text x=\"{}\" y=\"817\" font-size=\"14\" class=\"weak\">since Sep 2026<title>{} contributions, {} active days</title></text>\n\
            <!-- /alltime -->\n",
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

    // 5. Roaming Koi Injection with rotate="auto" and dual ripple wakes
    if let Some(b64) = koi_base64 {
        let koi_block = format!(
            "<!-- Living Roaming Activity Koi -->\n\
            <g id=\"roaming-koi\">\n\
              <circle r=\"32\" fill=\"#ffd700\" fill-opacity=\"0.10\" filter=\"url(#soft)\">\n\
                <animate attributeName=\"r\" values=\"18;44;18\" dur=\"4s\" repeatCount=\"indefinite\"/>\n\
                <animate attributeName=\"opacity\" values=\"0.25;0.75;0.25\" dur=\"4s\" repeatCount=\"indefinite\"/>\n\
              </circle>\n\
              <circle r=\"50\" fill=\"#38bdf8\" fill-opacity=\"0.05\" filter=\"url(#soft)\">\n\
                <animate attributeName=\"r\" values=\"30;64;30\" dur=\"5s\" repeatCount=\"indefinite\"/>\n\
                <animate attributeName=\"opacity\" values=\"0.15;0.5;0.15\" dur=\"5s\" repeatCount=\"indefinite\"/>\n\
              </circle>\n\
              <image href=\"data:image/gif;base64,{}\" width=\"130\" height=\"130\" x=\"-65\" y=\"-65\"/>\n\
              <animateMotion\n\
                path=\"M 640,460 C 780,430 940,460 1060,390 C 1180,310 1190,170 1060,140 C 910,110 760,110 600,120 C 450,130 320,180 250,260 C 180,340 120,440 130,540 C 140,640 90,730 180,750 C 290,770 460,730 640,740 C 850,750 1100,740 1140,620 C 1170,510 990,520 850,490 C 750,470 680,480 640,460 Z\"\n\
                dur=\"32s\"\n\
                repeatCount=\"indefinite\"\n\
                rotate=\"auto\"\n\
              />\n\
            </g>\n",
            b64
        );

        if svg.contains("id=\"roaming-koi\"") {
            let re_koi = Regex::new(r"(?s)<!-- Living Roaming Activity Koi -->\s*<g id=\x22roaming-koi\x22>.*?</g>\n?").unwrap();
            svg = re_koi.replace_all(&svg, "").to_string();
        }
        svg = svg.replace("</svg>", &format!("{}</svg>", koi_block));
    }

    svg
}
