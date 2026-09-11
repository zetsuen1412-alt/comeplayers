# Pengaturan Social Connect ComePlayers

Patch ini mengganti tombol boolean palsu pada `user_social_connections` dengan **identity linking asli dari Supabase Auth**.

## Pengaturan wajib di Supabase

1. Buka **Authentication → Providers**.
2. Aktifkan provider yang akan digunakan: Google, Facebook, Discord, dan Twitter/X.
3. Aktifkan **Manual identity linking** pada pengaturan Authentication.
4. Tambahkan URL redirect berikut:

```text
http://localhost:3000/account/connects
https://DOMAIN_ANDA/account/connects
```

Pada dashboard masing-masing provider, gunakan callback URL provider yang ditampilkan oleh Supabase.

## Provider tambahan

TikTok, Instagram, Weibo, dan login PayPal bukan provider native yang langsung diaktifkan oleh repository ini. Provider tersebut dapat dihubungkan melalui custom OIDC provider atau identity broker. Setelah custom provider dibuat di Supabase, isi variabel berikut:

```env
NEXT_PUBLIC_SOCIAL_TIKTOK_PROVIDER=custom:tiktok
NEXT_PUBLIC_SOCIAL_PAYPAL_PROVIDER=custom:paypal
NEXT_PUBLIC_SOCIAL_INSTAGRAM_PROVIDER=custom:instagram
NEXT_PUBLIC_SOCIAL_WEIBO_PROVIDER=custom:weibo
```

Nilainya harus sama persis dengan identifier custom provider di Supabase.

Akun payout PayPal tetap dikelola secara terpisah melalui `/seller/payouts`. Menghubungkan identitas login PayPal tidak menggantikan konfigurasi payout account terenkripsi.

## Perilaku keamanan

- Halaman membaca identity asli dari Supabase Auth.
- Tombol **Link** membuka halaman otorisasi OAuth/OIDC provider yang sebenarnya.
- Tombol **Unlink** menghapus identity Supabase yang sebenarnya.
- Pengguna tidak dapat menghapus satu-satunya metode login yang tersisa.
- Provider tidak lagi dianggap terhubung hanya karena sebuah nilai boolean ditulis ke database.
