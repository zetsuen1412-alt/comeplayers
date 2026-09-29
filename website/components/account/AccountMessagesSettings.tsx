import Link from "next/link";

export default function AccountMessagesSettings() {
  return <section className="border-b border-white/10 p-6 md:p-8">
    <h2 className="text-xl font-black">Chat dan cadangan</h2>
    <p className="mt-2 max-w-3xl text-base leading-7 text-slate-300">Chat baru disiapkan otomatis setelah login. Perlindungan pesan berjalan di belakang layar.</p>
    <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">Untuk membuka akun chat yang sama di perangkat lain, buat sandi cadangan melalui Info percakapan → Cadangan chat. Ini pilihan tambahan; Anda tetap bisa mengobrol tanpa membuat cadangan. Akun lama memakai sandi cadangan atau kunci akses yang sebelumnya disimpan.</p>
    <Link href="/messages?inbox=1" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-cyan-300/15 px-5 font-bold text-cyan-200">Buka pesan pengguna</Link>
  </section>;
}
