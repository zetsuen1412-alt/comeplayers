import type { FinanceIssue, Order, Severity } from "@/features/payroll/types/domain";
import { buildLivePayrollRows, type PayrollBuildOptions } from "@/features/payroll/lib/payroll-live";
import { getAssignedQuantity, getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { formatMoney } from "@/features/payroll/lib/money";

export type AiAuditArea = "mutasi" | "gaji" | "tutup_buku";

export type AiFinding = {
  id: string;
  area: AiAuditArea;
  severity: Severity;
  entity: string;
  title: string;
  explanation: string;
  suggestion: string;
  exposureMinor?: number;
  orderRef?: string;
};

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  warning: 2,
  info: 1,
};

export function sortFindings(rows: AiFinding[]) {
  return [...rows].sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.entity.localeCompare(b.entity));
}

function issueToFinding(issue: FinanceIssue, area: AiAuditArea): AiFinding {
  const suggestionByCode: Record<string, string> = {
    AMOUNT_SOURCE_MISMATCH: "Bandingkan nominal pesanan dengan mutasi sumber, lalu perbaiki data yang salah sebelum tutup buku.",
    IDENTITY_CONFLICT: "Pilih karyawan dari data karyawan resmi. Jangan gunakan nama ketik bebas untuk penggajian.",
    PAYMENT_UNMATCHED: "Pasangkan uang masuk ke pesanan yang benar sebelum periode ditutup.",
  };

  return {
    id: `${area}-${issue.id}`,
    area,
    severity: issue.severity,
    entity: issue.entity,
    title: issue.title,
    explanation: issue.description,
    suggestion: suggestionByCode[issue.code] ?? "Periksa data sumber dan selesaikan masalah ini sebelum tutup buku.",
    exposureMinor: issue.exposureMinor,
    orderRef: issue.entity.startsWith("X") || issue.entity.startsWith("EG") ? issue.entity : undefined,
  };
}

