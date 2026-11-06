# Working on this repository

The README shows one animated picture, `assets/scene.svg`: a title, the GitHub activity card and a
family of koi swimming through it. A workflow rebuilds it from live data, so nothing in it is typed
by hand. How everything behaves is written in plain words in [`rules/`](../rules/README.md); this page
is only the map and the commands.

## The map

```
.github/
  workflows/profile.yml     tests, then the whole pipeline (every 2 hours, midnight IST, on a push to main)
  pull_request_template.md  the checklist for a pull request
assets/
  scene.svg                 the generated picture (never edited by hand)
docs/
  development.md           this page
rules/                      the rulebook, in plain words (start with rules/README.md)
  rules.json                the numbers the code follows
src/
  card/                     the activity card
    template.svg            the card design, with four placeholders
    profile.mjs             asks GitHub for the data and refuses bad data
    card.mjs                draws the 3D bars, radar, languages and totals
    build.mjs               command line: data -> card
  scene/                    the title, the koi and the final picture
    header.svg              the title (edit the text here)
    family.mjs              which koi exist
    life.mjs                how each koi lives: sleep, calm, active, hunger
    scene.mjs               routes, swimming, swaying bars, assembling the picture
    build.mjs               command line: card + data -> assets/scene.svg
    strip.py                packs the koi frames into one image
test/                       tests (node --test); some check the rules against the code
vendor/git-koi/             the koi engine (Rust), kept as received, with its licence
README.md                   the profile page
package.json                `npm test`
```

## Data flow

1. `src/card/build.mjs` asks GitHub for your contribution calendar, totals, repositories and
   languages (one request, days counted in `PROFILE_TZ`, default `Asia/Kolkata`) and checks it. Bad
   data stops the run; the card never falls back to old numbers.
2. It writes `build/card.svg` and `build/profile.json` (git-ignored).
3. `git-koi` draws the koi at today's size.
4. `src/scene/build.mjs` plans the family from the daily counts, works out each fish's state for the
   current hour, plans a route per fish and bakes everything into `assets/scene.svg`.
5. The workflow commits `assets/scene.svg` only if it changed.

## Commands

```
npm test                                         # all tests
GITHUB_TOKEN=... npm run card -- --login Scrooge-777    # draw the card from live data into build/
node src/scene/build.mjs --profile build/profile.json --card build/card.svg \
     --sprite build/sprite.json --header src/scene/header.svg --out build/scene.svg --now 2026-11-07T21:30:00Z
```

`--now` lets you see the picture at another time of day (for example the fish asleep at night).

## Making a change

Follow [git-and-branches.md](../rules/git-and-branches.md): a branch, a pull request, tests green,
squash merge. A change to behaviour changes `rules/rules.json` and the matching sheet in the same
pull request; the tests fail if they disagree.

## Secrets

`PROFILE_TOKEN` (optional but recommended) lets the workflow count private contributions. See
[security.md](../rules/security.md).
