import { adminLabel } from "@/lib/adminLocale";
const statusLabels: Record<string, string> = {
  critical: "Penting", high: "Perlu Dicek", warning: "Perhatian", info: "Info",
  verified: "Selesai", reconciled: "Cocok", ready_to_close: "Siap Ditutup", paid: "Lunas", reviewed: "Sudah Dicek",
  open: "Belum Selesai", under_review: "Perlu Dicek", calculated: "Sudah Dihitung", pending: "Menunggu", in_progress: "Dikerjakan",
  assigned: "Siap Dikerjakan", completed: "Selesai", unpaid: "Belum Dibayar", partial: "Dibayar Sebagian", overpaid: "Kelebihan Bayar",
  partially_refunded: "Pengembalian Dana Sebagian", refunded: "Sudah Pengembalian Dana", available: "Tersedia", busy: "Sibuk", leave: "Izin", offline: "Luring", sick: "Sakit",
  training: "Baru", on_hold: "Ditahan", cancelled: "Dibatalkan", draft: "Draf", confirmed: "Dikonfirmasi", assignment_pending: "Belum Ada Karyawan",
  partially_completed: "Selesai Sebagian", resolved: "Sudah Selesai", false_positive: "Bukan Masalah",
  NEW: "Baru", SHIFT: "Bekerja sif", FULL: "Penuh", SAKIT: "Sakit", IJIN: "Izin", RESIGN: "Mengundurkan diri",
};

export function translateStatus(value: string): string {
  return statusLabels[value] ?? adminLabel(value);
}

export function translateWorkforceStatus(value: string): string {
  return translateStatus(value);
}
