import Link from "next/link";
import { PageHeader } from "@/features/payroll/components/page-header";

const steps = [
  ["1", "Karyawan", "Tambah karyawan, pilih FH, lalu atur status NEW / SHIFT / FULL / SAKIT / IJIN / RESIGN. Persentase gaji tiap karyawan diatur nanti di menu Gaji.", "/admin/payroll/employees"],
  ["2", "Produk / Permainan", "Daftarkan permainan, Wilayah, dan Server. Saat membuat Pesanan, permainan hanya bisa dipilih dari daftar ini.", "/admin/payroll/products"],
  ["3", "Stok / Gudang", "Khusus Gold dan Item. Identitas gudang cukup nama karyawan, tanpa Lokasi Gudang. Gunakan filter Jenis, Permainan, dan Karyawan untuk mengecek stok. Stok Keluar otomatis saat pesanan selesai dan menampilkan jumlah + tarif per tanggal. Ekspor Stok Keluar Gold juga menghitung TOTAL PENGHASILAN = Gold × Tarif.", "/admin/payroll/inventory"],
  ["4", "Pesanan", "Menu Pesanan sekarang langsung membuka form Tambah Pesanan. Untuk Boosting, satu pesanan boleh dikerjakan beberapa karyawan dan harga otomatis dibagi rata. Untuk Gold/Item, jumlah pekerja dan stok harus cocok.", "/admin/payroll/orders"],
  ["5", "Penjualan", "Lihat total penjualan sesuai filter tanggal, Sumber, Jenis, Pembeli, Permainan, atau kode pesanan. Ekspor Excel menampilkan ringkasan per sumber di bagian atas dan seluruh tabel Penjualan hasil filter di bawahnya.", "/admin/payroll/sales"],
  ["6", "Mutasi", "Semua sumber ada di satu Mutasi. Filter berdasarkan Periode, Sumber, Jenis, Pembeli, Permainan, kode pesanan, dan urutan. Ekspor Excel menampilkan ringkasan serta tabel Mutasi hasil filter. Mutasi tetap bisa diedit walaupun pesanan sudah selesai.", "/admin/payroll/mutations"],
  ["7", "Riwayat Perubahan", "Setiap Edit Mutasi dicatat. Edit setelah Selesai atau setelah Tutup Buku diberi tanda khusus, lengkap dengan data sebelum → sesudah dan alasan perubahan.", "/admin/payroll/history"],
  ["8", "Gaji", "Pesanan Selesai masuk daftar gaji. Klik Perlihatkan untuk melihat ordernya. Atur % per karyawan, Operasional, Kasbon, Denda, dan Bonus/Uang Tip.", "/admin/payroll/gaji"],
  ["9", "Kunci & Tutup Buku", "Pilih tanggal sekaligus jam awal/akhir. Klik Kunci Periode terlebih dahulu. Saat terkunci semua pengguna hanya bisa membaca data. Setelah itu tombol Tutup Buku aktif. Buka kunci jika ingin mengedit lagi.", "/admin/payroll/finance/closing"],
  ["10", "Ekspor Lembar Kerja per Menu", "Di Mutasi, Penjualan, Stok, Gaji, Karyawan, dan Tutup Buku tersedia tombol Ekspor. Di Gaji ada pilihan FH1/FH2/FH3/ADMIN/BANDAR dan judul Excel mengikuti bagian yang dipilih. Berkas Excel mengikuti filter yang sedang dipilih dan sekarang otomatis dibuat rapih seperti lembar kerja EVO lama: judul, warna header, Rupiah, border, dan status berwarna.", "/admin/payroll/mutations"],
  ["11", "Contoh Filter Ekspor", "Di Mutasi atau Penjualan pilih periode + Sumber + Jenis + Pembeli + Permainan + kode/pesanan + urutan, lalu klik Ekspor. Excel berisi ringkasan di atas dan data tabel hasil filter di bawah. Stok mengikuti Permainan/Jenis; Gaji mengikuti FH; Karyawan mengikuti FH/Status.", "/admin/payroll/mutations"],
];

