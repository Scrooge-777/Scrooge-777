// How each koi lives through the day. Rules: rules/koi-life.md, numbers: rules/rules.json.
//
// A README picture cannot read the clock, so the state is worked out when the picture is built
// (every 2 hours) from the time in your time zone and from how recently you contributed.
import { RULES } from "../rules/index.mjs";

export const LIFE = RULES.life;
export const STATE_ORDER = ["sleep", "rest", "calm", "active"]; // from least to most energetic

// The hour of day (0-23) in a time zone.
export function hourIn(timeZone, now = new Date()) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

// Ranges are [from, to) and may wrap past midnight (from 23 to 6).
function inRange(hour, { from, to }) {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

// Young fish (still growing) keep a baby's hours: early nights and a nap after lunch.
export function scheduledState(hour, young, life = LIFE) {
  const slots = young ? life.schedule.young : life.schedule.adult;
  return (slots.find((slot) => inRange(hour, slot)) || { state: "active" }).state;
}

// A fish that has not been fed (no contributions) slows down; a sleeping fish just sleeps on.
export function hungerState(state, idleDays, life = LIFE) {
  if (state === "sleep") return state;
  const steps = idleDays >= life.hunger.slowestAfterDays ? 2 : idleDays >= life.hunger.slowerAfterDays ? 1 : 0;
  return STATE_ORDER[Math.max(1, STATE_ORDER.indexOf(state) - steps)]; // hungry fish rest, they do not sleep
}

export function planLife(fish, { now = new Date(), timeZone = "UTC", idleDays = 0, life = LIFE } = {}) {
  const clock = hourIn(timeZone, now);
  return fish.map((f, i) => {
    const young = f.growth < 1;
    const hour = (clock + life.stagger[i % life.stagger.length] + 24) % 24; // every fish keeps its own hours
    const state = hungerState(scheduledState(hour, young, life), idleDays, life);
    return { state, hour, young, ...life.states[state] };
  });
}
