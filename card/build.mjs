// Build the activity card from live GitHub data.
//
//   node card/build.mjs --login Scrooge-777 --out build/card.svg --profile-out build/profile.json
//   node card/build.mjs --from-json graphql-response.json ...      (offline: a saved response)
//
// The token comes from the environment (PROFILE_TOKEN, else GITHUB_TOKEN, else GH_TOKEN), never
// from an argument. Exits non-zero, writing nothing, if the data is missing or looks wrong.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchProfile, normalizeProfile } from "./profile.mjs";
import { renderCard } from "./card.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";

if (!args.out) {
  console.error("card: missing --out");
  process.exit(2);
}
const login = args.login || process.env.GITHUB_REPOSITORY_OWNER;
const timeZone = process.env.PROFILE_TZ || "Asia/Kolkata";

try {
  const profile = args["from-json"]
    ? normalizeProfile(JSON.parse(fs.readFileSync(args["from-json"], "utf8")), { login, timeZone })
    : await fetchProfile({ login, timeZone, token: process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN });
  const svg = renderCard(fs.readFileSync(args.template || path.join(here, "template.svg"), "utf8"), profile);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, svg);
  if (args["profile-out"]) {
    fs.mkdirSync(path.dirname(args["profile-out"]), { recursive: true });
    fs.writeFileSync(args["profile-out"], JSON.stringify(profile));
  }
  const t = profile.totals;
  console.log(`card: ${login} (${timeZone}) ${t.contributions} contributions, ${t.commits} commits, ${t.pullRequests} PRs, ${t.issues} issues, ${t.reviews} reviews, ${t.repos} repos, ${t.stars} stars, ${t.forks} forks; calendar ends ${profile.days.at(-1).date}; languages ${profile.languages.map((l) => l.name).join("/")} -> ${args.out}`);
} catch (err) {
  console.error(`card: ${err.message}`);
  process.exit(1);
}
