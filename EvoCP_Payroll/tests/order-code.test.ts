import { describe, expect, it } from "vitest";
import { nextAutomaticOrderCode, orderCodeToIndex, orderIndexToCode } from "@/lib/order-code";

describe("automatic ComePlayers order code", () => {
  it("starts at EG1", () => {
    expect(nextAutomaticOrderCode([])).toBe("EG1");
  });

  it("continues EG1 through EG9999", () => {
    expect(nextAutomaticOrderCode(["EG1", "EG2", "EG9998"])).toBe("EG9999");
  });

  it("continues from EG9999 to EGA0001", () => {
    expect(nextAutomaticOrderCode(["EG9999"])).toBe("EGA0001");
  });

  it("does not let an old reserved code jump the new sequence", () => {
    expect(nextAutomaticOrderCode([], ["EGX3001"])).toBe("EG1");
  });

  it("continues letter blocks", () => {
    expect(orderCodeToIndex("EGA9999")).toBe(19_998);
    expect(orderIndexToCode(19_999)).toBe("EGB0001");
    expect(orderCodeToIndex("EGZ9999")).toBe(269_973);
  });
});
