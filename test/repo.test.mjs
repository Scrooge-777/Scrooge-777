// The repository itself follows the rules in rules/repository.md, readme-and-projects.md,
// git-and-branches.md and security.md. These tests fail when the repository and a sheet disagree.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const sheet = (name) => read(`rules/${name}`);
const tracked = () => {
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return null; // not a git checkout
  }
};

test("every top-level folder has a row in repository.md, and every row is real", () => {
  const t = sheet("repository.md");
  const folders = [...new Set((tracked() || []).filter((f) => f.includes("/")).map((f) => f.split("/")[0]))];
  assert.ok(folders.length >= 6);
  for (const f of folders) assert.ok(t.includes(`\`${f}/\``), `repository.md has no row for ${f}/`);
  for (const [, dir] of t.matchAll(/^\| `([\w.-]+)\/` \|/gm)) {
    if (dir === "build") continue; // never saved in git
    assert.ok(fs.existsSync(new URL(`${dir}/`, root)), `${dir}/ is in the sheet but not in the repository`);
  }
});

test("the generated picture is the one the README shows", () => {
  const readme = read("README.md");
  assert.match(readme, /<img src="assets\/scene\.svg"/);
  assert.ok(fs.existsSync(new URL("assets/scene.svg", root)));
});

test("README: every project row follows the table rules", () => {
  const sheetText = sheet("readme-and-projects.md");
  const rows = read("README.md").split("\n").filter((l) => /^\| (\[|aeon|[\w-]+ \(private)/.test(l) && !l.startsWith("| Project"));
  assert.ok(rows.length >= 3, "found the project rows");
  const statuses = ["Active", "In progress", "Prototype", "Released"];
  for (const word of statuses) assert.ok(sheetText.includes(`| ${word} |`), `the sheet explains "${word}"`);
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 4, row);
    const [project, what, , status] = cells;
    assert.ok(what.length <= 200, `description too long: ${project}`);
    assert.ok(statuses.some((w) => status.replace(/^\[/, "").startsWith(w) || status.startsWith(w)), `status word for ${project}: ${status}`);
    if (project.includes("(private repo)")) assert.ok(!project.includes("]("), "a private repository has no link");
    else assert.match(project, /^\[[\w-]+\]\(https:\/\/github\.com\/[\w-]+\/[\w-]+\)$/, `link for ${project}`);
    if (status.startsWith("Released") || status.startsWith("[Released")) assert.match(status, /Released \(v\d+\.\d+\.\d+\)/);
  }
});

test("README only loads the two outside services the security sheet allows", () => {
  const readme = read("README.md");
  const hosts = new Set([...readme.matchAll(/src="https?:\/\/([^/"]+)/g)].map((m) => m[1]));
  const allowed = new Set(["skillicons.dev", "capsule-render.vercel.app"]);
  for (const h of hosts) assert.ok(allowed.has(h), `unexpected outside host in README: ${h}`);
  for (const h of allowed) assert.ok(sheet("security.md").includes(h), `security.md names ${h}`);
});

test("git-and-branches.md matches the workflow: a pull request runs the tests, only main builds", () => {
  const wf = read(".github/workflows/profile.yml");
  const t = sheet("git-and-branches.md");
  assert.match(wf, /pull_request:/);
  assert.match(wf, /if: github\.event_name != 'pull_request'/);
  assert.match(wf, /branches: \[main\]/);
  for (const type of ["feat", "fix", "refactor", "docs", "test", "chore", "profile"]) assert.ok(t.includes(`| ${type} |`), `commit type ${type}`);
  assert.ok(t.includes("`profile: refresh live card and koi`"));
  assert.ok(wf.includes('--message "profile: refresh live card and koi"'), "the bot uses the documented message");
  assert.ok(fs.existsSync(new URL(".github/pull_request_template.md", root)));
});

test("security.md matches the workflow and the repository", () => {
  const wf = read(".github/workflows/profile.yml");
  assert.match(wf, /^permissions:\n {2}contents: read/m, "read-only by default");
  assert.equal((wf.match(/contents: write/g) || []).length, 1, "exactly one job may write");
  assert.match(wf, /pillow==\d+\.\d+\.\d+/, "pinned python library");
  assert.ok(fs.existsSync(new URL("vendor/git-koi/LICENSE", root)), "vendored code keeps its licence");
  const ignore = read(".gitignore");
  for (const pattern of [".env", "*.pem", "build/"]) assert.ok(ignore.includes(pattern), `.gitignore has ${pattern}`);
});

test("no secret-looking text in any tracked file", () => {
  const files = tracked();
  if (!files) return;
  const patterns = [/ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /gho_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/];
  for (const f of files) {
    if (/\.(png|gif|jpg|ico|woff2?|lock)$/.test(f)) continue;
    const text = fs.readFileSync(new URL(f, root), "utf8");
    for (const p of patterns) assert.ok(!p.test(text), `${f} looks like it contains a secret (${p})`);
  }
});

test("the generated picture has no script, event handler, embedded page or outside link", () => {
  const svg = read("assets/scene.svg");
  assert.ok(!/<script/i.test(svg), "no <script>");
  assert.ok(!/\son[a-z]+\s*=/i.test(svg.replace(/<animate[\s\S]*?>/g, "")), "no on... handlers");
  assert.ok(!/javascript:/i.test(svg));
  assert.ok(!/<foreignObject/i.test(svg));
  const external = [...svg.matchAll(/(?:href|src)="(?!#|data:)([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(external, [], "nothing is loaded from outside the file");
});
