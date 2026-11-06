mod languages;
mod radar;
mod svg;
mod terrain;

use std::fs;
use std::path::Path;
use std::time::Instant;

fn main() {
    let start_time = Instant::now();
    println!(">>> Card Generator [Rust Edition] - High Performance Engine");

    let args: Vec<String> = std::env::args().collect();
    let template_path = if args.len() > 1 {
        &args[1]
    } else {
        "docs/profile_card.svg"
    };

    let output_path = if args.len() > 2 {
        &args[2]
    } else {
        "docs/profile_card.svg"
    };

    if !Path::new(template_path).exists() {
        eprintln!("Template SVG not found at: {}", template_path);
        std::process::exit(1);
    }

    let svg_content = fs::read_to_string(template_path).expect("Failed to read template SVG");

    // Standard baseline metrics
    let c_cnt = 524;
    let m_cnt = 507;
    let p_cnt = 9;
    let r_cnt = 7;
    let s_cnt = 0;
    let f_cnt = 0;
    let at_val = Some((523, 33));

    // Top Languages
    let langs = vec![
        languages::LanguageEntry {
            name: "C#".to_string(),
            bytes: 1461 * 1024,
            color: "#178600".to_string(),
        },
        languages::LanguageEntry {
            name: "Rust".to_string(),
            bytes: 1037 * 1024,
            color: "#dea584".to_string(),
        },
        languages::LanguageEntry {
            name: "JavaScript".to_string(),
            bytes: 491 * 1024,
            color: "#f1e05a".to_string(),
        },
        languages::LanguageEntry {
            name: "Python".to_string(),
            bytes: 474 * 1024,
            color: "#3572A5".to_string(),
        },
        languages::LanguageEntry {
            name: "Others".to_string(),
            bytes: 273 * 1024,
            color: "#8b949e".to_string(),
        },
    ];

    let langs_xml = Some(languages::generate_languages_svg(&langs));

    let updated_svg = svg::update_svg_content(
        svg_content,
        None, // Keep current 3D terrain columns if no new GraphQL snapshot
        langs_xml,
        c_cnt,
        m_cnt,
        p_cnt,
        r_cnt,
        s_cnt,
        f_cnt,
        at_val,
    );

    fs::write(output_path, &updated_svg).expect("Failed to write output SVG");

    // Mirror to assets if docs was target
    if output_path == "docs/profile_card.svg" && Path::new("assets").exists() {
        let _ = fs::write("assets/profile_card.svg", &updated_svg);
    }

    let elapsed = start_time.elapsed();
    println!(">>> Successfully generated and validated: {}", output_path);
    println!(">>> Output Size: {} bytes", updated_svg.len());
    println!(">>> Render Latency: {:?}", elapsed);
}
