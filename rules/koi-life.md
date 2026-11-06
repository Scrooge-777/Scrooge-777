# How the koi live

**What it is.** Each fish lives a day like a real one: it sleeps at night, potters about in the
morning and evening, and is lively in daytime. It also slows down if you have not fed it, which
means contributed.

## The four states

| State | Speed (of full) | Tail beat | Look |
| --- | --- | --- | --- |
| Active | 100% | normal | Swims the whole scene with quick darts |
| Calm | 60% | 1.6 times slower | Gentle cruising, no darts |
| Rest | 35% | 2.5 times slower | Very slow glide, no darts |
| Sleep | a drift of 6 px a second | 6 times slower | Dimmed to 70%, drifts in a small oval among the bars at the bottom of the 3D landscape. The bars do not move for a sleeper. |

## The day (time in your time zone, Asia/Kolkata)

Adult fish (the parent, and any fish that has grown up):

| From | To | State |
| --- | --- | --- |
| 23:00 | 06:00 | Sleep |
| 06:00 | 09:00 | Calm |
| 09:00 | 18:00 | Active |
| 18:00 | 23:00 | Calm |

Young fish (babies and new fish that are still growing) keep earlier nights and nap after lunch:

| From | To | State |
| --- | --- | --- |
| 21:00 | 07:00 | Sleep |
| 07:00 | 09:00 | Calm |
| 09:00 | 13:00 | Active |
| 13:00 | 15:00 | Sleep (nap) |
| 15:00 | 18:00 | Active |
| 18:00 | 21:00 | Calm |

Each fish keeps its own hours: the parent follows the clock, the others are shifted by
+1, -1, +2 and -2 hours, so they do not all wake or sleep at the same moment.

## Hunger

| Days since your last contribution | Effect |
| --- | --- |
| 0 to 2 | None |
| 3 to 6 | One step slower (active becomes calm, calm becomes rest) |
| 7 or more | Two steps slower (everything awake becomes rest) |

A hungry fish rests rather than sleeps, and a sleeping fish keeps sleeping. After 14 days
idle the family rules take over and the newest fish fades (see koi-family.md).

## The route

Every awake fish follows its own smooth random route through the whole picture, over and under
everything. A new random route is chosen every 5 hours. The cruising pace is about 150 px a second.

## Good to know

The picture cannot read a clock while you look at it, so the state is chosen when the picture is
rebuilt (every 2 hours). A fish can be up to 2 hours behind real time.

## Example

At 03:00 your time with a contribution yesterday: every fish is asleep, dimmed, drifting among the
bars. At 11:00 they are all active. At 11:00 after a week without contributions: all rest.