export function auditMutations(orders: Order[], financeIssues: FinanceIssue[]): AiFinding[] {
  const findings: AiFinding[] = financeIssues
    .filter((issue) => issue.status !== "resolved")
    .map((issue) => issueToFinding(issue, "mutasi"));

  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = order.externalReference.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);

    if (order.grossMinor <= 0) {
      findings.push({
        id: `mutasi-nominal-${order.id}`,
        area: "mutasi",
        severity: "critical",
        entity: order.externalReference,
        title: "Nilai pesanan tidak valid",
        explanation: `Nilai pesanan terbaca ${formatMoney(order.grossMinor)}.`,
        suggestion: "Periksa harga pesanan sebelum pekerjaan dilanjutkan.",
        orderRef: order.externalReference,
      });
    }

    if (order.matchedPaymentMinor > order.expectedPaymentMinor) {
      findings.push({
        id: `mutasi-overpaid-${order.id}`,
        area: "mutasi",
        severity: "critical",
        entity: order.externalReference,
        title: "Uang masuk lebih besar dari tagihan",
        explanation: `Tagihan ${formatMoney(order.expectedPaymentMinor)}, tetapi yang dipasangkan ${formatMoney(order.matchedPaymentMinor)}.`,
        suggestion: "Periksa mutasi uang dan pasangan pembayaran.",
        exposureMinor: order.matchedPaymentMinor - order.expectedPaymentMinor,
        orderRef: order.externalReference,
      });
    }

    const assignments = getOrderAssignments(order);
    const assignedQuantity = getAssignedQuantity(order);

    if (!assignments.length && !["draft", "cancelled"].includes(order.operationalStatus)) {
      findings.push({
        id: `mutasi-worker-${order.id}`,
        area: "mutasi",
        severity: "warning",
        entity: order.externalReference,
        title: "Karyawan belum dipilih",
        explanation: "Pesanan sudah aktif tetapi belum mempunyai karyawan/booster.",
        suggestion: "Pilih karyawan agar pekerjaan dan pembagian gaji dapat dilacak.",
        orderRef: order.externalReference,
      });
    }

    if (assignments.length && Math.abs(assignedQuantity - order.quantity) > 0.00000001) {
      const difference = assignedQuantity - order.quantity;
      findings.push({
        id: `mutasi-allocation-${order.id}`,
        area: "mutasi",
        severity: "critical",
        entity: order.externalReference,
        title: difference > 0 ? "Pembagian jumlah melebihi pesanan" : "Pembagian jumlah belum lengkap",
        explanation: `Jumlah pesanan ${order.quantity.toLocaleString("id-ID")}, tetapi total pembagian karyawan ${assignedQuantity.toLocaleString("id-ID")}.`,
        suggestion: "Atur jumlah setiap karyawan sampai totalnya sama persis dengan jumlah pesanan.",
        orderRef: order.externalReference,
      });
    }

    if (order.orderType === "gold" || order.orderType === "item") {
      const stocks = order.inventoryAllocations ?? [];
      const stockTotal = stocks.reduce((sum, row) => sum + row.quantity, 0);
      if (!stocks.length) {
        findings.push({
          id: `mutasi-stock-missing-${order.id}`,
          area: "mutasi",
          severity: "critical",
          entity: order.externalReference,
          title: "Pesanan Gold/Item belum punya stok Gudang",
          explanation: `Jenis pesanan ${order.orderType === "gold" ? "Gold" : "Item"} membutuhkan sumber stok dari Gudang.`,
          suggestion: "Pilih lokasi Gudang, karyawan pemegang stok, dan jumlah stok sebelum pesanan diproses.",
          orderRef: order.externalReference,
        });
      } else if (Math.abs(stockTotal - order.quantity) > 0.00000001) {
        findings.push({
          id: `mutasi-stock-quantity-${order.id}`,
          area: "mutasi",
          severity: "critical",
          entity: order.externalReference,
          title: stockTotal > order.quantity ? "Stok Gudang melebihi jumlah pesanan" : "Stok Gudang belum mencukupi jumlah pesanan",
          explanation: `Jumlah pesanan ${order.quantity.toLocaleString("id-ID")}, tetapi stok yang dialokasikan ${stockTotal.toLocaleString("id-ID")}.`,
          suggestion: "Atur pengambilan stok sampai totalnya sama persis dengan jumlah pesanan.",
          orderRef: order.externalReference,
        });
      }

      if (stocks.some((row) => row.stockType !== order.orderType || row.game.toUpperCase() !== order.game.toUpperCase())) {
        findings.push({
          id: `mutasi-stock-identity-${order.id}`,
          area: "mutasi",
          severity: "critical",
          entity: order.externalReference,
          title: "Jenis atau permainan stok tidak cocok",
          explanation: "Ada stok Gudang yang jenis Gold/Item atau gamenya berbeda dengan pesanan.",
          suggestion: "Gunakan stok dengan jenis dan permainan yang sama dengan pesanan.",
          orderRef: order.externalReference,
        });
      }
    }
  }

  for (const [ref, count] of counts) {
    if (count > 1) {
      const order = orders.find((x) => x.externalReference.toLowerCase() === ref);
      findings.push({
        id: `mutasi-duplicate-${ref}`,
        area: "mutasi",
        severity: "critical",
        entity: order?.externalReference ?? ref,
        title: "Kode pesanan terduplikasi",
        explanation: `Kode ini muncul ${count} kali di daftar pesanan.`,
        suggestion: "Gabungkan atau perbaiki kode pesanan agar tidak dihitung dua kali.",
        orderRef: order?.externalReference,
      });
    }
  }

  return sortFindings(findings);
}