export default function GuidePage() {
  return (
    <>
      <PageHeader title="Panduan" description="Ikuti alur ini dari atas ke bawah. Tidak perlu menghafal istilah teknis." />

      <section className="mb-6 rounded-2xl bg-yellow-400 p-5 text-black sm:p-6">
        <div className="text-lg font-bold">Alur paling sederhana</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
          {['Karyawan', 'Produk/Game', 'Gudang', 'Pesanan', 'Penjualan', 'Mutasi', 'History', 'Gaji', "Kunci + Tutup Buku", "Ekspor Excel", 'Selesai'].map((x, i) => <span key={x} className="flex items-center gap-2"><span className="rounded-lg bg-black/10 px-3 py-2">{x}</span>{i < 10 ? <span>→</span> : null}</span>)}
        </div>
      </section>

      <div className="space-y-3">
        {steps.map(([number, title, text, href]) => (
          <Link key={number} href={href} className="cp-card flex items-center gap-4 p-4 transition hover:border-yellow-500/40 sm:p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xl font-bold text-black">{number}</div>
            <div><div className="text-lg font-semibold">{title}</div><div className="mt-1 text-sm leading-6 text-zinc-500">{text}</div></div>
            <div className="ml-auto text-xl text-zinc-600">→</div>
          </Link>
        ))}
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><div className="font-semibold text-emerald-200">🟢 Hijau</div><div className="mt-1 text-sm text-zinc-400">Pesanan selesai / sudah masuk gajian.</div></div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4"><div className="font-semibold text-red-200">🔴 Merah</div><div className="mt-1 text-sm text-zinc-400">Pesanan bermasalah dan belum boleh masuk gaji.</div></div>
        <div className="cp-card p-4"><div className="font-semibold">Boosting</div><div className="mt-1 text-sm text-zinc-500">1 pesanan Rp10.000 + 2 karyawan = Rp5.000 nilai kerja per karyawan. Tetap 1 pesanan di Mutasi.</div></div>
        <div className="cp-card p-4"><div className="font-semibold">Gold / Item</div><div className="mt-1 text-sm text-zinc-500">Stok wajib milik karyawan yang dipilih dan harus cocok Permainan + Wilayah + Server + jumlah. Untuk Item tetap ada Nama Item, tetapi tidak ada Lokasi Gudang.</div></div>
      </section>

      <section className="mt-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-yellow-100">Edit pesanan yang sudah selesai</h2>
        <div className="mt-3 text-sm leading-7 text-zinc-300">Buka <strong>Mutasi → Edit Mutasi</strong>. Jika order sudah Selesai, Anda wajib menulis alasan. Sistem menyimpan perubahan di <strong>Riwayat Perubahan</strong>. Jika order sudah Closing, payroll lama tidak dihitung ulang otomatis; history menjadi catatan koreksi.</div>
      </section>


      <section className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-red-100">Aturan Kunci sebelum Tutup Buku</h2>
        <div className="mt-3 text-sm leading-7 text-zinc-300">Atur <strong>tanggal + jam</strong> periode, lalu klik <strong>Kunci Periode</strong>. Selama terkunci, Pesanan, Mutasi, Karyawan, Gaji, Kasbon, Produk/Game, dan Stok menjadi hanya-baca untuk semua user. <strong>Tutup Buku hanya aktif saat sistem terkunci.</strong> Setelah selesai, klik Buka Kunci agar pengguna bisa mengedit lagi.</div>
      </section>

      <section className="mt-6 cp-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Contoh gajian</h2>
        <div className="mt-3 text-sm leading-7 text-zinc-400">Nilai kerja Rp1.000.000 × <strong className="text-white">40%</strong> = Rp400.000. Lalu + Bonus/Uang Tip, − Operasional, − Denda, − Kasbon. Jika hasil akhirnya minus, angka Gaji Bersih akan tampil <strong className="text-red-300">merah</strong>.</div>
      </section>
    </>
  );
}
