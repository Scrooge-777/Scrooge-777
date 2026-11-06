# Rules

Everything in this repository follows a rule, and the rules are written here in plain words.
No code in these pages. To change how something behaves, change the number in `rules.json`
(the picture is rebuilt with it on the next run), and keep the sheet next to it in step.

## The picture

| Sheet | What it decides |
| --- | --- |
| [koi-family.md](koi-family.md) | Which fish exist: milestones, streak babies, the limit of 5, growing up, fading when idle |
| [koi-life.md](koi-life.md) | How each fish lives: sleep, calm and active hours, hunger, where they rest, how often the route changes |
| [activity-card.md](activity-card.md) | The card: 3D bars, contribution mix, languages, the row of totals, how days are counted |
| [header-and-colours.md](header-and-colours.md) | The title and every colour on the picture |

## The repository

| Sheet | What it decides |
| --- | --- |
| [repository.md](repository.md) | Which folder holds what, and what you may edit by hand |
| [readme-and-projects.md](readme-and-projects.md) | The profile page and the rules for the Projects table |
| [git-and-branches.md](git-and-branches.md) | Branches, pull requests and commit messages |
| [refresh.md](refresh.md) | When the picture is rebuilt and what stops a bad update |
| [security.md](security.md) | Secrets, permissions and what the picture may contain |

A rule sheet always has the same shape: **what it is**, **the rule in a table**, **an example**.
`rules.json` holds the numbers for the machine; the tests in `test/` fail if a sheet and the code
drift apart, so the rulebook cannot quietly go out of date.
