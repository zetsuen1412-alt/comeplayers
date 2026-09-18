export default function AccountMessagesSettings() {
  return <section className="border-b border-white/10 p-6 md:p-8">
    <h2 className="text-xl font-black">Messages terenkripsi di perangkat</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Direct message baru menggunakan end-to-end encryption. Riwayat yang sudah dibuka disimpan terenkripsi di perangkat pengguna, bukan sebagai plaintext di server ComePlayers.</p>
    <p className="mt-3 text-xs leading-5 text-slate-400">Untuk perangkat baru, login ke akun ComePlayers lalu konfirmasi passkey akun. Tidak ada recovery code. Backup Google Drive opsional menyimpan arsip terenkripsi dan dicocokkan dengan email akun.</p>
  </section>;
}
