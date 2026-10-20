import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeResetReimportRefresh } from "../../features/payroll/lib/reset-reimport-refresh";

test("reimport only previously reset new-book codes still present in the source",()=>{
  assert.deepEqual(
    mergeResetReimportRefresh(["OPEN-REFRESH"], ["X2754", "X3085", "DELETED-ORDER", "x2754", "", {}], ["x2754", "X3085", "OTHER"]),
    ["OPEN-REFRESH", "X2754", "X3085"]
  );
});
test("empty prior reset or missing source inventory never reimports anything",()=>{
  assert.deepEqual(mergeResetReimportRefresh([],["X2754"],[]),[]);
  assert.deepEqual(mergeResetReimportRefresh(["K1"],[],["K1"]),["K1"]);
});
