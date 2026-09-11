import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const websiteRoot = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(websiteRoot, path), "utf8");
}

test("floating Alexia chat uses an Alexia profile photo and multilingual guidance", () => {
  const pet = source("app/components/AlexiaPet.tsx");

  assert.match(pet, /ALEXIA_AVATAR = "\/arcade\/monopoly\/alexia-avatar\.webp"/);
  assert.match(pet, /Online · Multilingual support/);
  assert.match(pet, /Online · Dukungan multibahasa/);
  assert.match(pet, /Ask me anything about ComePlayers in your preferred language/);
  assert.match(pet, /Tanyakan apa saja tentang ComePlayers dalam bahasa pilihan Anda/);
  assert.match(pet, /Suggested questions/);
  assert.match(pet, /Pertanyaan yang disarankan/);
});

test("floating Alexia chat recommends core ComePlayers website questions", () => {
  const pet = source("app/components/AlexiaPet.tsx");

  for (const recommendation of [
    "Buyer protection",
    "Payments",
    "Buy or sell",
    "Community",
    "Tournaments",
  ]) {
    assert.match(pet, new RegExp(`label: "${recommendation}"`));
  }

  for (const recommendation of [
    "Perlindungan pembeli",
    "Pembayaran",
    "Beli atau jual",
    "Komunitas",
    "Turnamen",
  ]) {
    assert.match(pet, new RegExp(`label: "${recommendation}"`));
  }
});
