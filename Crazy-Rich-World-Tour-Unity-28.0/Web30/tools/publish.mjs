import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..", "..");
const project = path.join(root, "Crazy-Rich-World-Tour-Web-30.0");
const check = process.argv.includes("--check");

const mappings = [
  ["client", "website/public/games/crazy-rich-world-tour/client"],
  ["pwa/sw.js", "website/public/games/crazy-rich-world-tour/sw.js"],
  ["pwa/manifest.webmanifest", "website/public/crazy-rich-world-tour/manifest.webmanifest"],
  ["pwa/install.js", "website/public/crazy-rich-world-tour/install.js"],
  ["integration/CrazyRichGameShell.tsx", "website/app/games/crazy-rich-world-tour/CrazyRichGameShell.tsx"],
  ["integration/page.tsx", "website/app/games/crazy-rich-world-tour/page.tsx"],
];

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function relativeSet(base) {
  return new Map(filesUnder(base).map(file => [path.relative(base, file).replaceAll("\\","/"), file]));
}

function compareTree(src, dst) {
  const a = relativeSet(src);
  const b = relativeSet(dst);
  const names = new Set([...a.keys(), ...b.keys()]);
  const problems = [];
  for (const name of names) {
    if (!a.has(name)) problems.push("extra publish file: " + name);
    else if (!b.has(name)) problems.push("missing publish file: " + name);
    else if (hash(a.get(name)) !== hash(b.get(name))) problems.push("different: " + name);
  }
  return problems;
}

function syncTree(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

const problems = [];
for (const [from, to] of mappings) {
  const src = path.join(project, from);
  const dst = path.join(root, to);
  if (!fs.existsSync(src)) {
    problems.push("missing project source: " + from);
    continue;
  }
  const stat = fs.statSync(src);
  if (check) {
    if (stat.isDirectory()) problems.push(...compareTree(src, dst).map(p => from + " -> " + p));
    else if (!fs.existsSync(dst)) problems.push("missing publish target: " + to);
    else if (hash(src) !== hash(dst)) problems.push("different: " + from + " -> " + to);
  } else {
    if (stat.isDirectory()) syncTree(src, dst);
    else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
}

if (check && problems.length) {
  console.error("[CRWT Web 30] publish mirror is out of sync:");
  for (const problem of problems) console.error(" - " + problem);
  process.exit(1);
}

console.log(check
  ? "[CRWT Web 30] project source and website publish mirror are synchronized."
  : "[CRWT Web 30] published project source into website/");
