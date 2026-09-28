/** Use the app domain for Auth so carrier DNS failures for Supabase do not block sign-in. */
export function authTransport(supabaseUrl: string, apiUrl: string, transport: typeof fetch): typeof fetch {
  const authOrigin = new URL(supabaseUrl).origin;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== authOrigin || !url.pathname.startsWith("/auth/v1/")) return transport(input, init);
    const relay = new URL(`/api/auth/mobile/${url.pathname.slice("/auth/v1/".length)}${url.search}`, apiUrl);
    if (relay.protocol !== "https:") throw new Error("Secure sign-in connection required.");
    // The Supabase SDK supplies a URL plus init; retain Request bodies too for callers using Request.
    return transport(typeof input === "object" && !(input instanceof URL) ? new Request(relay, input) : relay.toString(), init);
  };
}

export function authenticationMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "";
  if (/UnknownHostException|Unable to resolve host|Network request failed|fetch failed|Failed to fetch|NetworkError|timed? ?out/i.test(message)) {
    return "Belum tersambung ke ComePlayers. Periksa internet, lalu coba lagi.";
  }
  if (/invalid login credentials|invalid credentials/i.test(message)) return "Email atau sandi belum cocok. Periksa kembali atau pilih Lupa sandi.";
  if (/email not confirmed/i.test(message)) return "Buka email pendaftaran dan konfirmasi akun Anda terlebih dahulu.";
  if (/rate limit|too many requests|too many attempts/i.test(message)) return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  if (/DEVELOPER_ERROR|sign.in.*config|configuration|id.?token/i.test(message)) return "Google belum bisa digunakan di versi ini. Perbarui dari Google Play atau pilih Gunakan email.";
  if (/password.*(weak|short|characters)|weak.*password/i.test(message)) return "Gunakan sandi yang lebih kuat, minimal 12 karakter.";
  return "Belum berhasil masuk. Coba lagi sebentar, atau gunakan cara masuk lainnya.";
}
