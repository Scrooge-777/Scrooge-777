// Build assets/scene.svg: the profile header and activity card with the koi roaming
// freely under them. Run by .github/workflows/koi.yml every 5 hours.
//
// node scripts/build_koi_scene.mjs --snapshot S.json --sprite SPRITE.json \
//   --header assets/header-venom.svg --card docs/profile_card.svg --out assets/scene.svg \
//   [--seed N] [--fish N] [--speed X]
import fs from "node:fs";
import { buildScene } from "./koi_scene.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1]]] : acc), []),
);
for (const required of ["snapshot", "sprite", "header", "card", "out"]) {
  if (!args[required]) {
    console.error(`build_koi_scene: missing --${required}`);
    process.exit(2);
  }
}
const snapshot = JSON.parse(fs.readFileSync(args.snapshot, "utf8"));
const sprite = JSON.parse(fs.readFileSync(args.sprite, "utf8"));
// A new random route every run: the seed mixes the account id with the clock.
const seed = args.seed ? Number(args.seed) >>> 0 : ((snapshot.account_id * 31 + Math.floor(Date.now() / 1000)) >>> 0);
const { svg, meta } = buildScene({
  seed,
  fish: Number(args.fish || 1),
  speed: Number(args.speed || 1),
  sprite,
  headerSvg: fs.readFileSync(args.header, "utf8"),
  cardSvg: fs.readFileSync(args.card, "utf8"),
});
if (!svg.includes("<animateMotion") || svg.length < 20000) {
  console.error("build_koi_scene: generated scene looks wrong; refusing to write it");
  process.exit(1);
}
fs.writeFileSync(args.out, svg);
const r = meta.routes[0];
console.log(`build_koi_scene: seed ${seed}, ${(svg.length / 1024).toFixed(0)} KB, loop ${r.duration.toFixed(0)} s, ${Math.round(r.speed)} px/s -> ${args.out}`);
