//! Render the in-place swimming cycle (`Behavior::Roam`) for chosen contribution totals.
//!
//! Usage: roam_sprites SNAPSHOT OUT_DIR BODY TOTAL [TOTAL...]
//! Writes OUT_DIR/roam_<TOTAL>_<frame>.png for every frame of the loop, plus
//! OUT_DIR/info.json with each total's growth fraction.
use std::{env, fs, path::Path};

use git_koi::behavior::Behavior;
use git_koi::coat::KoiBody;
use git_koi::history::AccountSnapshot;
use git_koi::koi::{calculate_growth_fraction, derive_koi_development};
use git_koi::motion::frame_count;
use git_koi::output::encode_png;
use git_koi::render::render_swim_frame;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() < 4 {
        eprintln!("usage: roam_sprites SNAPSHOT OUT_DIR BODY TOTAL...");
        std::process::exit(2);
    }
    let snapshot: AccountSnapshot =
        serde_json::from_str(&fs::read_to_string(&args[0]).expect("read snapshot")).expect("parse snapshot");
    let out_dir = Path::new(&args[1]);
    fs::create_dir_all(out_dir).expect("create out dir");
    let body = match args[2].as_str() {
        "black" => KoiBody::Black,
        "tea" => KoiBody::Tea,
        "gold" => KoiBody::Gold,
        "platinum" => KoiBody::Platinum,
        "asagi" => KoiBody::Asagi,
        _ => KoiBody::White,
    };
    let mut info = Vec::new();
    for total_text in &args[3..] {
        let total: u64 = total_text.parse().expect("total is a number");
        let mut development = derive_koi_development(&snapshot).expect("derive");
        development.total_contributions = total;
        for frame_index in 0..frame_count(Behavior::Roam) {
            let frame = render_swim_frame(&development, body, Behavior::Roam, frame_index);
            let png = encode_png(&frame).expect("encode");
            fs::write(out_dir.join(format!("roam_{total}_{frame_index}.png")), png).expect("write");
        }
        info.push(format!("\"{total}\": {:.4}", calculate_growth_fraction(total)));
    }
    fs::write(out_dir.join("info.json"), format!("{{{}}}\n", info.join(", "))).expect("write info");
}
