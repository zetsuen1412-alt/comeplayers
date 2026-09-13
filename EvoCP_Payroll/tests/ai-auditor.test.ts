import { describe, expect, it } from "vitest";
import { auditClosing, auditMutations, auditPayroll, answerLocalBusinessQuestion } from "../src/lib/ai-auditor";
import { financeIssues, orders } from "../src/lib/demo-data";

describe("AI auditor lokal", () => {
  it("menampilkan masalah referensi X1465", () => {
    const rows = auditMutations(orders, financeIssues);
    expect(rows.some((x) => x.entity === "X1465" && x.exposureMinor === 576_000)).toBe(true);
  });

  it("menandai pekerjaan selesai yang belum masuk gaji", () => {
    const rows = auditPayroll(orders);
    expect(rows.some((x) => x.entity === "X1936" && x.area === "gaji")).toBe(true);
  });

  it("memblokir kesiapan tutup buku saat masih ada order belum selesai", () => {
    const rows = auditClosing(orders, financeIssues);
    expect(rows.some((x) => x.entity === "EGX3001")).toBe(true);
  });

  it("menjawab pertanyaan omzet dari data order", () => {
    const answer = answerLocalBusinessQuestion("Berapa omzet?", orders, financeIssues);
    expect(answer).toContain("Rp");
    expect(answer.toLowerCase()).toContain("total nilai order");
  });
});
