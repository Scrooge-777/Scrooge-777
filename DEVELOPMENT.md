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
scene/                     the header, the koi and the final picture
  header.svg               the title (edit the text here)
  family.mjs               which koi exist (milestones, streak babies, 5 at most, fade when idle)
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
4. `scene/build.mjs` plans the family from the daily counts, plans one route per fish and bakes
   everything into `assets/scene.svg`. The route changes every 5 hours (the seed is the number of
   5-hour periods since 1970); the data refreshes every run.
5. The workflow commits `assets/scene.svg` only if it changed.

## Rules for the koi

- The parent always swims; its size follows total contributions.
- A new fish at 500, 1,000, 2,500, 5,000 and 10,000 contributions.
- A baby for every full 7 days of daily contributions in a row.
- At most 5 fish at once; the oldest baby retires first.
- A baby starts at 55% size and is full size after 30 days.
- After 14 days with no contributions the newest fish fades; another every further 14 days.

Change them in `scene/family.mjs` (`FAMILY`).

## Secrets

- `PROFILE_TOKEN` (optional but recommended): a personal access token that can read your profile,
  so private contributions are counted. Without it only public activity shows, and the workflow
  prints a warning.

## Run it yourself

```
node --test test/*.test.mjs                       # tests
GITHUB_TOKEN=... node card/build.mjs --login Scrooge-777 --out build/card.svg --profile-out build/profile.json
```
