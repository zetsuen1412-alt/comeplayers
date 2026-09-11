# ComePlayers Marketplace Game Flow V35

## Ringkasan

Pembaruan ini mengubah alur Marketplace per game menjadi:

1. Pengguna membuka sebuah game.
2. Pengguna melihat empat kategori tetap:
   - Koin Game
   - Jasa Joki
   - Item
   - Akun Game
3. Khusus Koin Game, pengguna memilih server dan wilayah.
4. Pengguna masuk ke daftar penjual untuk server tersebut.
5. Daftar dapat diurutkan berdasarkan:
   - Direkomendasikan
   - Harga terendah

Desain tetap memakai identitas dark navy, cyan, dan gold ComePlayers.

## Cara memasang dengan copy–replace

1. Backup proyek lama.
2. Buka ZIP patch atau full source.
3. Salin folder `website` ke proyek lama.
4. Pilih **Replace the files in the destination**.
5. Jangan menimpa atau menghapus `website/.env.local`.
6. Hapus cache build lama:

```powershell
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
```

7. Instal ulang dan periksa:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

8. Jalankan lokal:

```powershell
npm.cmd run dev
```

## Database

Pembaruan ini **tidak membutuhkan migration SQL baru**.

Implementasi menggunakan kolom Marketplace yang sudah ada:

- `products.category`
- `products.offer_server`
- `products.offer_region`
- `products.offer_platform`
- `products.price`
- `products.min_variant_price`
- `product_variants.attributes`
- `product_variants.price`
- `product_variants.stock`

Server juga dapat dibaca dari atribut variant seperti:

```json
{
  "server": "Rexxar",
  "region": "Global"
}
```

Agar server tampil pada kartu pilihan, penawaran Koin Game harus memiliki salah satu dari:

- `products.offer_server`, atau
- `product_variants.attributes.server`

## Route

Halaman game:

```text
/games/[gameSlug]
```

Daftar penawaran:

```text
/games/[gameSlug]/offers?category=coin&server=Rexxar&region=Global&sort=recommended
```

Harga terendah:

```text
/games/[gameSlug]/offers?category=coin&server=Rexxar&sort=price_asc
```

## Cara menguji

1. Buka `/games/[slug]`.
2. Pastikan empat kategori tampil.
3. Pilih **Koin Game**.
4. Cari server dan pilih wilayah.
5. Klik kartu server.
6. Pastikan filter server tersimpan di URL.
7. Pilih **Direkomendasikan**.
8. Pilih **Harga terendah** dan pastikan harga naik dari termurah.
9. Aktifkan filter penjual online.
10. Klik **Pilih** untuk membuka detail penawaran.

## Hasil validasi

- TypeScript: lulus.
- TypeScript E2E: lulus.
- Unit/integration tests: 156/156 lulus.
- ESLint: 0 error, 108 warning lama pada bagian proyek lain.
- Next.js production build: lulus.

## Catatan

Urutan Direkomendasikan menggunakan skor Marketplace yang mempertimbangkan harga, rating, jumlah transaksi, ketepatan waktu, service level, status online, stok, verifikasi, relevansi, dan usia penawaran. Tie-breaker dibuat stabil; tidak menggunakan urutan acak.
