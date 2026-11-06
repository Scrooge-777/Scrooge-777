# The README and the projects

**What it is.** The profile page. Four parts, always in this order.

## The page

| Order | Part | Source |
| --- | --- | --- |
| 1 | The picture: title, live activity card and the koi | `assets/scene.svg`, rebuilt by the workflow |
| 2 | Projects: a table of what you build | Written by hand |
| 3 | Core Arsenal: icons of the languages you use | skillicons.dev |
| 4 | A footer wave | capsule-render, changes colour on every refresh |

## The Projects table

Four columns, one row per project: **Project**, **What it is**, **Stack**, **Status**.

| Column | Rule |
| --- | --- |
| Project | The repository name as a link. A private repository is named with "(private repo)" and has no link. |
| What it is | One honest sentence, at most 200 characters. Say what it does, not how great it is. A prototype says so, and early measurements are called heuristics, not benchmarks. |
| Stack | The languages and tools it really uses, main one first |
| Status | One of the words below |

| Status word | When to use it |
| --- | --- |
| Active | Worked on regularly |
| In progress | Being built, not usable yet |
| Prototype | Works, but experimental |
| Released | Has a published release. Write the version and link to its latest release, for example `Released (v1.4.0)`. |

The order is by how much you work on it, most active first.

## Core Arsenal

Only languages and tools that really appear in your repositories (the language donut on the card
shows which). Add an icon when you start using something, remove it when you stop.

## Adding a project

1. Create a branch (see git-and-branches.md).
2. Add one row to the table, following the rules above.
3. Open a pull request; merge when the tests pass.

## Example

`| [tabroost](https://github.com/Scrooge-777/tabroost) | Edge-style workspaces for Brave and Chrome. | JavaScript, HTML, CSS | [Released (v1.4.0)](https://github.com/Scrooge-777/tabroost/releases/latest) |`
