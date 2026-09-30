import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const websiteRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(websiteRoot, file), "utf8");

test("Empires & Allies is available from an isolated lightweight launcher", () => {
  const page = read("app/play/empires-allies/page.tsx");
  const launcher = read("app/play/empires-allies/EmpiresAlliesLauncher.tsx");

  assert.match(page, /EmpiresAlliesLauncher/);
  assert.match(launcher, /\/api\/games\/empires-allies\/ticket/);
  assert.match(launcher, /window\.location\.assign\(result\.launchUrl\)/);
  assert.match(launcher, /redirectPath="\/play\/empires-allies"/);
  assert.doesNotMatch(launcher, /iframe|EmpiresAlliesGame|\/social/);
});

test("community stays free of the Empires & Allies launcher", () => {
  const community = read("app/messages/page.tsx");
  assert.doesNotMatch(community, /empires-allies|EmpiresAlliesLauncher/);
});
