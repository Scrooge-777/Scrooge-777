// Build the roaming koi.
//
//   fish mode (default): assets/koi-roam.svg, a transparent strip with only the koi in it. It
//     changes nothing about the rest of the README.
//   scene mode: assets/scene.svg, the header and activity card with the koi swimming under them.
//   card mode: the koi swims inside the activity card itself (docs/profile_card.svg).
//     The route comes from a saved seed, so every rebuild of the card in the next five
//     hours keeps the same route; --renew picks a new one.
//
// node scripts/build_koi_scene.mjs --snapshot S.json --sprite SPRITE.json --out assets/koi-roam.svg
// node scripts/build_koi_scene.mjs --mode card --sprite assets/koi-sprite.json --state assets/koi-state.json //   --card assets/profile_card.svg --out docs/profile_card.svg [--renew]
// node scripts/build_koi_scene.mjs --mode scene --snapshot S.json --sprite SPRITE.json \
//   --header assets/header-venom.svg --card docs/profile_card.svg --out assets/scene.svg
//   [--seed N] [--speed X]
import fs from "node:fs";
import { buildCardWithKoi, buildFishStrip, buildScene } from "./koi_scene.mjs";
import { planFamily } from "./koi_family.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1]]] : acc), []),
);
const mode = args.mode || "fish";
const required = mode === "scene" ? ["snapshot", "sprite", "header", "card", "out"] : mode === "card" ? ["sprite", "card", "out"] : ["snapshot", "sprite", "out"];
for (const name of required) {
  if (!args[name]) {
    console.error(`build_koi_scene: missing --${name}`);
    process.exit(2);
  }
}
const snapshot = args.snapshot ? JSON.parse(fs.readFileSync(args.snapshot, "utf8")) : { account_id: 0 };
const sprite = JSON.parse(fs.readFileSync(args.sprite, "utf8"));
const freshSeed = () => ((snapshot.account_id * 31 + Math.floor(Date.now() / 1000)) >>> 0);
let seed, kept = false;
if (args.seed) {
  seed = Number(args.seed) >>> 0;
} else if (mode === "card" && args.state && !("renew" in args) && fs.existsSync(args.state)) {
  seed = Number(JSON.parse(fs.readFileSync(args.state, "utf8")).seed) >>> 0; // keep today's route
  kept = true;
} else {
  seed = freshSeed(); // a new random route
}
if (mode === "card" && args.state && !kept) fs.writeFileSync(args.state, JSON.stringify({ seed, built: new Date().toISOString() }) + String.fromCharCode(10));
const speed = Number(args.speed || 1);

const family = planFamily(snapshot.contribution_history?.days ?? [], new Date());
let result;
if (mode === "card") {
  result = buildCardWithKoi({ seed, speed, sprite, cardSvg: fs.readFileSync(args.card, "utf8") });
} else if (mode === "scene") {
  result = buildScene({
    seed, speed, sprite, family: family.fish,
    headerSvg: fs.readFileSync(args.header, "utf8"),
    cardSvg: fs.readFileSync(args.card, "utf8"),
  });
} else {
  result = buildFishStrip({ seed, speed, sprite });
}
const { svg, meta } = result;
if (!svg.includes("<animateMotion") || svg.length < 5000) {
  console.error("build_koi_scene: generated file looks wrong; refusing to write it");
  process.exit(1);
}
fs.writeFileSync(args.out, svg);
const r = meta.routes ? meta.routes[0] : meta;
if (mode === "scene") console.log(`family: ${family.fish.map((f) => f.kind + (f.reason && f.kind !== "parent" ? " (" + f.reason + ", " + Math.round(f.age) + "d)" : "")).join(", ")}; idle ${family.idle}d, faded ${family.faded}, retired ${family.retired}`);
console.log(`build_koi_scene (${mode}): seed ${seed}, ${(svg.length / 1024).toFixed(0)} KB, loop ${r.duration.toFixed(0)} s, ${Math.round(r.speed)} px/s -> ${args.out}`);
