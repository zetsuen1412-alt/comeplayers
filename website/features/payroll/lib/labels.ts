const statusLabels: Record<string, string> = {
  critical: "Penting", high: "Perlu Dicek", warning: "Perhatian", info: "Info",
  verified: "Selesai", reconciled: "Cocok", ready_to_close: "Siap Ditutup", paid: "Lunas", reviewed: "Sudah Dicek",
  open: "Belum Selesai", under_review: "Perlu Dicek", calculated: "Sudah Dihitung", pending: "Menunggu", in_progress: "Dikerjakan",
  assigned: "Siap Dikerjakan", completed: "Selesai", unpaid: "Belum Dibayar", partial: "Dibayar Sebagian", overpaid: "Kelebihan Bayar",
  partially_refunded: "Refund Sebagian", refunded: "Sudah Refund", available: "SHIFT", busy: "FULL", leave: "IJIN", offline: "IJIN", sick: "SAKIT",
  training: "NEW", on_hold: "Ditahan", cancelled: "Dibatalkan", draft: "Draf", confirmed: "Dikonfirmasi", assignment_pending: "Belum Ada Karyawan",
  partially_completed: "Selesai Sebagian", resolved: "Sudah Selesai", false_positive: "Bukan Masalah",
  NEW: "NEW", SHIFT: "SHIFT", FULL: "FULL", SAKIT: "SAKIT", IJIN: "IJIN", RESIGN: "RESIGN",
};

export function translateStatus(value: string): string {
  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export function translateWorkforceStatus(value: string): string {
  return translateStatus(value);
}
