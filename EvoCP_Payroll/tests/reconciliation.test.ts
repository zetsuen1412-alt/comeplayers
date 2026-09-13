import { describe, expect, it } from "vitest";
import { reconcileAmount, resolveLegacyIdentity } from "../src/lib/reconciliation";

describe("legacy regressions", () => {
  it("blocks X1465 amount mismatch", () => {
    const issue = reconcileAmount({ id: "x", entity: "X1465", expectedMinor: 640_000, observedMinor: 64_000 });
    expect(issue?.code).toBe("AMOUNT_SOURCE_MISMATCH");
    expect(issue?.exposureMinor).toBe(576_000);
    expect(issue?.severity).toBe("critical");
  });

  it("does not treat AZIS2 as an identity without explicit mapping", () => {
    expect(resolveLegacyIdentity("AZIS2", { aziz: "EMP-0037" })).toEqual({ status: "conflict" });
    expect(resolveLegacyIdentity("AZIS2", { azis2: "EMP-0037" })).toEqual({ status: "resolved", employeeCode: "EMP-0037" });
  });
});
