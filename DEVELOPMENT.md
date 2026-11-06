# How the profile picture is made

The README shows one animated picture, `assets/scene.svg`: a header, the GitHub activity card and
a family of koi that swim through all of it. A workflow rebuilds it from live data, so nothing in
it is typed by hand.

```
README.md                  the public profile page (shows assets/scene.svg)
assets/scene.svg           the generated picture (do not edit)
card/                      the activity card
  template.svg             the card design, with four placeholders
  profile.mjs              asks GitHub for the data and refuses bad data
  card.mjs                 draws the terrain, radar, languages and totals
  build.mjs                command line: data -> card
rules/                     the rulebook, in plain words (start with rules/README.md)
  rules.json               the numbers the code follows; edit here to change behaviour
scene/                     the header, the koi and the final picture
  header.svg               the title (edit the text here)
  family.mjs               which koi exist
  life.mjs                 how each koi lives: sleep, calm, active, hunger
  scene.mjs                routes, swimming, bars that sway, assembling the picture
  build.mjs                command line: card + data -> assets/scene.svg
  strip.py                 packs the koi frames into one image
koi/                       vendored git-koi engine (Rust); draws the koi sprite
test/                      unit tests: node --test test/*.test.mjs
.github/workflows/profile.yml   tests, then the pipeline, every 2 hours and at midnight IST
```

## Data flow

1. `card/build.mjs` asks GitHub for your contribution calendar, totals, repositories and languages
   (one request, days counted in `PROFILE_TZ`, default `Asia/Kolkata`) and checks it. Bad data stops
   the run; the card never falls back to old numbers.
2. It writes `build/card.svg` and `build/profile.json` (both git-ignored).
3. `git-koi` draws the koi at today's size (`TOTAL` = contributions in the last year).
4. `scene/build.mjs` plans the family from the daily counts, works out each fish's state for the
   current hour (sleep, calm, active), plans one route per fish and bakes everything into
   `assets/scene.svg`. The route changes every 5 hours (the seed is the number of
   5-hour periods since 1970); the data refreshes every run.
5. The workflow commits `assets/scene.svg` only if it changed.

## Rules

How the fish, the card and the colours behave is written in plain words in `rules/`, one sheet per
topic, with the numbers in `rules/rules.json`. Change a number there and the next run follows it.
`test/rules.test.mjs` fails if a sheet and the code say different things.

## Secrets

- `PROFILE_TOKEN` (optional but recommended): a personal access token that can read your profile,
  so private contributions are counted. Without it only public activity shows, and the workflow
  prints a warning.

## Run it yourself

```
node --test test/*.test.mjs                       # tests
GITHUB_TOKEN=... node card/build.mjs --login Scrooge-777 --out build/card.svg --profile-out build/profile.json
```
