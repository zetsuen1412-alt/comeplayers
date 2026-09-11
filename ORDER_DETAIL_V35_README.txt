ComePlayers Order Detail V35 - Simple Buyer View

Tujuan:
- Merapikan halaman detail order agar lebih sederhana dan padat.
- Menampilkan identitas customer/pembeli dengan jelas pada halaman seller.
- Mempertahankan fitur delivery proof V34 (minimal 1 screenshot + 1 video, jumlah file tanpa batas).

Perubahan UI:
- Header order lebih pendek dan sederhana.
- Customer tampil langsung di sebelah nomor order.
- Customer juga tampil di Order Summary.
- Product card, timeline, status, dan action dibuat lebih compact.
- Lebar konten dipadatkan supaya informasi utama lebih cepat dibaca.

Buyer identity:
- Prioritas nama: display_name / full_name / name / nickname.
- Prioritas username: username / user_name / handle.
- Fallback ke metadata Supabase Auth.
- Jika nama/username tidak tersedia, seller melihat email pembeli yang sudah dimasking.
- buyer_id tetap tidak dikirim ke client.

Cara replace:
1. Extract ZIP ke C:\Comeplayers-new
2. Pilih Replace All
3. cd C:\Comeplayers-new\website
4. npm run typecheck
5. npm run build
6. npx vercel@latest --prod --force
