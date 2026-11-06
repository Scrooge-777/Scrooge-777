# The koi family

**What it is.** The fish swimming through the picture. How many there are, and how big, comes
from your contributions over the last year.

## The rules

| Rule | Value |
| --- | --- |
| The parent | Always there. Its size follows your total contributions. |
| A new fish for reaching | 500, 1,000, 2,500, 5,000 and 10,000 contributions |
| A baby for every | 7 full days in a row with at least one contribution (7, 14, 21 ... days) |
| Most fish at once | 1 for now: only the parent swims (the oldest baby retires first and the parent never does, so raising this number brings the family back) |
| A baby starts at | 55% of full size |
| A baby is full size after | 30 days |
| Fades when idle | After 14 days with no contribution the newest fish fades away; after 28 the next one; the parent stays |

A new fish fades in over a couple of seconds when it is under 2 days old.

## Example

**Today** only the parent swims, because the limit is 1. The rules for milestone fish and streak babies are all still
there; they start working when the limit goes up (for example to 5 in `rules/rules.json`). A copy of the
code with 5 fish switched on is kept on the branch `backup/five-koi`.

With the limit at 5: you reach 1,000 contributions today: a milestone fish is born at 55% size and reaches full size
30 days later. Next week you commit 7 days in a row: a streak baby joins. That makes 3 fish. If you
then stop for 14 days, the newest of them fades; at 28 days a second one goes; the parent keeps
swimming.
