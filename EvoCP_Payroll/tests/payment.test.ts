import { describe, expect, it } from "vitest";
import { derivePaymentStatus } from "../src/lib/finance";

describe("payment status", () => {
  it("supports partial and full payment", () => {
    expect(derivePaymentStatus({ expectedMinor: 1_000_000, matchedMinor: 400_000 })).toBe("partial");
    expect(derivePaymentStatus({ expectedMinor: 1_000_000, matchedMinor: 1_000_000 })).toBe("paid");
  });
  it("detects overpayment", () => {
    expect(derivePaymentStatus({ expectedMinor: 640_000, matchedMinor: 700_000 })).toBe("overpaid");
  });
});
