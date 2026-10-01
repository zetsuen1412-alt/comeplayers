/** Keep implementation errors out of onboarding while retaining recovery guards. */
export function setupFeedback(reason: unknown): { kind: "cancelled" | "error"; message: string; refresh: boolean } {
  const code = reason && typeof reason === "object" ? ("error" in reason ? reason.error : "code" in reason ? reason.code : "") : "";
  const message = reason instanceof Error ? reason.message : "";
  if (/^Sandi cadangan|^Gunakan sandi cadangan/.test(message)) return { kind: "error", message, refresh: false };
  if (/Automatic chat setup is not available/.test(message)) return { kind: "error", message: "Pembaruan chat sedang disiapkan. Coba lagi sebentar lagi.", refresh: true };
  if (code === "UserCancelled") return { kind: "cancelled", message: "Belum dilanjutkan. Chat Anda tetap aman; coba lagi saat siap.", refresh: false };
  if (code === "NoCredentials") return { kind: "error", message: "Kunci akses belum ditemukan. Gunakan akun pengelola sandi yang dipakai saat menyiapkan chat.", refresh: false };
  if (/changed|checkpoint|no longer|does not match|failed verification|moved backwards|missing without/i.test(message)) return { kind: "error", message: "Status akun berubah. Periksa kembali untuk melanjutkan dengan aman.", refresh: true };
  if (/network|fetch|connection|timeout|timed out/i.test(message)) return { kind: "error", message: "Koneksi terputus. Periksa internet, lalu coba lagi.", refresh: false };
  if (/support|synced passkey|enable sync|password manager/i.test(message)) return { kind: "error", message: "Perbarui pengelola sandi dan aktifkan sinkronisasi kunci akses, lalu coba lagi. Bantuan tersedia di bawah.", refresh: false };
  return { kind: "error", message: "Chat belum bisa dibuka. Coba lagi atau hubungi dukungan melalui penjelasan di bawah.", refresh: false };
}