export function auditPayroll(orders: Order[], payrollOptions: PayrollBuildOptions = {}): AiFinding[] {
  const findings: AiFinding[] = [];

  for (const order of orders) {
    if (order.operationalStatus === "completed") {
      findings.push({
        id: `gaji-unverified-${order.id}`,
        area: "gaji",
        severity: "warning",
        entity: order.externalReference,
        title: "Pekerjaan selesai tetapi belum masuk gaji",
        explanation: `${getOrderAssignments(order).map((row) => row.employeeName).join(", ") || "Karyawan"} sudah ditandai selesai, tetapi belum diverifikasi.`,
        suggestion: "Periksa hasil pekerjaan lalu tandai Pesanan ini selesai jika sudah benar.",
        exposureMinor: getOrderAssignments(order).reduce((sum, assignment) => { const pct = Math.max(0, Math.min(100, Number(payrollOptions.employeeSharePercent?.[assignment.employeeCode] ?? payrollOptions.defaultSharePercent ?? payrollOptions.sharePercent ?? 50))); return sum + Math.round(getAssignmentGrossMinor(order, assignment) * pct / 100); }, 0),
        orderRef: order.externalReference,
      });
    }

    if (order.operationalStatus === "verified" && !getOrderAssignments(order).length) {
      findings.push({
        id: `gaji-no-worker-${order.id}`,
        area: "gaji",
        severity: "critical",
        entity: order.externalReference,
        title: "Pesanan masuk gaji tanpa karyawan",
        explanation: "Pesanan sudah terverifikasi tetapi identitas penerima gaji kosong.",
        suggestion: "Jangan proses gaji sampai karyawan resmi dipilih.",
        orderRef: order.externalReference,
      });
    }
  }

  const payroll = buildLivePayrollRows(orders, payrollOptions);
  for (const row of payroll) {
    if (row.net < 0) {
      findings.push({
        id: `gaji-negative-${row.team}-${row.employee}`,
        area: "gaji",
        severity: "high",
        entity: row.employee,
        title: "Gaji bersih menjadi negatif",
        explanation: `Gaji bersih terbaca ${formatMoney(row.net)} setelah potongan.`,
        suggestion: "Periksa kasbon, hutang, dan potongan sebelum penggajian disetujui.",
        exposureMinor: Math.abs(row.net),
      });
    }
  }

  return sortFindings(findings);
}

export function auditClosing(orders: Order[], financeIssues: FinanceIssue[]): AiFinding[] {
  const findings: AiFinding[] = financeIssues
    .filter((issue) => issue.status !== "resolved" && issue.severity === "critical")
    .map((issue) => issueToFinding(issue, "tutup_buku"));

  for (const order of orders) {
    if (!["verified", "cancelled"].includes(order.operationalStatus)) {
      findings.push({
        id: `closing-unfinished-${order.id}`,
        area: "tutup_buku",
        severity: order.operationalStatus === "completed" ? "warning" : "high",
        entity: order.externalReference,
        title: "Pesanan belum siap ditutup",
        explanation: `Status pekerjaan masih ${order.operationalStatus.replaceAll("_", " ")}.`,
        suggestion: "Selesaikan atau batalkan pesanan dengan alasan yang jelas sebelum tutup buku.",
        orderRef: order.externalReference,
      });
    }

    if ((order.orderType === "gold" || order.orderType === "item") && !(order.inventoryAllocations?.length)) {
      findings.push({
        id: `closing-stock-${order.id}`,
        area: "tutup_buku",
        severity: "critical",
        entity: order.externalReference,
        title: "Pesanan Gold/Item tidak punya jejak stok",
        explanation: "Tutup buku tidak boleh mengabaikan sumber stok untuk pesanan Gold atau Item.",
        suggestion: "Lengkapi sumber Gudang atau buat penyesuaian resmi sebelum periode ditutup.",
        orderRef: order.externalReference,
      });
    }

    if (order.matchedPaymentMinor < order.expectedPaymentMinor && order.operationalStatus === "verified") {
      findings.push({
        id: `closing-unpaid-${order.id}`,
        area: "tutup_buku",
        severity: "warning",
        entity: order.externalReference,
        title: "Pesanan selesai tetapi uang belum lengkap",
        explanation: `Kurang ${formatMoney(order.expectedPaymentMinor - order.matchedPaymentMinor)} dari nilai yang diharapkan.`,
        suggestion: "Pastikan ini memang piutang yang sah atau pasangkan pembayaran yang belum tercatat.",
        exposureMinor: order.expectedPaymentMinor - order.matchedPaymentMinor,
        orderRef: order.externalReference,
      });
    }
  }

  return sortFindings(findings);
}

