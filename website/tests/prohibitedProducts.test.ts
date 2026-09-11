import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductPolicy } from "@/lib/prohibitedProducts";

test("ordinary digital currency listing is allowed", () => {
  const result = evaluateProductPolicy({
    title: "Example Game 1,000 Coins",
    description: "Fast manual delivery from the seller inventory after checkout.",
    category: "Game Coins",
  });
  assert.equal(result.decision, "allow");
});

test("stolen or hacked account claims are blocked", () => {
  const result = evaluateProductPolicy({
    title: "Hacked account cheap",
    description: "Compromised account with instant credentials.",
  });
  assert.equal(result.decision, "block");
  assert.equal(result.severity, "critical");
  assert.ok(result.matchedRules.includes("stolen_or_hacked_property"));
});

test("boosting service is queued for review", () => {
  const result = evaluateProductPolicy({
    title: "Rank boost service",
    description: "Piloted boosting from bronze to diamond within one week.",
  });
  assert.equal(result.decision, "review");
  assert.ok(result.reasons.length > 0);
});
