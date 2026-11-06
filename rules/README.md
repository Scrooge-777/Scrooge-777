# Rules

Everything on the profile picture follows a rule, and the rules are written here in plain words.
No code in these pages. To change how something behaves, change the number in `rules.json`
(the picture is rebuilt with it on the next run), and keep the sheet next to it in step.

| Sheet | What it decides |
| --- | --- |
| [koi-family.md](koi-family.md) | Which fish exist: milestones, streak babies, the limit of 5, growing up, fading when idle |
| [koi-life.md](koi-life.md) | How each fish lives: sleep, calm and active hours, hunger, where they rest, how often the route changes |
| [activity-card.md](activity-card.md) | The card: 3D bars, contribution mix, languages, the row of totals, how days are counted |
| [header-and-colours.md](header-and-colours.md) | The title and every colour on the picture |
| [refresh.md](refresh.md) | When the picture is rebuilt, what stops a bad update, what needs a secret |

A rule sheet always has the same shape: **what it is**, **the rule in a table**, **an example**.
`rules.json` holds the same numbers for the machine; a test fails if the two drift apart.