export function auditSummary(findings: AiFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((x) => x.severity === "critical").length,
    high: findings.filter((x) => x.severity === "high").length,
    warning: findings.filter((x) => x.severity === "warning").length,
    safe: findings.every((x) => x.severity !== "critical" && x.severity !== "high"),
  };
}

export function answerLocalBusinessQuestion(query: string, orders: Order[], financeIssues: FinanceIssue[], payrollOptions: PayrollBuildOptions = {}) {
  const q = query.trim().toLowerCase();
  const totalRevenue = orders.reduce((sum, x) => sum + x.grossMinor, 0);
  const received = orders.reduce((sum, x) => sum + x.matchedPaymentMinor, 0);
  const outstanding = orders.reduce((sum, x) => sum + Math.max(0, x.expectedPaymentMinor - x.matchedPaymentMinor), 0);
  const unfinished = orders.filter((x) => !["verified", "cancelled"].includes(x.operationalStatus));
  const payroll = buildLivePayrollRows(orders, payrollOptions);
  const payrollTotal = payroll.reduce((sum, x) => sum + x.earning, 0);
  const openIssues = financeIssues.filter((x) => x.status !== "resolved");
  const topWorker = [...payroll].sort((a, b) => b.earning - a.earning)[0];

  if (!q) return "Ketik pertanyaan, misalnya: “Ada masalah apa?”, “Berapa omzet?”, atau “Siapa pendapatan terbesar?”";
  if (q.includes("masalah") || q.includes("aneh") || q.includes("error")) {
    if (!openIssues.length) return "Tidak ada masalah data yang terbuka pada data contoh saat ini.";
    const sample = openIssues.slice(0, 3).map((x) => `${x.entity}: ${x.title}`).join("; ");
    return `Ada ${openIssues.length} masalah yang perlu diperiksa. Yang utama: ${sample}. Buka Cek Mutasi untuk melihat penjelasan dan saran.`;
  }
  if (q.includes("omzet") || q.includes("penjualan") || q.includes("total order")) {
    return `Total nilai pesanan yang sedang terbaca adalah ${formatMoney(totalRevenue)} dari ${orders.length} pesanan.`;
  }
  if (q.includes("uang masuk") || q.includes("cash") || q.includes("diterima")) {
    return `Uang yang sudah dipasangkan ke pesanan adalah ${formatMoney(received)}. Yang belum masuk atau belum dipasangkan adalah ${formatMoney(outstanding)}.`;
  }
  if (q.includes("belum selesai") || q.includes("masih dikerjakan")) {
    if (!unfinished.length) return "Semua pesanan sudah selesai atau dibatalkan.";
    return `Ada ${unfinished.length} pesanan yang belum siap ditutup: ${unfinished.slice(0, 6).map((x) => x.externalReference).join(", ")}.`;
  }
  if (q.includes("gaji") || q.includes("pendapatan karyawan") || q.includes("payroll")) {
    return `Total gaji sebelum potongan berdasarkan persentase Gaji saat ini adalah ${formatMoney(payrollTotal)} untuk ${payroll.length} karyawan.`;
  }
  if (q.includes("terbesar") || q.includes("tertinggi") || q.includes("top karyawan")) {
    return topWorker
      ? `${topWorker.employee} (${topWorker.team}) mempunyai pendapatan pesanan terverifikasi terbesar saat ini, yaitu ${formatMoney(topWorker.earning)}.`
      : "Belum ada pendapatan karyawan yang siap dihitung.";
  }
  if (q.includes("tutup buku") || q.includes("siap ditutup")) {
    const closing = auditClosing(orders, financeIssues);
    const summary = auditSummary(closing);
    return summary.safe
      ? "Pilih periode Tutup Buku manual. Pesanan bermasalah tidak akan masuk; hanya pesanan selesai yang akan diproses."
      : `Belum disarankan tutup buku. Ada ${summary.critical} masalah kritis dan ${summary.high} masalah tinggi yang perlu diselesaikan.`;
  }

  return "Saya belum memahami pertanyaan itu di mode demo. Coba tanyakan tentang omzet, uang masuk, masalah, pesanan belum selesai, gaji, karyawan terbesar, atau kesiapan tutup buku.";
}
