// Build the roaming koi.
//
//   fish mode (default): assets/koi-roam.svg, a transparent strip with only the koi in it. It
//     changes nothing about the rest of the README.
//   scene mode: assets/scene.svg, the header and activity card with the koi swimming under them.
//
// node scripts/build_koi_scene.mjs --snapshot S.json --sprite SPRITE.json --out assets/koi-roam.svg
// node scripts/build_koi_scene.mjs --mode scene --snapshot S.json --sprite SPRITE.json \
//   --header assets/header-venom.svg --card docs/profile_card.svg --out assets/scene.svg
//   [--seed N] [--speed X]
import fs from "node:fs";
import { buildFishStrip, buildScene } from "./koi_scene.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1]]] : acc), []),
);
const mode = args.mode || "fish";
const required = mode === "scene" ? ["snapshot", "sprite", "header", "card", "out"] : ["snapshot", "sprite", "out"];
for (const name of required) {
  if (!args[name]) {
    console.error(`build_koi_scene: missing --${name}`);
    process.exit(2);
  }
}
const snapshot = JSON.parse(fs.readFileSync(args.snapshot, "utf8"));
const sprite = JSON.parse(fs.readFileSync(args.sprite, "utf8"));
// A new random route every run: the seed mixes the account id with the clock.
const seed = args.seed ? Number(args.seed) >>> 0 : ((snapshot.account_id * 31 + Math.floor(Date.now() / 1000)) >>> 0);
const speed = Number(args.speed || 1);

let result;
if (mode === "scene") {
  result = buildScene({
    seed, speed, sprite,
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
console.log(`build_koi_scene (${mode}): seed ${seed}, ${(svg.length / 1024).toFixed(0)} KB, loop ${r.duration.toFixed(0)} s, ${Math.round(r.speed)} px/s -> ${args.out}`);
