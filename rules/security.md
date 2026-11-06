# Security

**What it is.** What keeps the repository, your token and your visitors safe.

## The rules

| Area | Rule |
| --- | --- |
| Secrets | Never in code or commits. The only one in use is `PROFILE_TOKEN`, stored in the repository's secrets. A secret never appears in a log or a file. |
| The token | Read-only and for your own profile only. It can read, not write. |
| Workflow permissions | Read-only by default. Only the build job may write, and it writes only `assets/scene.svg`. |
| Pinned versions | Python libraries have an exact version (`pillow==12.2.0`). Third-party code has a fixed copy in `vendor/` with its licence. |
| The picture | A generated picture must contain no script, no event handler (`onload=`), no `javascript:` link, no embedded page and no link to the outside. A test checks this. |
| Outside services | The README uses only two: skillicons.dev (icons) and capsule-render.vercel.app (footer). Nothing else is loaded from the outside. |
| Bad data | If GitHub's answer looks wrong the update is cancelled and the last good picture stays (see refresh.md). |

## If a secret leaks

1. Revoke the token on GitHub straight away.
2. Make a new one and replace `PROFILE_TOKEN`.
3. Look through the workflow runs for anything that used it.

## Example

A new language icon would come from skillicons.dev, which is already allowed. A new service for a
badge would first need its own row in this table.
