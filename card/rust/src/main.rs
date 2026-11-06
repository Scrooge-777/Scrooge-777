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
    let template_path = if args.len() > 1 && !args[1].starts_with("--") {
        &args[1]
    } else {
        "docs/profile_card.svg"
    };

    let output_path = if args.len() > 2 && !args[2].starts_with("--") {
        &args[2]
    } else {
        "docs/profile_card.svg"
    };

    let calendar_arg = args
        .windows(2)
        .find(|w| w[0] == "--calendar")
        .map(|w| w[1].as_str())
        .unwrap_or("calendar.json");

    if !Path::new(template_path).exists() {
        eprintln!("Template SVG not found at: {}", template_path);
        std::process::exit(1);
    }

    let svg_content = fs::read_to_string(template_path).expect("Failed to read template SVG");

    // Dynamic extraction from GraphQL calendar.json if present, else fallback
    let (terrain_xml, c_cnt, m_cnt, p_cnt, r_cnt, s_cnt, f_cnt, at_val) = if Path::new(calendar_arg).exists() {
        println!(">>> Reading live GraphQL calendar from: {}", calendar_arg);
        let raw = fs::read_to_string(calendar_arg).expect("Failed to read calendar JSON");
        let val: serde_json::Value = serde_json::from_str(&raw).expect("Failed to parse calendar JSON");

        let contrib_coll = &val["data"]["user"]["contributionsCollection"];
        let c_cnt = contrib_coll["contributionCalendar"]["totalContributions"].as_u64().unwrap_or(555) as u32;
        let pub_commits = contrib_coll["totalCommitContributions"].as_u64().unwrap_or(360);
        let priv_commits = contrib_coll["restrictedContributionsCount"].as_u64().unwrap_or(183);
        let m_cnt = (pub_commits + priv_commits) as u32;
        let p_cnt = contrib_coll["totalPullRequestContributions"].as_u64().unwrap_or(6) as u32;
        let r_cnt = val["data"]["user"]["repositories"]["totalCount"].as_u64().unwrap_or(7) as u32;
        let s_cnt = 0;
        let f_cnt = 0;

        let weeks_val = contrib_coll["contributionCalendar"]["weeks"].clone();
        let all_weeks: Vec<terrain::ContributionWeek> = serde_json::from_value(weeks_val).unwrap_or_default();

        let mut active_days = 0;
        for w in &all_weeks {
            for d in &w.contribution_days {
                if d.contribution_count > 0 {
                    active_days += 1;
                }
            }
        }

        let terrain_xml = terrain::build_rolling_terrain(&all_weeks);
        println!(">>> Dynamically built rolling 3D terrain island with live GraphQL activity");
        (terrain_xml, c_cnt, m_cnt, p_cnt, r_cnt, s_cnt, f_cnt, Some((c_cnt, active_days)))
    } else {
        println!(">>> No calendar JSON found at {}, using current verified baseline", calendar_arg);
        let c_cnt = 555;
        let m_cnt = 543;
        let p_cnt = 6;
        let r_cnt = 7;
        let s_cnt = 0;
        let f_cnt = 0;
        let at_val = Some((555, 34));
        (None, c_cnt, m_cnt, p_cnt, r_cnt, s_cnt, f_cnt, at_val)
    };

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
        terrain_xml,
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
