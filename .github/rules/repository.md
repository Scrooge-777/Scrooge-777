# The repository

**What it is.** Where everything lives, and which parts you edit by hand and which are made by a
machine.

## The rules

| Folder or file | What it holds | Edit by hand? |
| --- | --- | --- |
| `README.md` | The profile page visitors see (see readme-and-projects.md) | Yes |
| `assets/` | The generated picture, `scene.svg` | No, the workflow rebuilds it |
| `.github/` | The workflow that rebuilds the picture, generator engine, rules, tests, and koi vendor | Yes |
| `build/` | Temporary files while a run is going. Never saved in git. | No |

## Rules

1. One picture (`assets/scene.svg`), made by one workflow (`.github/workflows/profile.yml`).
2. A generated file is never edited by hand. Change the rule or the code and let the workflow rebuild it.
3. Code in `vendor/` is never edited. If it must change, replace the whole folder and keep its licence.
4. Every new top-level folder needs a row in the table above (a test checks this).
5. Every part of the picture has a sheet in `rules/`. A new part brings a new sheet.

## How the parts connect

```
GitHub data -> src/card -> card.svg -+
                                     +-> src/scene -> assets/scene.svg -> README.md
vendor/git-koi -> koi sprite --------+          ^
                                                |
rules/rules.json -------------------------------+  (every number comes from here)
```

## Example

You want a different title: edit the word in `src/scene/header.svg` on a branch, open a pull
request, wait for the tests, merge. The workflow then rebuilds `assets/scene.svg` and the README
shows it. You never touch `assets/`.
