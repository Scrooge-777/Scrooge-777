# When the picture is rebuilt

**What it is.** The picture on your profile is a single file, `assets/scene.svg`. A workflow on
GitHub rebuilds it. Nothing runs on your computer.

## When it runs

| When | Why |
| --- | --- |
| Every 2 hours | Fresh contributions, and the fish change state through the day |
| At midnight (Asia/Kolkata) | A clean start for the new day |
| When any code or rule changes | So a change shows up right away |
| By hand | The "Run workflow" button in the Actions tab |

## What it does, in order

1. Run the tests. If any fail, nothing else happens.
2. Ask GitHub for your numbers (one request, days counted in your time zone).
3. Check them. A bad answer, a missing user or a calendar that stops days ago cancels the update.
4. Draw the card, work out the fish family and each fish's state for the current hour.
5. Build the picture and save it only if it changed.

## When something goes wrong

The run is marked failed in the Actions tab (GitHub normally emails you about a failed scheduled run too)
and the last good picture stays on your profile. The card never falls back to old numbers.

## What it needs

| Secret | What for |
| --- | --- |
| PROFILE_TOKEN | Lets the workflow count your private contributions. Without it only public activity shows, and the run prints a warning. |

## What changes how often

| Thing | How often |
| --- | --- |
| Numbers on the card | Every run (2 hours) |
| Fish state (sleep, calm, active) | Every run (2 hours) |
| The fish routes | Every 5 hours |
| Who is in the family | Every run, from your daily counts |
