# Google Sign-In untuk distribusi Play

## Insiden 27 September 2026

Pengguna memasang Android 0.15.0 (22) melalui Google Play internal testing dan melaporkan `DEVELOPER_ERROR`. Pemeriksaan Google Cloud menemukan hanya satu klien Android, yang memakai SHA-1 **upload key**. APK yang dikirim Play memakai sertifikat distribusi Google, sehingga identitas package/sertifikat belum terdaftar pada OAuth.

`GoogleSignin.configure()` memakai web client yang benar dan berada pada proyek Google Cloud yang sama: `proud-device-436700-f2` (nomor `1049087934077`). Package tetap `com.comeplayers.app`.

## Konfigurasi yang disimpan

Setelah persetujuan khusus pemilik, tiga klien Android berikut berhasil dibuat. Sidik jari dibaca dari sertifikat publik dalam ZIP yang diunduh melalui App signing di Play Console, bukan dari upload key atau clipboard.

| Nama klien | Sertifikat / SHA-1 | OAuth client ID |
| --- | --- | --- |
| ComePlayers Android - Google Play | `deployment_cert.der` / `2F:D2:66:E3:C1:27:7B:8C:DF:8E:0D:2D:E0:29:EE:65:EE:40:9F:C1` | `1049087934077-d5sbnejqtif2dnj515a5dv8dvb6rfo19.apps.googleusercontent.com` |
| ComePlayers Android - Play hybrid classical | `hybrid_classical_cert.der` / `D9:6D:2F:68:82:E2:9F:82:D1:57:2A:A8:05:36:CD:8E:40:57:4F:15` | `1049087934077-0hvv6ritug3piflhvubvah9cb2hop5hc.apps.googleusercontent.com` |
| ComePlayers Android - Play PQC | `hybrid_pqc_cert.der` / `0E:23:D0:0C:34:26:C0:13:14:C2:8F:81:72:01:1A:15:B7:F8:B6:BD` | `1049087934077-acuticj3eptiehk3frh26b7oec84f1o3.apps.googleusercontent.com` |

Klien upload yang sudah ada tetap menggunakan `6C:49:44:09:94:C8:BD:49:58:C2:23:B7:E0:88:04:46:C0:05:D9:76`. Web client tetap `1049087934077-0ctif9d73m0lkmh0o02ohv7lusf2nuvl.apps.googleusercontent.com`. Android client ID tidak menggantikan web client ID pada aplikasi.

Ini perubahan registrasi OAuth di server Google. Tidak ada perubahan source autentikasi, upload key, scope, atau AAB. Console menyebut propagasi dapat berlangsung 5 menit sampai beberapa jam. Pembuatan ketiga klien terverifikasi; keberhasilan login dan sesi ComePlayers pada perangkat pengguna masih menunggu uji ulang. Tidak ada perangkat Android yang tersambung melalui ADB saat pemeriksaan.

## Verifikasi rilis berikutnya

1. Cocokkan package, web client, serta semua sertifikat distribusi Play dengan klien Android pada proyek yang sama.
2. Tunggu propagasi konfigurasi, tutup aplikasi sepenuhnya, lalu buka dan coba login Google dari instalasi Play.
3. Pastikan sesi ComePlayers terbentuk setelah pemilihan akun. Catat pesan error dan versi aplikasi jika masih gagal; jangan meminta password, OTP, atau token pengguna.
4. Pertahankan identitas signing distribusi APK lain. Jangan memperbaiki mismatch dengan mengganti upload key atau melemahkan pemeriksaan token.

Referensi: [konfigurasi Google Sign-In](https://react-native-google-signin.github.io/docs/setting-up/get-config-file), [troubleshooting](https://react-native-google-signin.github.io/docs/troubleshooting), [Play app signing dan tiga sertifikat hybrid](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en-GB).

Bukti lokal: `tmp/google-oauth-play-fixed.png`.
