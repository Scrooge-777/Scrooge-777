// The numbers behind the rules in this folder. Edit rules.json; the code reads it at start-up,
// and the sheets next to it (koi-family.md, koi-life.md, ...) describe the same numbers in words.
import fs from "node:fs";

export const RULES = JSON.parse(fs.readFileSync(new URL("./rules.json", import.meta.url), "utf8"));
