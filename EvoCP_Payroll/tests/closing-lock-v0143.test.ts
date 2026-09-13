import { describe, expect, it } from "vitest";
import { jakartaDateTimeInputToISO, toJakartaDateTimeInput } from "@/lib/date";

describe("Closing date + time v0.14.3", () => {
  it("converts Jakarta datetime-local to an exact ISO instant", () => {
    expect(jakartaDateTimeInputToISO("2026-09-11T20:30")).toBe("2026-09-11T13:30:00.000Z");
  });

  it("round-trips ISO back to Jakarta datetime-local", () => {
    expect(toJakartaDateTimeInput("2026-09-11T13:30:00.000Z")).toBe("2026-09-11T20:30");
  });
});
