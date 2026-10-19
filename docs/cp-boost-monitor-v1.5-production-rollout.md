# CP Boost Monitor v1.5.0 — rollout produksi FH3

Status: **perubahan produksi telah disetujui pengguna** (19 Oktober 2026). Belum terdeploy. Jangan mencampur keberhasilan GitHub CI dengan keberhasilan migrasi database atau Vercel.

## Persyaratan dan batasan
- Kode pada PR #69 di GitHub `zetsuen1412-alt/comeplayers` adalah sumber implementasi.
- Scope: order satu kali jenis Boosting/Item, karyawan FH3 tunggal. Bukan Gold, DAY, divisi lain atau payroll payout.
- Grup bukti Telegram: **🔥 EVO🔥 Ilham FH3**. Admin berhasil mengirim `/bind FH3` di grup dan bot membalas `✅ Grup dihubungkan ke FH3` (screenshot). Ini **belum** membuktikan bahwa token bot backend website sama dengan bot yang menjawab; endpoint read-only `/api/admin/payroll/mobile/proof-setup` harus memverifikasi secara langsung setelah deployment.
- Token `TELEGRAM_BOT_TOKEN` dan Supabase service role wajib hanya di backend; jangan tulis nilainya dalam issue, chat, repo atau screenshot.
- APK debug CI mungkin bertanda tangan berbeda dari APK terpasang. Jangan uninstall sebelum ekspor cadangan SQLite/riwayat kerja.
- Database Supabase dan Vercel bukan bagian dari izin GitHub. Diperlukan akun/connector produksi tersendiri; jangan menganggap approval pengguna berarti kredensial tersedia.

## 1. Audit sebelum migrasi
1. Pastikan database dan proyek Vercel yang benar (production ComePlayers), backup database serta snapshot `cp_payroll_workspace` terbaru; catat `revision`, jumlah order aktif FH3, dan nama/ID grup FH3. Jangan mengunggah kredensial atau buyer/order data privat.
2. Pastikan 3 migrasi baru belum pernah dijalankan; cocokkan version/name dan periksa `supabase_migrations.schema_migrations` bila tersedia.
3. Pastikan tabel `cp_payroll_workspace`, `cp_payroll_telegram_divisions`, `cp_payroll_telegram_outbox` dan fungsi-fungsi Telegram pada versi sebelumnya sudah ada.
4. Jalankan migrasi **di staging** terlebih dahulu dengan skema dan data tiruan yang setara. Uji belum membuat order/menugaskan karyawan di produksi.
5. Pastikan tidak ada deployment terjadwal yang mengubah `main`, schema, atau konfigurasi FH3 bersamaan; koordinasikan jendela pemeliharaan jika diperlukan.

## 2. Urutan migrasi (Supabase SQL Editor atau layanan migration resmi)
Jalankan dalam **urutan ini**, satu per satu dengan pencatatan keberhasilan, bukan salin seluruh repo ke SQL Editor:

1. `website/supabase/migrations/20261019220000_cp_boost_monitor_mobile_assignment.sql` — table audit dan RPC penugasan.
2. `website/supabase/migrations/20261019220001_cp_boost_monitor_direct_fh3_routing.sql` — disable dispatch *baru* Telegram untuk FH3 Boosting/Item, batalkan notice pending untuk order lama yang belum dimulai; pertahankan pekerjaan Telegram lain yang sedang berlangsung.
3. `website/supabase/migrations/20261019220002_cp_boost_monitor_mobile_telegram_proof.sql` — table foto metadata + RPC START/DONE.

**Perhatian:** migrasi nomor 2 mengubah perilaku notifikasi FH3 setelah diterapkan, bahkan sebelum aplikasi Android terdeploy. Terapkan dalam jendela rollout sesingkat mungkin setelah staging, dan siap rollback fungsi jika diperlukan. Jangan mengubah/menghapus data bukti saat rollback.

Contoh *verifikasi keberadaan* (read-only):

```sql
select to_regclass('public.cp_mobile_assignment_audit') as assignment_audit,
       to_regclass('public.cp_mobile_order_proof') as telegram_proof;
select to_regprocedure('public.cp_mobile_assign_fh3(text,text,uuid)') as assignment_rpc,
       to_regprocedure('public.cp_mobile_proof_begin(text,text,text,uuid)') as start_rpc,
       to_regprocedure('public.cp_mobile_proof_finish(uuid,uuid,bigint,text)') as finish_rpc;
select division, chat_id, chat_title, active
from public.cp_payroll_telegram_divisions where division='FH3';
```

