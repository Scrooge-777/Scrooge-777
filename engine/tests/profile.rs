mod common;

use common::*;
use nyx::profile::{fetch, gh_args, normalize};
use serde_json::json;

#[test]
fn a_good_answer_becomes_a_profile_with_every_number() {
    let p = profile(&every_third);
    assert_eq!(p.days.len(), 371);
    assert_eq!(p.totals.contributions, p.days.iter().map(|d| d.count).sum::<u64>());
    assert_eq!(p.totals.commits, 130, "commits = public commits + private (restricted) contributions");
    assert_eq!((p.totals.pull_requests, p.totals.issues, p.totals.reviews, p.totals.repos), (6, 2, 1, 4));
    assert_eq!((p.totals.stars, p.totals.forks), (12, 10));
}

#[test]
fn languages_forks_are_ignored_the_top_four_stay_and_the_rest_become_others() {
    let p = profile(&every_third);
    let names: Vec<&str> = p.languages.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, ["Rust", "C#", "Shell", "Python", "Others"]);
    assert_eq!(p.languages.last().expect("others").bytes, 60 + 40 + 20);
    assert!(p.languages.iter().all(|l| l.color.len() == 7 && l.color.starts_with('#')), "a missing colour gets a default");
}

#[test]
fn it_refuses_bad_data_instead_of_falling_back_to_old_numbers() {
    let now = now();
    let broken = |edit: &dyn Fn(&mut serde_json::Value)| {
        let mut g = graphql("2026-11-07", 371, &every_third);
        edit(&mut g["data"]["user"]);
        g
    };
    let cases: Vec<(serde_json::Value, &str)> = vec![
        (json!({ "errors": [{ "message": "Bad credentials" }] }), "errors"),
        (json!({ "data": { "user": null } }), "no such user"),
        (broken(&|u| u["contributionsCollection"]["contributionCalendar"]["weeks"] = json!([])), "empty"),
        (graphql("2026-10-01", 371, &every_third), "not near today"),
        (graphql("2026-11-07", 20, &every_third), "only 20 days"),
        (broken(&|u| u["contributionsCollection"]["contributionCalendar"]["totalContributions"] = json!(99999)), "add up"),
        (broken(&|u| { u["contributionsCollection"].as_object_mut().expect("object").remove("totalCommitContributions"); }), "totalCommitContributions"),
        (broken(&|u| u["repositories"] = json!(null)), "repository list"),
    ];
    for (answer, why) in cases {
        let err = normalize(&answer, "me", now, "Asia/Kolkata").expect_err(why);
        assert!(err.starts_with("profile: ") && err.contains(why), "{why}: got {err}");
    }
}

#[test]
fn the_request_asks_for_the_calendar_in_the_chosen_time_zone() {
    let args = gh_args("me", "Asia/Kolkata");
    let at = args.iter().position(|a| a == "-H").expect("a header");
    assert_eq!(args[at + 1], "Time-Zone: Asia/Kolkata");
    assert!(args.iter().any(|a| a == "login=me"));
    assert!(args.iter().any(|a| a.starts_with("query=") && a.contains("contributionCalendar")));
}

#[test]
fn without_a_token_nothing_is_asked() {
    for token in [None, Some("")] {
        let err = fetch("me", token, "Asia/Kolkata", now()).expect_err("no token");
        assert!(err.contains("no GitHub token"), "{err}");
    }
    assert!(fetch("", Some("t"), "Asia/Kolkata", now()).expect_err("no login").contains("no login"));
}
