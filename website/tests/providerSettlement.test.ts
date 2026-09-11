import assert from "node:assert/strict";
import test from "node:test";
import { compareProviderSettlement, dedupeSettlementChecks } from "@/lib/providerSettlement";

test("provider gross, fee, and net reconcile", () => {
  const result = compareProviderSettlement({
    captureId: "CAP-1",
    localGross: 10,
    providerGross: "10.00",
    providerFee: "0.50",
    providerNet: "9.50",
  });
  assert.equal(result.status, "matched");
  assert.deepEqual(result.mismatches, []);
});

test("gross discrepancy and invalid net formula are reported", () => {
  const result = compareProviderSettlement({
    captureId: "CAP-2",
    localGross: 10,
    providerGross: 11,
    providerFee: 1,
    providerNet: 11,
  });
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.mismatches.sort(), ["gross_amount", "provider_net_formula"]);
});


test("settlement evidence keeps only the latest check per capture", () => {
  const rows = dedupeSettlementChecks([
    { capture_id: "CAP-1", checked_at: "2026-06-01T01:00:00.000Z", marker: "old" },
    { capture_id: "CAP-2", checked_at: "2026-06-01T02:00:00.000Z", marker: "only" },
    { capture_id: "CAP-1", checked_at: "2026-06-01T03:00:00.000Z", marker: "new" },
    { capture_id: "", checked_at: "2026-06-01T04:00:00.000Z", marker: "invalid" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.capture_id === "CAP-1")?.marker, "new");
});
