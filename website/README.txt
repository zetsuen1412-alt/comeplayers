COMEPLAYERS — LOGO KEMBALI KE HALAMAN UTAMA
===========================================

Tujuan:
Saat logo ComePlayers diklik dari halaman Marketplace, browser membuka:
https://comeplayers.com/

Bukan:
https://comeplayers.com/marketplace

CARA PALING MUDAH (WINDOWS)
---------------------------
1. Ekstrak ZIP ini ke folder utama proyek ComePlayers.
   Folder utama adalah folder yang berisi package.json.
2. Klik dua kali APPLY_FIX.cmd
3. Jalankan:
      npm run build
4. Jika build berhasil, deploy ulang ke Vercel.

File yang diubah akan dibuatkan cadangan dengan ekstensi:
   .before-logo-home-fix.bak

Contoh perubahan:
   <Link href="/marketplace">
menjadi:
   <Link href="/">

Script juga menangani:
- <a href="/marketplace">
- router.push("/marketplace") pada elemen logo
- window.location.href = "/marketplace" pada elemen logo

PENTING
-------
Script hanya mengubah elemen yang terdeteksi sebagai logo ComePlayers,
berdasarkan alt="ComePlayers" atau nama file logo.

CARA MANUAL
-----------
Cari komponen header, biasanya:
- app/components/MainHeader.tsx
- components/MainHeader.tsx
- src/app/components/MainHeader.tsx
- src/components/MainHeader.tsx

Lalu ubah tautan logo menjadi:

<Link href="/" aria-label="Go to ComePlayers home" className="flex items-center">
  <img
    src="/logo.png?v=2"
    alt="ComePlayers"
    className="h-16 w-auto object-contain md:h-20"
  />
</Link>

MEMBATALKAN PERUBAHAN
---------------------
Salin kembali isi file:
   *.before-logo-home-fix.bak
ke nama file aslinya.

Catatan:
Patch contoh tersedia di folder patches.