Harus terdapat dua tabel dan tiga fungsi. `FH3` harus aktif dan punya **chat_id negatif**. Jangan menampilkan ID bot/token dalam log. ID chat negatif **bukan bukti cukup**: judul/live group tetap diverifikasi `getChat`.

## 3. Website Vercel
1. Setelah migrasi berhasil, deploy commit yang mereferensikan PR #69 ke **preview/staging**; cek typecheck/endpoint serta sesi admin. Jangan deploy APK produksi sebelum backend siap.
2. Uji `GET /api/admin/payroll/mobile/proof-setup` dengan **sesi admin**: harus `ready:true`, `liveTitle` grup *EVO Ilham FH3*. Tanpa sesi harus 401/403. Endpoint ini tidak mengirim foto.
3. Uji `GET /mobile/pending`, `GET /mobile/tasks` menggunakan order uji: hanya order FH3 Boosting/Item yang layak; tidak ada nilai gaji/buyer credential.
4. Konfirmasi `POST /mobile/assign` memerlukan admin dan satu pekerja; dua permintaan berbeda pada order sama tidak menimpa satu sama lain.
5. Jika semua sehat, merge PR dengan proses release normal sesuai branch protections, dan pantau deployment Vercel production. GitHub merge *tidak* menerapkan migrasi SQL.
6. Cek `/mobile/proof-setup` lagi pada **production** dengan admin untuk memastikan bot token production adalah bot yang tepat. Jangan lanjut foto jika gagal.

## 4. APK dan uji nyata
- CI lulus: direct + photo proof [run 39288758053], sheet/payroll [run 39288757735], Android APK [run 39288752966].
- APK **pratinjau** tersedia di [GitHub prerelease](https://github.com/zetsuen1412-alt/comeplayers/releases/tag/cp-boost-monitor-v1.5-fh3-proof-preview). Untuk smoke test gunakan perangkat uji; tanda tangan debug tidak menjamin upgrade in-place.
- Saat `main` sudah melewati semua pemeriksaan, workflow `.github/workflows/cp-boost-monitor-apk.yml` mempublikasikan APK dan ZIP ke `website/public/downloads/`. Pastikan SHA-256 yang disajikan sama dengan build APK yang diverifikasi, dan login/sesi Android berfungsi.
- Klik **Tugas → Periksa Koneksi Grup EVO Ilham FH3** sebelum START/DONE.
- Foto START/DONE kirim ke **grup nyata** hanya setelah ada order uji yang jelas dan izin owner grup. Jangan memakai order pelanggan riil sebagai percobaan. Verifikasi caption, file_id/message_id, state transisi pada website dan ketidakadaan duplikat.
- Kesalahan jaringan setelah `sendPhoto` menghasilkan `unknown`: jangan kirim ulang secara otomatis. Operator harus melihat grup, audit dan status order lalu rekonsiliasi manual.

## 5. Kriteria selesai dan rollback
Selesai bila migrasi produksi terkonfirmasi, Vercel deployed, APK versi sama, preflight bot benar, order uji sukses START/DONE, dan website Payroll membaca status yang tepat. Catat siapa yang menguji dan kapan.

Jika gagal setelah migrasi:
- Hentikan penggunaan APK baru/fitur START-DONE; pindahkan website kembali ke versi sebelumnya melalui mekanisme rollback Vercel yang sudah teruji. Jangan melakukan merge/revert buta pada pekerjaan admin lain.
- Audit `cp_mobile_order_proof` dan order yang sedang berjalan sebelum mencoba migrasi balik. Jangan pernah menghapus bukti sent/unknown untuk memaksa retry Telegram.
- Untuk mengembalikan dispatch Telegram FH3, perlu perubahan SQL *fungsi routing* yang direview khusus; **sekadar revert kode GitHub tidak memulihkan fungsi database**.
- Rollback bukan `DROP TABLE` audit atau proof yang sudah berisi data: simpan untuk investigasi.
- Tunda publikasi APK resmi jika preflight grup gagal/ada konflik sesi/login/penugasan.

## Status izin dan pekerjaan
Pengguna telah mengizinkan deployment produksi. Sebelum mengeksekusi butuh koneksi Supabase dan Vercel aktif atau operator yang memiliki akses setara. Jangan menulis bahwa migrasi/deployment sukses tanpa bukti eksekusi dan tes kesehatan produksi.
