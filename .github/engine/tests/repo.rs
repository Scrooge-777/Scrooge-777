//! The repository itself follows the rules in `repository.md`, `readme-and-projects.md`,
//! `git-and-branches.md` and `security.md`. These tests fail when the repository and a sheet disagree.
mod common;

use std::{collections::BTreeSet, fs};

use common::*;
use regex::Regex;

#[test]
fn every_top_level_folder_has_a_row_in_repository_md_and_every_row_is_real() {
    let t = sheet("repository.md");
    let folders: BTreeSet<String> = match tracked() {
        Some(files) => files.iter().filter(|f| f.contains('/')).map(|f| f.split('/').next().unwrap_or("").to_string()).collect(),
        None => fs::read_dir(root())
            .expect("root")
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n != ".git" && n != "build" && n != "target")
            .collect(),
    };
    assert!(folders.len() >= 2);
    for f in &folders {
        assert!(t.contains(&format!("`{f}/`")), "repository.md has no row for {f}/");
    }
    for c in Regex::new(r"(?m)^\| `([\w.-]+)/` \|").expect("regex").captures_iter(&t) {
        if &c[1] == "build" {
            continue; // never saved in git
        }
        assert!(root().join(&c[1]).is_dir(), "{}/ is in the sheet but not in the repository", &c[1]);
    }
}

#[test]
fn the_generated_picture_is_the_one_the_readme_shows() {
    assert!(read("README.md").contains("<img src=\"assets/scene.svg\""));
    assert!(root().join("assets/scene.svg").exists());
}

#[test]
fn readme_every_project_row_follows_the_table_rules() {
    let sheet_text = sheet("readme-and-projects.md");
    let row_start = Regex::new(r"^\| (\[|aeon|[\w-]+ \(private)").expect("regex");
    let link = Regex::new(r"^\[[\w-]+\]\(https://github\.com/[\w-]+/[\w-]+\)$").expect("regex");
    let released = Regex::new(r"Released \(v\d+\.\d+\.\d+\)").expect("regex");
    let readme = read("README.md");
    let rows: Vec<&str> = readme.lines().filter(|l| row_start.is_match(l) && !l.starts_with("| Project")).collect();
    assert!(rows.len() >= 3, "found the project rows");
    let statuses = ["Active", "In progress", "Prototype", "Released"];
    for word in statuses {
        assert!(sheet_text.contains(&format!("| {word} |")), "the sheet explains \"{word}\"");
    }
    for row in rows {
        let cells: Vec<&str> = row.split('|').skip(1).collect::<Vec<_>>();
        let cells: Vec<&str> = cells[..cells.len() - 1].iter().map(|c| c.trim()).collect();
        assert_eq!(cells.len(), 4, "{row}");
        let (project, what, status) = (cells[0], cells[1], cells[3]);
        assert!(what.chars().count() <= 200, "description too long: {project}");
        assert!(statuses.iter().any(|w| status.trim_start_matches('[').starts_with(w)), "status word for {project}: {status}");
        if project.contains("(private repo)") {
            assert!(!project.contains("]("), "a private repository has no link");
        } else {
            assert!(link.is_match(project), "link for {project}");
        }
        if status.starts_with("Released") || status.starts_with("[Released") {
            assert!(released.is_match(status), "{status}");
        }
    }
}

#[test]
fn readme_only_loads_the_two_outside_services_the_security_sheet_allows() {
    let readme = read("README.md");
    let allowed = ["skillicons.dev", "capsule-render.vercel.app"];
    for c in Regex::new(r#"src="https?://([^/"]+)"#).expect("regex").captures_iter(&readme) {
        assert!(allowed.contains(&&c[1]), "unexpected outside host in README: {}", &c[1]);
    }
    for h in allowed {
        assert!(sheet("security.md").contains(h), "security.md names {h}");
    }
}

#[test]
fn git_and_branches_md_matches_the_workflow_a_pull_request_runs_the_tests_only_main_builds() {
    let wf = read(".github/workflows/profile.yml");
    let t = sheet("git-and-branches.md");
    assert!(wf.contains("pull_request:"));
    assert!(wf.contains("if: github.event_name != 'pull_request'"));
    assert!(wf.contains("branches: [main]"));
    for ty in ["feat", "fix", "refactor", "docs", "test", "chore", "profile"] {
        assert!(t.contains(&format!("| {ty} |")), "commit type {ty}");
    }
    assert!(t.contains("`profile: refresh live card and koi`"));
    assert!(wf.contains("--message \"profile: refresh live card and koi\""), "the bot uses the documented message");
    assert!(root().join(".github/pull_request_template.md").exists());
}

#[test]
fn security_md_matches_the_workflow_and_the_repository() {
    let wf = read(".github/workflows/profile.yml");
    assert!(Regex::new(r"(?m)^permissions:\n {2}contents: read").expect("regex").is_match(&wf), "read-only by default");
    assert_eq!(wf.matches("contents: write").count(), 1, "exactly one job may write");
    assert!(root().join(".github/vendor/git-koi/LICENSE").exists(), "vendored code keeps its licence");
    // every Rust dependency is fixed by a committed lock file
    for lock in [".github/engine/Cargo.lock", ".github/vendor/git-koi/Cargo.lock"] {
        assert!(root().join(lock).exists(), "{lock} pins the dependencies");
    }
    let ignore = read(".gitignore");
    for pattern in [".env", "*.pem", "build/"] {
        assert!(ignore.contains(pattern), ".gitignore has {pattern}");
    }
}

#[test]
fn no_secret_looking_text_in_any_tracked_file() {
    let Some(files) = tracked() else { return };
    let patterns = [r"ghp_[A-Za-z0-9]{30,}", r"github_pat_[A-Za-z0-9_]{30,}", r"gho_[A-Za-z0-9]{30,}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"AKIA[0-9A-Z]{16}"];
    let patterns: Vec<Regex> = patterns.iter().map(|p| Regex::new(p).expect("regex")).collect();
    let skip = Regex::new(r"\.(png|gif|jpg|ico|woff2?|lock)$").expect("regex");
    for f in files {
        if skip.is_match(&f) {
            continue;
        }
        let Ok(bytes) = fs::read(root().join(&f)) else { continue };
        let text = String::from_utf8_lossy(&bytes);
        for p in &patterns {
            assert!(!p.is_match(&text), "{f} looks like it contains a secret ({p})");
        }
    }
}

#[test]
fn the_generated_picture_has_no_script_event_handler_embedded_page_or_outside_link() {
    let svg = read("assets/scene.svg");
    assert!(!Regex::new(r"(?i)<script").expect("regex").is_match(&svg), "no <script>");
    let animate = Regex::new(r"(?s)<animate.*?>").expect("regex");
    assert!(!Regex::new(r"(?i)\son[a-z]+\s*=").expect("regex").is_match(&animate.replace_all(&svg, "")), "no on... handlers");
    assert!(!Regex::new(r"(?i)javascript:").expect("regex").is_match(&svg));
    assert!(!Regex::new(r"(?i)<foreignObject").expect("regex").is_match(&svg));
    let external: Vec<String> = Regex::new(r#"(?:href|src)="([^"]+)""#)
        .expect("regex")
        .captures_iter(&svg)
        .map(|c| c[1].to_string())
        .filter(|u| !u.starts_with('#') && !u.starts_with("data:"))
        .collect();
    assert!(external.is_empty(), "nothing is loaded from outside the file: {external:?}");
}
