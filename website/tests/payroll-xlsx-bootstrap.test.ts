import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The data itself is deliberately not committed to this repository.
// Smoke-check the code's strict source constraints so future maintainers
// cannot silently broaden the one-time import window.
test("initial Excel batch scope stays fixed to X2754..X4688", () => {
  const body = readFileSync(new URL("../../features/payroll/lib/xlsx-bootstrap.ts", import.meta.url), "utf8");
  assert.match(body, /ROW_START = 5848/);
  assert.match(body, /ROW_END = 7536/);
  assert.match(body, /source\.rows\[0\]\?\.display\?\.\[1\] !== "X2754"/);
  assert.match(body, /source\.rows\.at\(-1\)\?\.display\?\.\[1\] !== "X4688"/);
  assert.match(body, /source\.rows\.slice\(cursor, cursor \+ BATCH_SIZE\)/);
  assert.equal(createHash("sha256").update("sheet").digest("hex").length, 64);
});
