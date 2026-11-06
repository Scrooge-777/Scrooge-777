// Build the README picture: the header and the activity card with the koi family swimming
// through them.
//
//   node src/scene/build.mjs --profile build/profile.json --card build/card.svg \
//        --sprite build/sprite.json --header src/scene/header.svg --out assets/scene.svg [--seed N] [--now 2026-11-07T21:30:00Z]
//
// The route changes every 5 hours: the seed is the profile login plus the number of 5-hour
// periods since 1970, so runs inside one period reproduce the same picture and only a new
// period (or new contribution data) changes the file.
import fs from "node:fs";
import { buildScene, routeSeed } from "./scene.mjs";
import { planFamily } from "./family.mjs";
import { planLife } from "./life.mjs";

function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  for (const name of ["profile", "card", "sprite", "header", "out"]) {
    if (!args[name]) {
      console.error(`scene: missing --${name}`);
      process.exit(2);
    }
  }
  const now = args.now ? new Date(args.now) : new Date(); // --now is for previews and tests
  const profile = JSON.parse(fs.readFileSync(args.profile, "utf8"));
  const sprite = JSON.parse(fs.readFileSync(args.sprite, "utf8"));
  const family = planFamily(profile.days, now);
  const lives = planLife(family.fish, { now, timeZone: profile.timeZone, idleDays: family.idle });
  const crew = family.fish.map((fish, i) => ({ ...fish, life: lives[i] }));
  const seed = args.seed ? Number(args.seed) >>> 0 : routeSeed(profile.login, now);

  const { svg, meta } = buildScene({
    seed,
    sprite,
    family: crew,
    headerSvg: fs.readFileSync(args.header, "utf8"),
    cardSvg: fs.readFileSync(args.card, "utf8"),
  });
  if (!svg.includes("<animateMotion") || svg.length < 5000) {
    console.error("scene: the generated picture looks wrong; refusing to write it");
    process.exit(1);
  }
  fs.writeFileSync(args.out, svg);
  const r = meta.routes[0];
  const kinds = crew.map((f) => `${f.kind === "parent" ? "parent" : `${f.kind} (${f.reason}, ${Math.round(f.age)}d)`} ${f.life.state}`).join(", ");
  console.log(`scene: seed ${seed}, ${(svg.length / 1024).toFixed(0)} KB, loop ${r.duration.toFixed(0)} s, ${Math.round(r.speed)} px/s`);
  console.log(`scene: hour ${lives[0].hour} in ${profile.timeZone}; ${crew.length} koi: ${kinds}; idle ${family.idle}d, faded ${family.faded}, retired ${family.retired} -> ${args.out}`);
}

main();
