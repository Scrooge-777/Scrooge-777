# Git and branches

**What it is.** How changes get into the repository without breaking the page visitors see.

## Branches

| Branch | What it is |
| --- | --- |
| `main` | What visitors see. Always working. Never force-pushed. |
| `feat/name`, `fix/name`, `refactor/name`, `docs/name`, `chore/name` | Where a change is made. Short, lower-case, words joined by dashes. |

## The way a change goes in

1. Make a branch from `main`.
2. Make the change and run the tests (`npm test`).
3. Push the branch and open a pull request. The Profile workflow runs the tests on it.
4. Merge only when the tests are green. Use a squash merge, so `main` gets one tidy commit, and delete the branch.

The picture itself is only ever built on `main`, never on a branch.

## Commit messages

Form: `type(scope): short summary`. Lower case, present tense, under 72 characters.

| Type | Use it for |
| --- | --- |
| feat | Something new |
| fix | Something that was wrong |
| refactor | Reorganising with no change in behaviour |
| docs | Words only, including the rules |
| test | Tests only |
| chore | Housekeeping |
| profile | Only the workflow uses this, for its automatic picture refresh |

Example: `fix(card): count days in the owner's time zone`.

## Who commits

Every commit is yours alone. No tool adds its own name to a commit or pull request. The workflow's
bot commits only `assets/scene.svg`, with the message `profile: refresh live card and koi`.

## Never

Never commit a secret. Never force-push `main`. Never edit a generated file by hand.

## Example

You want a fifth fish allowed: branch `feat/five-fish`, change `maxFish` in `rules/rules.json` and the
number in `koi-family.md`, run the tests, open the pull request, merge when green.
