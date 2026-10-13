# Sinkronisasi daftar karyawan Payroll → CP Boost Monitor Android

**Sumber data:** `cp_payroll_workspace.payload[workspaceKeys.employees]` dari Payroll Website ComePlayers. Google Sheets PAYROLL-1/-2/-3 sudah memiliki proses sinkronisasi tersendiri ke daftar karyawan website; jalur aplikasi Android tidak boleh mengakses file Sheets, saldo payroll, mutasi, atau kasbon secara langsung.

## API read-only

- `POST /api/admin/payroll/mobile/session`: `{"action":"login","email":"...","password":"..."}` atau `{"action":"refresh","refreshToken":"..."}`. Menggunakan Supabase Auth dan memvalidasi izin `requirePayrollAccess`, mengembalikan accessToken/refreshToken/expiresAt **hanya** untuk akun yang berizin. JWT tidak ditulis ke log. Permintaan dibatasi 8 KiB dan respon tidak di-cache.
- `GET /api/admin/payroll/mobile/roster`: `Authorization: Bearer <accessToken>`. Memvalidasi user dan akses payroll melalui `requirePayrollAccess`, membaca snapshot workspace server-side, kemudian memproyeksikan hanya `id`, `code`, `name`, `team`, `workforceStatus`, `active`. Tidak ada nilai uang atau informasi pribadi tambahan yang dibuka.

## Keamanan

Endpoint dilindungi oleh kontrol otorisasi payroll yang sama dengan website. Ketika kebijakan satu sesi aktif, login APK memverifikasi identity/MFA lalu mengklaim sesi melalui `cp_claim_account_session` seperti halaman website; sesi web lama pada perangkat lain bisa terputus sesuai kebijakan. Jangan membuat API publik tanpa autentikasi, memberikan service-role key kepada HP, atau membypass MFA hanya demi APK. Login SSO-only / MFA yang membutuhkan challenge khusus masih memerlukan alur login mobile tambahan.

## Perilaku APK

- Android menyimpan access/refresh token terenkripsi Android Keystore (AES/GCM).
- Roster diperbarui otomatis saat aplikasi aktif setiap ±2 menit dan saat aplikasi masuk ke foreground; kegagalan tetap mempertahankan snapshot lokal.
- Baris lokal memakai `payroll_id` unik. Nama/divisi mengikuti website; status boosting (ready, menganggur, tidur, bekerja) dan riwayat tetap di SQLite lokal.
- `active=false` atau ID yang tidak lagi ada di snapshot membuat pekerja tersembunyi, bukan menghapus riwayat.
- Tidak ada push status dari APK ke payroll pada rilis ini; perlu tabel/endpoint dan perizinan khusus untuk fitur tersebut.

## Checklist rilis

1. Jalankan `npm run typecheck` dan `npm run test -- --test-name-pattern=payroll` pada website di lingkungan dengan dependensi terpasang (atau `npm test` seluruhnya).
2. Deploy endpoint ke staging, lalu login dengan akun admin/petugas payroll dan pastikan akses non-payroll ditolak (401/403).
3. Pastikan roster tanpa gaji, data sheet ID, kasbon, atau detail order.
4. Tambah/ganti nama/kode/divisi di website, jalankan sinkronisasi di APK; identitas/status dan history lama harus tetap terjaga.
5. Uji `RESIGN`, pegawai hilang dari Sheet, offline, pembaruan token, logout, backup/restore, serta upgrade SQLite v1→v2.
6. Build dan uji APK debug dari GitHub Actions, lalu buat signing release khusus internal.