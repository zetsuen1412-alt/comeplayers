# Changelog v0.14.0

- Mutasi Bandar dihapus; satu sistem Mutasi untuk semua sumber.
- Filter Mutasi berdasarkan periode, sumber, dan pencarian kode order.
- Ringkasan nilai/jumlah order per sumber untuk 7 hari, bulan, rentang tanggal, atau semua data.
- Boosting jumlah 1 dapat dikerjakan beberapa karyawan; nilai order dibagi rata otomatis tanpa menggandakan order.
- Payroll memakai persentase per karyawan.
- Kolom order selesai di Gaji memakai modal `Perlihatkan (N)`.
- Gaji bersih mendukung nilai minus dan warna merah.
- Closing diubah menjadi manual dengan rentang tanggal bebas.
- Hanya order verified/selesai yang masuk Closing; order bermasalah ditunda.
- Order yang sudah masuk Closing diberi `payrollClosedAt`/`payrollPeriodId` agar tidak terhitung lagi.
- Ringkasan sumber ditambahkan pada Closing dan export Excel.
- Stok/Gudang dapat difilter berdasarkan game.
- Brand UI menjadi EVO COMEPLAYERS; label demo menjadi DEMO!.
- Panduan diperbarui mengikuti alur terbaru.
