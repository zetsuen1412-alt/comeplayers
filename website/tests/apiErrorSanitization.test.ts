import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  getErrorMessage,
  getExplicitErrorStatus,
  safeApiErrorMessage,
} from "../lib/apiErrors";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("API errors hide internal server and database details", () => {
  assert.equal(
    safeApiErrorMessage(
      new Error('relation "private_wallets" does not exist'),
      "Unable to load wallet.",
      500,
    ),
    "Unable to load wallet.",
  );
  assert.equal(
    safeApiErrorMessage(
      new Error('invalid input syntax for type uuid: "bad"'),
      "Invalid request.",
      400,
    ),
    "Invalid request.",
  );
});

test("API errors preserve explicit client-safe messages", () => {
  const error = Object.assign(new Error("Attachment not found."), { status: 404 });

  assert.equal(getErrorMessage(error), "Attachment not found.");
  assert.equal(getExplicitErrorStatus(error), 404);
  assert.equal(
    safeApiErrorMessage(error, "Unable to load attachment.", 404),
    "Attachment not found.",
  );
});

test("catalog and PayPal routes do not return raw provider details", () => {
  const files = [
    "app/api/game-categories/route.ts",
    "app/api/games/route.ts",
    "app/api/products/by-game/route.ts",
    "app/api/marketplace/search/route.ts",
    "app/api/paypal/create-order/route.ts",
    "app/api/paypal/capture-order/route.ts",
    "app/api/paypal/create-checkout-order/route.ts",
  ];

  for (const file of files) {
    const source = read(file);
    assert.equal(/NextResponse\.json\([\s\S]{0,180}details:\s*(?:data|capturedData)/.test(source), false, file);
  }
});
