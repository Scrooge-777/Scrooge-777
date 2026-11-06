# The activity card

**What it is.** The panel under the title: 3D bars, a contribution mix, top languages and a row
of totals. All of it is read from your GitHub account every time the picture is rebuilt. Nothing is
typed by hand, and if GitHub's answer looks wrong the update is cancelled.

## How days are counted

Days are counted in your own time zone (Asia/Kolkata). GitHub's own default is UTC, which would cut
an Indian evening off the end of the day.

## 3D bars (Last 12 weeks)

One bar for each day of the last 12 weeks. GitHub sorts every day into one of five levels
(none, then four quartiles of your busy days), and the bar's height follows the level.

| Level | Meaning | Bar height |
| --- | --- | --- |
| 0 | No contributions | 2.6 |
| 1 | A little | 5.2 |
| 2 | Some | 18.9 |
| 3 | A lot | 34.4 |
| 4 | Your busiest days | 63.9 |

Bars rise when the picture loads, bob gently, and lean away like grass when a fish swims past.
Hover a bar to read its date and count.

## Contribution mix

Five spokes. A spoke is longest when you do a lot of that kind of work.

| Spoke | What it counts |
| --- | --- |
| Commit | Commits in the last year, public ones plus your private work (GitHub reports private work as one number, so private pull requests and issues are included here) |
| Issue | Issues you opened |
| PullReq | Pull requests you opened |
| Review | Pull request reviews you did |
| Repo | Repositories you own, forks included |

How long a spoke is: nothing at all sits on the inner ring (20.8). Then every time a count
multiplies by about 2.7 (a factor of e), the spoke grows by 10. The outer ring is 126 and no spoke
goes past it. It is a gentle scale, so one huge number cannot swamp the others.

| Count | Spoke length |
| --- | --- |
| 0 | 20.8 |
| 1 | 27.7 |
| 3 | 34.7 |
| 7 | 41.6 |
| 20 | 51.2 |
| 100 | 67.0 |
| 500 | 83.0 |
| 5,000 | 106.0 |

## Top languages

The code in your own repositories (forks are left out), counted in bytes per language. The 4 biggest
are shown with their GitHub colours, everything else is added up as Others. The donut and the
list show each language's share.

## The row of totals

| Pill | What it is |
| --- | --- |
| contributions | Everything on your contribution calendar over the last 12 months |
| commits | Same number as the Commit spoke |
| pull requests | Pull requests you opened |
| repos | Repositories you own |
| stars | Stars on those repositories |
| forks | Times those repositories were forked |
| since (month) | Same contributions, labelled with the month of your first one |

From 10,000 upwards a number is shortened (12.3k, 2.5M). If the row would still be wider than the
card, the whole row shrinks to fit.

## Example

573 contributions, 561 commits, 6 pull requests, 7 repos: the Commit spoke reaches 84, PullReq about
40, Repo about 42, Issue and Review sit on the inner ring at 20.8.
