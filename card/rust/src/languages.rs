use std::f64::consts::PI;

pub struct LanguageEntry {
    pub name: String,
    pub bytes: u64,
    pub color: String,
}

pub fn generate_languages_svg(languages: &[LanguageEntry]) -> String {
    let total_bytes: u64 = languages.iter().map(|l| l.bytes).sum();
    if total_bytes == 0 {
        return String::new();
    }

    let cx = 150.0;
    let cy = 663.0;
    let big_r = 90.0;
    let small_r = 52.0;
    let mut donut_paths = Vec::new();
    let mut cur_angle = -PI / 2.0;

    for lang in languages {
        let frac = lang.bytes as f64 / total_bytes as f64;
        let d_angle = frac * 2.0 * PI;
        let a1 = cur_angle;
        let a2 = cur_angle + d_angle;
        cur_angle = a2;

        let x_o1 = cx + big_r * a1.cos();
        let y_o1 = cy + big_r * a1.sin();
        let x_o2 = cx + big_r * a2.cos();
        let y_o2 = cy + big_r * a2.sin();

        let x_i1 = cx + small_r * a1.cos();
        let y_i1 = cy + small_r * a1.sin();
        let x_i2 = cx + small_r * a2.cos();
        let y_i2 = cy + small_r * a2.sin();

        let large = if d_angle > PI { 1 } else { 0 };
        let d = format!(
            "M{:.2},{:.2}A{:.0},{:.0},0,{},1,{:.2},{:.2}L{:.2},{:.2}A{:.0},{:.0},0,{},0,{:.2},{:.2}Z",
            x_o1, y_o1, big_r, big_r, large, x_o2, y_o2, x_i2, y_i2, small_r, small_r, large, x_i1, y_i1
        );
        let size_str = if lang.bytes > 1024 {
            format!("{:.1} KB", lang.bytes as f64 / 1024.0)
        } else {
            format!("{} B", lang.bytes)
        };

        donut_paths.push(format!(
            "<path d=\"{}\" class=\"donut-slice\" fill=\"{}\" stroke=\"none\">\
            <title>{} {}</title>\
            <animate attributeName=\"fill-opacity\" values=\"0;1\" dur=\"1.2s\" fill=\"freeze\"/>\
            </path>",
            d, lang.color, lang.name, size_str
        ));
    }

    let donut_xml = format!(
        "<g id=\"donut-hologram\" class=\"donut-dial\">\n{}\n</g>",
        donut_paths.join("\n")
    );

    let mut legend_rows = Vec::new();
    let y_start = 572;
    for (i, lang) in languages.iter().enumerate() {
        let pct = (lang.bytes as f64 / total_bytes as f64) * 100.0;
        let pct_str = if pct < 1.0 {
            format!("{:.1}%", pct)
        } else {
            format!("{}%", pct.round() as u64)
        };
        let bar_w = (132.0 * (lang.bytes as f64 / total_bytes as f64))
            .round()
            .max(2.0) as u32;
        let y_box = y_start + (i as i32) * 30;
        let y_text = y_box + 11;
        let y_bar = y_box + 17;

        legend_rows.push(format!(
            "<rect x=\"270\" y=\"{}\" width=\"13\" height=\"13\" rx=\"3\" fill=\"{}\"/>\n\
            <text x=\"292\" y=\"{}\" font-size=\"14\" class=\"fg\">{}</text>\n\
            <text x=\"424\" y=\"{}\" font-size=\"14\" font-weight=\"700\" text-anchor=\"end\" class=\"weak\">{}</text>\n\
            <rect x=\"292\" y=\"{}\" width=\"132\" height=\"3\" rx=\"1.5\" fill=\"#ffffff\" fill-opacity=\"0.08\"/>\n\
            <rect x=\"292\" y=\"{}\" width=\"{}\" height=\"3\" rx=\"1.5\" fill=\"{}\"/>",
            y_box, lang.color, y_text, lang.name, y_text, pct_str, y_bar, y_bar, bar_w, lang.color
        ));
    }

    format!(
        "Top languages</text>\n{}\n{}\n",
        donut_xml,
        legend_rows.join("\n")
    )
}
