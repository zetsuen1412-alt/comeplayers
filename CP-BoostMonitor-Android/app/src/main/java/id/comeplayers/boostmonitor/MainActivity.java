package id.comeplayers.boostmonitor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** CP Boost Monitor: status lokal, identitas karyawan dari payroll website. */
public final class MainActivity extends Activity {
    private static final int INK = Color.rgb(17, 24, 39);
    private static final int SUB = Color.rgb(107, 114, 128);
    private static final int BG = Color.rgb(247, 248, 252);
    private static final int PURPLE = Color.rgb(22, 120, 184);
    private static final int ORANGE = Color.rgb(180, 83, 9);
    private static final int BORDER = Color.rgb(229, 231, 235);
    private static final int WHITE = Color.WHITE;
    private static final String[] STATUS = {EmployeeDb.READY, EmployeeDb.IDLE, EmployeeDb.SLEEP, EmployeeDb.WORK};
    private static final String[] STATUS_LABEL = {"Ready Boosting", "Farming", "Tidur", "Sedang Bekerja"};
    private static final int CSV = 401, BACKUP = 402, RESTORE = 403, PROOF_PHOTO = 404;

    private EmployeeDb db;
    private SharedPreferences prefs;
    private PayrollSync payroll;
    private boolean syncBusy = false;
    private boolean pendingBusy = false, assignmentBusy = false;
    private JSONArray pendingOrders = new JSONArray();
    private JSONArray activeTasks = new JSONArray();
    private boolean tasksBusy = false, proofBusy = false, takeBusy = false;
    private String proofOrderRef = "", proofEmployeeCode = "", proofAction = "";
    private String proofStartEventId = "";
    private long proofPauseRevision;
    private String pendingError = "", tasksError = "";
    private JSONObject earningsData;
    private boolean earningsBusy = false;
    private String earningsError = "", earningsCode = "";
    private int earningsOffset = 0;
    private long accountVersion = 0;
    private boolean notificationTestPending;
    private final Runnable payrollTicker = new Runnable() {
        @Override public void run() {
            refreshPayroll(false);
            handler.postDelayed(this, 120000L); // sepanjang aplikasi aktif
        }
    };
    private final Runnable pendingTicker = new Runnable() {
        @Override public void run() {
            if (linked()) { loadPendingOrders(false); loadActiveTasks(false); }
            if (linked() && "Data Tutup Buku".equals(page)) loadEarnings(earningsCode, earningsOffset);
            handler.postDelayed(this, 30000L);
        }
    };
    private LinearLayout root, body, employeesContainer;
    private String page = "Dashboard", filter = "SEMUA", search = "";
    private long historyEmployee = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override public void run() { render(); handler.postDelayed(this, 60000); }
    };

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new EmployeeDb(this);
        prefs = getSharedPreferences("settings", MODE_PRIVATE);
        payroll = new PayrollSync(new SecureSession(this), db,this);
        render();
    }
    @Override protected void onResume() {
        super.onResume(); handler.removeCallbacks(ticker); handler.postDelayed(ticker, 60000);
        handler.removeCallbacks(payrollTicker); handler.post(payrollTicker);
        handler.removeCallbacks(pendingTicker); handler.postDelayed(pendingTicker, 30000L);
        if (linked()) {
            loadPendingOrders(false); loadActiveTasks(false);
            if(prefs.getBoolean("order_notifications",false) && (android.os.Build.VERSION.SDK_INT<33
              || checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED)) startOrderNotifications();
        }
    }
    @Override protected void onPause() {
        handler.removeCallbacks(ticker); handler.removeCallbacks(payrollTicker);
        handler.removeCallbacks(pendingTicker); super.onPause();
    }
    @Override protected void onDestroy() { accountVersion++; handler.removeCallbacksAndMessages(null); payroll.shutdown(); db.close(); super.onDestroy(); }

    private void startOrderNotifications(){
        if(!linked())return;
        try{Intent intent=new Intent(this,OrderNotificationService.class);if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(intent);else startService(intent);}
        catch(RuntimeException error){OrderNotifications.failed(this,"Android belum mengizinkan layanan latar belakang. Buka ulang aplikasi dan periksa pengaturan baterai.");toast("Pemantau belum berjalan. Lihat status di Pengaturan.");}
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);if(code!=830)return;
        if(results.length>0 && results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED){
            if(prefs.getBoolean("order_notifications",false))startOrderNotifications();
            if(notificationTestPending)showNotificationTest();
        }else{prefs.edit().putBoolean("order_notifications",false).apply();toast("Izin notifikasi belum diberikan. Aktifkan dari Izin & banner notifikasi.");}
        notificationTestPending=false;render();
    }
    private void showNotificationTest(){
        try{new AlertDialog.Builder(this).setTitle("Tes notifikasi HP").setMessage(OrderNotifications.test(this)).setPositiveButton("OK",null).show();}
        catch(RuntimeException error){toast("Tes gagal diproses. Periksa izin notifikasi Android.");}
    }
    private void notificationSettings(){
        Intent intent=new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName());
        if(android.os.Build.VERSION.SDK_INT>=26 && getSystemService(android.app.NotificationManager.class).areNotificationsEnabled())
            intent=new Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName()).putExtra(android.provider.Settings.EXTRA_CHANNEL_ID,OrderNotifications.selectedChannel(this));
        try{startActivity(intent);}catch(android.content.ActivityNotFoundException error){startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}
    }
    private boolean linked() { return payroll.hasSession(); }
    private void refreshPayroll(boolean manual) {
        if (syncBusy || !linked()) {
            if (manual && !linked()) loginDialog();
            return;
        }
        syncBusy = true;
        final long version = accountVersion;
        payroll.sync((message, ok) -> {
            if (version != accountVersion || !linked()) return;
            syncBusy = false;
            if (ok) prefs.edit().putLong("payroll_last_sync", now()).putString("payroll_sync_message", message).remove("payroll_sync_error").apply();
            else prefs.edit().putString("payroll_sync_error", message).apply();
            if (manual || !ok) toast(message);
            if (ok) { loadPendingOrders(false); loadActiveTasks(false); }
            render();
        });
    }

    private void loadPendingOrders(boolean manual) {
        if (pendingBusy || !linked()) return;
        pendingBusy = true;
        final long version = accountVersion;
        payroll.loadPendingOrders((data, message, ok) -> {
            if (version != accountVersion || !linked()) return;
            pendingBusy = false;
            if (ok) {
                pendingOrders = data.optJSONArray("pending");
                pendingError = "";
                try{OrderNotifications.observe(this,data);}
                catch(RuntimeException error){OrderNotifications.failed(this,"Notifikasi gagal diproses. Buka Pengaturan dan Tes notifikasi.");}
            } else { pendingError = message; pendingOrders = new JSONArray(); }
            if (manual && !ok) toast(message);
            if ("Order Baru".equals(page)) render();
        });
    }

    private void sendAssignment(String orderRef, String employeeCode) {
        if (assignmentBusy) return;
        for (EmployeeDb.Employee worker : db.payrollEmployees())
            if (employeeCode.equalsIgnoreCase(worker.payrollCode) && EmployeeDb.SLEEP.equals(worker.status)) {
                toast("Karyawan masih Tidur. Ubah ke Ready Boosting sebelum TAKE."); return;
            }
        assignmentBusy = true;
        final long version = accountVersion;
        render();
        payroll.assignOrder(orderRef, employeeCode, (data, message, ok) -> {
            if (version != accountVersion || !linked()) return;
            assignmentBusy = false;
            if (ok) markWorkingAfterTake(employeeCode, orderRef);
            loadPendingOrders(false);
            loadActiveTasks(false);
            refreshPayroll(false);
            if (ok) {
                new AlertDialog.Builder(this)
                    .setTitle("TAKE diterima Telegram")
                    .setMessage("Langsung mulai order " + orderRef + " dengan screenshot bukti awal? Foto akan dikirim ke grup Telegram FH3.")
                    .setNegativeButton("Nanti dari Tugas", null)
                    .setPositiveButton("START + Foto", (dialog, which) ->
                        pickProofPhoto(orderRef, employeeCode, "start"))
                    .show();
            } else {
                page = "Tugas";
                new AlertDialog.Builder(this).setTitle(data != null && data.optBoolean("assigned")
                        ? "Penugasan tersimpan; periksa TAKE" : "TAKE belum dikonfirmasi")
                    .setMessage(message + "\n\nSegarkan Tugas. Periksa grup sebelum mengirim ulang.")
                    .setPositiveButton("OK", null).show();
            }
            render();
        });
    }

    private void loadActiveTasks(boolean manual) {
        if (tasksBusy || !linked()) return;
        tasksBusy = true;
        final long version = accountVersion;
        payroll.loadActiveTasks((data, message, ok) -> {
            if (version != accountVersion || !linked()) return;
            tasksBusy = false;
            boolean statusChanged = false;
            if (ok) {
                activeTasks = data.optJSONArray("tasks");
                if (activeTasks == null) activeTasks = new JSONArray();
                try { statusChanged = db.applyConfirmedTasks(data) > 0; }
                catch (Exception error) { toast("Tugas terbaca; status otomatis belum tersimpan. Periksa penyimpanan perangkat."); }
                tasksError = "";
            } else { tasksError = message; if (manual) toast(message); }
            if ("Tugas".equals(page) || "Dashboard".equals(page) || statusChanged) render();
        });
    }

    private void loadEarnings(String code, int offset) {
        if (!linked() || earningsBusy) return;
        earningsBusy = true; earningsCode = code; earningsOffset = offset;
        final long version = accountVersion;
        payroll.loadEarnings(code, offset, (data, message, ok) -> {
            if (version != accountVersion || !linked()) return;
            earningsBusy = false;
            earningsData = ok ? data : null; earningsError = ok ? "" : message;
            if ("Data Tutup Buku".equals(page)) render();
        });
    }

    private void sendTake(String ref, String code) {
        if (!linked() || takeBusy || proofBusy || assignmentBusy) return;
        takeBusy = true; render();
        final long version = accountVersion;
        payroll.takeOrder(ref, code, (data, message, ok) -> {
            if (version != accountVersion || !linked()) return;
            takeBusy = false;
            if (ok) markWorkingAfterTake(code, ref);
            new AlertDialog.Builder(this).setTitle(ok ? "TAKE diterima" : "Periksa TAKE")
                .setMessage(message).setPositiveButton("OK", null).show();
            loadActiveTasks(false); loadPendingOrders(false); refreshPayroll(false); render();
        });
    }

    private void markWorkingAfterTake(String code, String ref) {
        try { db.markWorkingAfterConfirmedTake(code, ref); }
        catch (Exception error) { toast("TAKE sudah terkonfirmasi; status lokal belum tersimpan. Periksa penyimpanan perangkat."); }
    }

    private void pickProofPhoto(String ref, String code, String action) {
        if (!linked() || proofBusy || takeBusy || assignmentBusy || !tasksError.isEmpty()) return;
        proofOrderRef = ref; proofEmployeeCode = code; proofAction = action;
        proofStartEventId = "";proofPauseRevision=0;
        if("pause".equals(action)||"continue".equals(action)){
            JSONObject selected=null;
            for(int i=0;i<activeTasks.length();i++){JSONObject task=activeTasks.optJSONObject(i);
                if(task!=null && ref.equals(task.optString("orderRef")) && code.equals(task.optString("employeeCode"))){selected=task;break;}}
            if(selected==null || selected.optBoolean("deliveryUncertain") || !selected.optBoolean("pause".equals(action)?"canPause":"canContinue")){
                toast("Status order berubah. Segarkan Tugas.");return;}
            proofStartEventId=selected.optString("startEventId");proofPauseRevision=selected.optLong("pauseRevision",-1);
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg","image/png"});
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(intent, PROOF_PHOTO);
    }

    private void uploadProgress(Uri photo) {
        if (proofBusy) return;
        proofBusy = true;
        final String ref = proofOrderRef, code = proofEmployeeCode, action = proofAction;
        final long version = accountVersion;
        render();
        payroll.sendProof(ref, code, action, photo, getContentResolver(), proofStartEventId, proofPauseRevision, (message, ok) -> {
            if (version != accountVersion || !linked()) return;
            proofBusy = false;
            new AlertDialog.Builder(this)
                .setTitle(ok ? "Bukti terkirim" : "Bukti belum dikonfirmasi")
                .setMessage(message + (ok ? "" : "\n\nPeriksa grup Telegram sebelum mencoba lagi."))
                .setPositiveButton("OK", null).show();
            loadActiveTasks(false); refreshPayroll(false);
            render();
        });
    }

    private void loginDialog() {
        LinearLayout form = form();
        form.addView(text("Masuk memakai username dan password. Admin menyiapkan akun pribadi atau akun bersama untuk memilih karyawan FH3.", 13, SUB, false));
        space(form, 8);
        EditText email = input("Username ComePlayers", "");
        email.setInputType(InputType.TYPE_CLASS_TEXT);
        EditText password = input("Password", "");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(email); form.addView(password);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Masuk EVOGAMING Monitor")
                .setView(form).setNegativeButton("Batal", null).setPositiveButton("Login", null).create();
        dialog.setOnShowListener(x -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (trim(email).isEmpty()) { email.setError("Masukkan username."); return; }
            if (trim(password).isEmpty()) { password.setError("Password harus diisi."); return; }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            final long version = ++accountVersion;
            payroll.login(trim(email), password.getText().toString(), (message, ok) -> {
                if (version != accountVersion) return;
                password.setText("");
                if (ok) {
                    prefs.edit().putBoolean("payroll_linked", true).putLong("payroll_last_sync", now())
                            .putString("payroll_sync_message", message).remove("payroll_sync_error").apply();
                    dialog.dismiss();
                    filter = "SEMUA"; search = ""; page = "Karyawan";
                    render(); toast(message);
                    if(prefs.getBoolean("order_notifications",false))startOrderNotifications();
                    if(!prefs.contains("order_notifications")) new AlertDialog.Builder(this).setTitle("Aktifkan notifikasi order?")
                        .setMessage("Monitor dapat memeriksa order di latar belakang dan memutar cuplikan musik 10 detik saat ada order baru.")
                        .setNegativeButton("Nanti",(d,w)->prefs.edit().putBoolean("order_notifications",false).apply())
                        .setPositiveButton("Aktifkan",(d,w)->{prefs.edit().putBoolean("order_notifications",true).apply();
                            if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)
                                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},830);
                            else startOrderNotifications();}).show();
                } else {
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    new AlertDialog.Builder(this).setTitle("Login gagal").setMessage(message)
                            .setPositiveButton("OK", null).show();
                }
            });
        }));
        dialog.show();
    }

    private int dp(float size) { return (int) (getResources().getDisplayMetrics().density * size + .5f); }
    private long now() { return System.currentTimeMillis(); }
    private String time(long millis) { return new SimpleDateFormat("dd MMM yyyy, HH:mm", new Locale("id", "ID")).format(new Date(millis)); }
    private String duration(long since) {
        long minutes = Math.max(0, (now() - since) / 60000);
        if (minutes < 60) return minutes + " menit";
        long hours = minutes / 60;
        if (hours < 24) return hours + " jam " + minutes % 60 + " menit";
        return (hours / 24) + " hari " + (hours % 24) + " jam";
    }
    private int tint(String status) {
        if (EmployeeDb.READY.equals(status)) return 0xff047857;
        if (EmployeeDb.IDLE.equals(status)) return 0xffa16207;
        if (EmployeeDb.SLEEP.equals(status)) return 0xff7c3aed;
        if (EmployeeDb.WORK.equals(status)) return 0xff2563eb;
        return 0xffdc2626;
    }
    private GradientDrawable shape(int color, int radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d;
    }
    private LinearLayout vertical() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); return l; }
    private LinearLayout horizontal() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.HORIZONTAL); l.setGravity(Gravity.CENTER_VERTICAL); return l; }
    private TextView text(String s, int size, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD); t.setIncludeFontPadding(true); return t;
    }
    private void pad(View v, int x, int y) { v.setPadding(dp(x), dp(y), dp(x), dp(y)); }
    private LinearLayout.LayoutParams lp(int width, int height) { return new LinearLayout.LayoutParams(width == -1 ? -1 : dp(width), height == -1 || height == -2 ? height : dp(height)); }
    private void space(LinearLayout parent, int height) { View v = new View(this); parent.addView(v, lp(1, height)); }
    private LinearLayout panel() {
        LinearLayout p = vertical(); p.setBackground(shape(WHITE, 17)); pad(p, 16, 15);
        p.setElevation(dp(2)); return p;
    }
    private Button button(String label, boolean primary) {
        Button b = new Button(this); b.setAllCaps(false); b.setText(label); b.setTextSize(13);
        b.setTextColor(primary ? WHITE : INK); b.setBackground(shape(primary ? PURPLE : 0xffeef2ff, 12));
        b.setMinHeight(dp(42)); b.setMinimumHeight(dp(42)); b.setPadding(dp(12), 0, dp(12), 0);
        return b;
    }
    private EditText input(String hint, String value) {
        EditText e = new EditText(this); e.setSingleLine(true); e.setTextSize(15); e.setTextColor(INK);
        e.setHint(hint); e.setText(value); e.setSelectAllOnFocus(false);
        e.setPadding(dp(9), dp(11), dp(9), dp(11)); return e;
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private String trim(EditText e) { return e.getText().toString().trim(); }

    private void render() {
        root = vertical(); root.setBackgroundColor(BG);
        setContentView(root);
        LinearLayout header = vertical(); header.setBackgroundColor(INK);
        header.setPadding(dp(19), dp(19), dp(19), dp(17));
        header.addView(text("EVOGAMING  /  MONITOR FH3", 20, WHITE, true));
        space(header, 4);
        header.addView(text("Pantau kesiapan tim boosting", 12, 0xffc7d2fe, false));
        root.addView(header, lp(-1, -2));
        // Selalu gunakan roster payroll, jangan tampilkan angka nol mode lokal tanpa login.
        if (!linked()) {
            LinearLayout gate = vertical(); gate.setPadding(dp(25), dp(48), dp(25), 0);
            gate.addView(text("Masuk ke EVOGAMING Monitor", 23, INK, true));
            space(gate, 12);
            gate.addView(text("Hanya nama karyawan FH3 dari Payroll → Karyawan. Divisi lain dibersihkan dari APK.", 14, SUB, false));
            space(gate, 14);
            gate.addView(text("Login dengan username yang dibuat atau dihubungkan admin. Identitas karyawan diperbarui dari server saat aplikasi aktif.", 13, SUB, false));
            space(gate, 20);
            Button login = button("Login Username", true);
            gate.addView(login, lp(-1, 55));
            login.setOnClickListener(v -> loginDialog()); root.addView(gate); return;
        }
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(false);
        body = vertical(); body.setPadding(dp(15), dp(18), dp(15), dp(22));
        scroll.addView(body); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if ("Dashboard".equals(page)) dashboard();
        else if ("Order Baru".equals(page)) ordersPage();
        else if ("Tugas".equals(page)) tasksPage();
        else if ("Karyawan".equals(page)) employeesPage();
        else if ("Riwayat".equals(page)) historyPage();
        else if ("Data Tutup Buku".equals(page)) earningsPage();
        else settingsPage();
        navigation();
    }

    private void navigation() {
        LinearLayout nav = horizontal(); nav.setBackgroundColor(WHITE);
        String[] pages = {"Dashboard", "Order Baru", "Tugas", "Karyawan", "Data Tutup Buku", "Riwayat", "Pengaturan"};
        String[] symbols = {"▦", "✉", "▶", "♙", "Rp", "◷", "⚙"};
        for (int i = 0; i < pages.length; i++) {
            final String dest = pages[i];
            TextView t = text(symbols[i] + "\n" + dest, 11, page.equals(dest) ? PURPLE : SUB, page.equals(dest));
            t.setGravity(Gravity.CENTER); t.setPadding(0, dp(11), 0, dp(11));
            nav.addView(t, new LinearLayout.LayoutParams(0, dp(62), 1));
            t.setOnClickListener(v -> {
                page = dest;
                if (!"Riwayat".equals(dest)) historyEmployee = 0;
                render();
                if ("Order Baru".equals(dest)) loadPendingOrders(false);
                if ("Tugas".equals(dest)) loadActiveTasks(false);
                if ("Data Tutup Buku".equals(dest)) loadEarnings(earningsCode, earningsOffset);
            });
        }
        root.addView(nav, lp(-1, -2));
    }

    private void heading(String title, String sub) {
        body.addView(text(title, 23, INK, true));
        if (!sub.isEmpty()) { space(body, 5); body.addView(text(sub, 13, SUB, false)); }
        space(body, 17);
    }

    private void dashboard() {
        List<EmployeeDb.Employee> all = db.payrollEmployees();
        heading("Dashboard Tim", "Karyawan FH3 dari Payroll Website • " + time(now()));
        if (linked()) {
            Button newOrders = button("📨 Order Baru FH3 (" + (pendingOrders == null ? 0 : pendingOrders.length()) + ")", true);
            body.addView(newOrders, lp(-1, 48)); space(body, 12);
            newOrders.setOnClickListener(v -> { page = "Order Baru"; render(); loadPendingOrders(false); });
            Button activeButton = button("📷 Tugas Aktif (" + activeTasks.length() + ") • START / DONE", false);
            body.addView(activeButton, lp(-1, 48)); space(body, 12);
            activeButton.setOnClickListener(v -> { page = "Tugas"; render(); loadActiveTasks(false); });
            String error = prefs.getString("payroll_sync_error", "");
            long synced = prefs.getLong("payroll_last_sync", 0L);
            info((error.isEmpty() ? "✓ " + all.size() + " karyawan FH3 dari Payroll Website"
                    : "⚠ Sinkron gagal: " + error + " (data terakhir tetap tersimpan)")
                + " • Update terakhir: " + (synced == 0L ? "belum ada" : time(synced)));
            space(body, 8);
            Button sync = button(syncBusy ? "Sedang sinkron..." : "↻ Perbarui dari Payroll", false);
            sync.setEnabled(!syncBusy); body.addView(sync, lp(-1, 43));
            sync.setOnClickListener(v -> refreshPayroll(true)); space(body, 16);
        }
        int ready = 0, idle = 0, sleeping = 0, working = 0;
        List<EmployeeDb.Employee> sleepingEmployees = new ArrayList<>();
        List<EmployeeDb.Employee> available = new ArrayList<>();
        for (EmployeeDb.Employee e : all) {
            switch (e.status) {
                case EmployeeDb.READY: ready++; available.add(e); break;
                case EmployeeDb.IDLE: idle++; break;
                case EmployeeDb.SLEEP: sleeping++; sleepingEmployees.add(e); break;
                case EmployeeDb.WORK: working++; break;
            }
        }
        summaryRow("🟢 Ready Boosting", ready, "READY", "🔵 Sedang Bekerja", working, "WORK");
        summaryRow("⚪ Semua", all.size(), "SEMUA", "🌙 Tidur", sleeping, "SLEEP");
        space(body, 23);
        body.addView(text("Sedang Tidur", 18, INK, true)); space(body, 10);
        if (sleepingEmployees.isEmpty()) info("Tidak ada karyawan yang sedang tidur.");
        else {
            sleepingEmployees.sort((a, b) -> Long.compare(a.statusSince, b.statusSince));
            for (EmployeeDb.Employee e : sleepingEmployees) employeeCard(body, e, false);
        }
        space(body, 20);
        body.addView(text("Siap Menerima Boosting", 18, INK, true)); space(body, 10);
        if (available.isEmpty()) info("Belum ada karyawan berstatus Ready Boosting.");
        else for (EmployeeDb.Employee e : available) employeeCard(body, e, false);
    }

    private void summaryRow(String one, int a, String filterA, String two, int b, String filterB) {
        LinearLayout r = horizontal(); r.setGravity(Gravity.TOP);
        summaryCard(r, one, a, filterA);
        View gap = new View(this); r.addView(gap, lp(10, 1));
        summaryCard(r, two, b, filterB);
        body.addView(r, lp(-1, -2)); space(body, 11);
    }
    private void summaryCard(LinearLayout row, String title, int count, String targetFilter) {
        LinearLayout p = panel(); p.setElevation(dp(1));
        p.addView(text(String.valueOf(count), 28, INK, true)); space(p, 5);
        p.addView(text(title, 12, SUB, true));
        row.addView(p, new LinearLayout.LayoutParams(0, -2, 1));
        p.setOnClickListener(v -> { filter = targetFilter; page = "Karyawan"; render(); });
    }
    private void summarySingle(String label, int n, String targetFilter) {
        LinearLayout p = panel(); p.setBackground(shape(0xfffff1f2, 15));
        LinearLayout r = horizontal();
        r.addView(text(label, 15, 0xff991b1b, true), new LinearLayout.LayoutParams(0, -2, 1));
        r.addView(text(String.valueOf(n), 25, 0xffb91c1c, true)); p.addView(r);
        body.addView(p, lp(-1, -2));
        p.setOnClickListener(v -> { filter = targetFilter; page = "Karyawan"; render(); });
    }
    private void info(String s) {
        LinearLayout p = panel(); p.addView(text(s, 13, SUB, false)); body.addView(p, lp(-1, -2));
    }

    /** Only posts from the verified Adm EVO Gaming account in the bound FH3 group. */
    private void ordersPage() {
        heading("Order Telegram FH3", "Sumber order: kiriman Adm EVO Gaming / @evogamings di grup FH3.");
        info("Pilih karyawan untuk TAKE. Penugasan dicatat di Monitor dan laporan TAKE dikirim ke Telegram. TASK mengikuti pesan admin.");
        space(body, 10);
        Button sync = button(pendingBusy ? "Memuat order..." : "↻ Ambil Order Terbaru", true);
        sync.setEnabled(!pendingBusy && !assignmentBusy);
        body.addView(sync, lp(-1, 44));
        sync.setOnClickListener(v -> loadPendingOrders(true));
        space(body, 15);
        if (!pendingError.isEmpty()) {
            info("⚠ " + pendingError);
            space(body, 10);
        }
        if (pendingOrders == null || pendingOrders.length() == 0) {
            info(pendingBusy ? "Memuat order baru dari website..." : "Belum ada order FH3 yang menunggu karyawan.");
            return;
        }
        for (int i = 0; i < pendingOrders.length(); i++) {
            JSONObject order = pendingOrders.optJSONObject(i);
            if (order == null) continue;
            final String ref = order.optString("orderRef", "").trim();
            if (ref.isEmpty()) continue;
            LinearLayout card = panel();
            card.addView(text("📦 " + ref + "  •  " + order.optString("orderType", "boosting").toUpperCase(Locale.ROOT), 15, INK, true));
            space(card, 7);
            card.addView(text("Nama: " + order.optString("orderName", "—"), 13, SUB, false));
            card.addView(text("Game: " + order.optString("game", "—"), 13, SUB, false));
            card.addView(text("TASK: " + order.optString("task", "—"), 13, SUB, false));
            space(card, 11);
            boolean canTake = MonitorContract.canTake(order);
            if (order.optBoolean("needsValuation", false)) card.addView(text("Pekerjaan akan dicatat atas nama karyawan. Upah bersih diisi admin setelah DONE, kemudian disimpan melalui Tutup Buku.", 13, ORANGE, false));
            if (!canTake) card.addView(text("BUTUH INPUT PAYROLL — minta admin mencatat order ini sebelum TAKE.", 13, ORANGE, true));
            Button assign = button(assignmentBusy ? "Mengirim TAKE..." : "TAKE · Pilih Karyawan", true);
            assign.setEnabled(canTake && !assignmentBusy && !takeBusy && !proofBusy && pendingError.isEmpty());
            card.addView(assign, lp(-1, 44));
            assign.setOnClickListener(v -> chooseWorker(ref));
            body.addView(card, lp(-1, -2));
            space(body, 11);
        }
    }

    private void tasksPage() {
        heading("Tugas FH3", "TAKE → START + screenshot → DONE + screenshot, dilaporkan ke Telegram.");
        info("Status order tersimpan di server Monitor. Foto wajib diunggah sebelum START atau DONE.");
        space(body, 10);
        Button checkGroup = button("✓ Periksa Koneksi Grup EVO Ilham FH3", false);
        body.addView(checkGroup, lp(-1, 42));
        checkGroup.setOnClickListener(v -> {
            checkGroup.setEnabled(false);
            payroll.checkProofGroup((message, ok) -> {
                checkGroup.setEnabled(true);
                new AlertDialog.Builder(this).setTitle(ok ? "Grup FH3 Siap" : "Grup FH3 Belum Siap")
                    .setMessage(message).setPositiveButton("OK", null).show();
            });
        });
        space(body, 10);
        Button refresh = button(tasksBusy ? "Memuat tugas..." : "↻ Segarkan Tugas", false);
        refresh.setEnabled(!tasksBusy && !proofBusy);
        body.addView(refresh, lp(-1, 42));
        refresh.setOnClickListener(v -> loadActiveTasks(true));
        space(body, 14);
        if (!tasksError.isEmpty()) {
            info("⚠ " + tasksError + "\nAksi dinonaktifkan sampai tugas berhasil diperbarui.");
            space(body, 10);
        }
        if (activeTasks.length() == 0) {
            info(tasksBusy ? "Memuat tugas..." : "Tidak ada order aktif yang ditugaskan ke FH3.");
            return;
        }
        for (int i = 0; i < activeTasks.length(); i++) {
            JSONObject task = activeTasks.optJSONObject(i);
            if (task == null) continue;
            final String ref = task.optString("orderRef", "").trim();
            final String code = task.optString("employeeCode", "").trim();
            final String status = task.optString("status", "").trim();
            if (ref.isEmpty() || code.isEmpty()) continue;
            LinearLayout card = panel();
            card.addView(text("📦 " + ref + " • " + status.toUpperCase(Locale.ROOT), 16, INK, true));
            space(card, 5);
            card.addView(text("Karyawan: " + task.optString("employeeName", "—")
                    + " (" + code + ")", 13, SUB, false));
            card.addView(text("Order: " + task.optString("orderName", "—"), 13, SUB, false));
            card.addView(text("Game: " + task.optString("game", "—"), 13, SUB, false));
            card.addView(text("TASK: " + task.optString("task", "—"), 13, SUB, false));
            space(card, 10);
            card.addView(text("TAKE: " + task.optString("takeStatus", "—")
                    + " • START: " + task.optString("startStatus", "—"), 12, SUB, false));
            card.addView(text(task.optString("actionMessage", "Segarkan tugas untuk memeriksa aksi."), 12, SUB, false));
            boolean busy = proofBusy || takeBusy || assignmentBusy || tasksBusy || !tasksError.isEmpty();
            if (task.optBoolean("canTake", false)) {
                Button take = button(takeBusy ? "Mengirim TAKE..." : "Kirim TAKE ke Telegram", true);
                take.setEnabled(!busy);
                card.addView(take, lp(-1, 46));
                take.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Kirim TAKE " + ref + "?")
                    .setMessage("Pastikan TAKE sebelumnya belum terkirim. Server akan memeriksa catatannya sebelum mengirim.")
                    .setNegativeButton("Batal", null).setPositiveButton("Kirim TAKE", (d, w) -> sendTake(ref, code)).show());
            }
            if (task.optBoolean("canStart", false) || task.optBoolean("canDone", false)) {
                boolean start = task.optBoolean("canStart", false);
                String action = start ? "start" : "done";
                Button send = button(proofBusy ? "Mengirim bukti..." :
                        (start ? "▶ START + Screenshot" : "✅ DONE + Screenshot"), true);
                send.setEnabled(!busy);
                card.addView(send, lp(-1, 46));
                send.setOnClickListener(v -> pickProofPhoto(ref, code, action));
            }
            if(task.optBoolean("canPause") || task.optBoolean("canContinue")){
                String action=task.optBoolean("canContinue")?"continue":"pause";
                Button pause=button("continue".equals(action)?"▶ CONTINUE + Screenshot":"Ⅱ PAUSE + Screenshot",false);
                pause.setEnabled(!busy && !task.optBoolean("deliveryUncertain"));card.addView(pause,lp(-1,46));
                pause.setOnClickListener(v->pickProofPhoto(ref,code,action));
            }
            body.addView(card, lp(-1, -2)); space(body, 10);
        }
    }

    private void chooseWorker(String orderRef) {
        List<EmployeeDb.Employee> workers = db.payrollEmployees();
        if (workers.isEmpty()) {
            new AlertDialog.Builder(this).setTitle("Belum ada karyawan")
                    .setMessage("Sinkronkan karyawan FH3 dari Payroll Website terlebih dahulu.")
                    .setPositiveButton("OK", null).show();
            return;
        }
        String[] labels = new String[workers.size()];
        for (int i = 0; i < workers.size(); i++) {
            EmployeeDb.Employee e = workers.get(i);
            labels[i] = e.name + "  •  " + e.visibleStatus();
        }
        new AlertDialog.Builder(this).setTitle("Pilih karyawan untuk " + orderRef)
                .setItems(labels, (dialog, which) -> {
                    EmployeeDb.Employee selected = workers.get(which);
                    new AlertDialog.Builder(this).setTitle("Konfirmasi TAKE")
                            .setMessage("Order: " + orderRef + "\nKaryawan: " + selected.name
                                    + "\n\nSimpan penugasan dan kirim laporan TAKE ke Telegram FH3?")
                            .setNegativeButton("Batal", null)
                            .setPositiveButton("TAKE", (confirm, button) -> sendAssignment(orderRef, selected.payrollCode))
                            .show();
                }).setNegativeButton("Batal", null).show();
    }

    private void employeesPage() {
        heading("Karyawan FH3 (" + db.payrollEmployees().size() + ")", "Sumber: ComePlayers → Payroll → Karyawan → FH3.");
        info("Hanya nama dan kode FH3 otomatis mengikuti website. Ubah nama di website; di APK cukup pilih status boosting.");
        space(body, 9);
        Button syncNames = button(syncBusy ? "Sedang memperbarui nama..." : "↻ Ambil Nama Terbaru", true);
        syncNames.setEnabled(!syncBusy); body.addView(syncNames, lp(-1, 43));
        syncNames.setOnClickListener(v -> refreshPayroll(true));
        space(body, 14);
        EditText searchField = input("Cari nama / jabatan / tugas", search);
        searchField.setSingleLine(true); searchField.setBackground(shape(WHITE, 11));
        body.addView(searchField, lp(-1, 49)); space(body, 13);
        searchField.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { search = s.toString(); fillEmployees(); }
            @Override public void afterTextChanged(Editable s) { }
        });
        ScrollView chipScroll = new ScrollView(this); // gunakan horizontal baris multi-line agar tetap cocok untuk HP kecil
        LinearLayout wraps = vertical();
        LinearLayout first = horizontal(), second = horizontal();
        addChip(first, "Semua", "SEMUA"); addChip(first, "Ready", "READY"); addChip(first, "Bekerja", "WORK");
        addChip(second, "Farming", "IDLE"); addChip(second, "Tidur", "SLEEP");
        wraps.addView(first); space(wraps, 8); wraps.addView(second);
        chipScroll.addView(wraps); body.addView(chipScroll, lp(-1, -2)); space(body, 14);
        employeesContainer = vertical(); body.addView(employeesContainer, lp(-1, -2)); fillEmployees();
    }

    private static String rupiah(long value) {
        java.text.NumberFormat format = java.text.NumberFormat.getCurrencyInstance(new Locale("id", "ID"));
        format.setMaximumFractionDigits(0); return format.format(value);
    }

    private void earningsPage() {
        heading("Data Tutup Buku", "Arsip upah bersih dari order Telegram yang selesai dan dihargai admin.");
        Button refresh=button(earningsBusy?"Memuat...":"Perbarui Data Tutup Buku",true);
        body.addView(refresh,lp(-1,44));refresh.setEnabled(!earningsBusy);refresh.setOnClickListener(v->loadEarnings("",0));
        if(!earningsError.isEmpty()){info(earningsError);return;}
        if(earningsData==null){info("Tekan Perbarui untuk memuat arsip penghasilan.");return;}
        info(earningsData.optString("notice"));
        JSONArray books=earningsData.optJSONArray("closings");
        if(books==null || books.length()==0)info("Belum ada Data Tutup Buku.");
        if(books!=null)for(int i=0;i<books.length();i++){
            JSONObject book=books.optJSONObject(i);if(book==null)continue;
            LinearLayout card=panel();card.addView(text(book.optString("title"),17,INK,true));
            card.addView(text("Total tim: "+book.optInt("orderCount")+" order • Rp "+String.format(new Locale("id","ID"),"%,d",book.optLong("totalRupiah")),16,PURPLE,true));
            card.addView(text(book.optString("createdAt"),12,SUB,false));
            Button detail=button("Penghasilan karyawan & daftar order",false);card.addView(detail,lp(-1,42));
            detail.setOnClickListener(v->{JSONArray work=book.optJSONArray("work");StringBuilder lines=new StringBuilder();
                JSONArray people=book.optJSONArray("employees");if(people!=null)for(int j=0;j<people.length();j++){JSONObject person=people.optJSONObject(j);if(person!=null)
                    lines.append(person.optString("employeeName")).append(": Rp ").append(String.format(new Locale("id","ID"),"%,d",person.optLong("totalRupiah"))).append(" • ").append(person.optInt("orderCount")).append(" order\n");}
                lines.append("\nDAFTAR ORDER\n");
                if(work!=null)for(int j=0;j<work.length();j++){JSONObject item=work.optJSONObject(j);if(item!=null)lines.append(item.optString("orderRef")).append(" • ").append(item.optString("employeeName")).append(" • Rp ").append(String.format(new Locale("id","ID"),"%,d",item.optLong("wageRupiah"))).append("\n");}
                new AlertDialog.Builder(this).setTitle(book.optString("title")).setMessage(lines.toString()).setPositiveButton("Tutup",null).show();});
            body.addView(card,lp(-1,-2));space(body,10);
        }
        JSONArray open=earningsData.optJSONArray("open");if(open!=null && open.length()>0){
            info("Order selesai yang belum Tutup Buku:");for(int i=0;i<open.length();i++){JSONObject item=open.optJSONObject(i);if(item==null)continue;
                info(item.optString("orderRef")+" • "+item.optString("employeeName")+" • "+(item.isNull("wageRupiah")?"Belum dihargai":"Rp "+String.format(new Locale("id","ID"),"%,d",item.optLong("wageRupiah"))));}
        }
    }
    private void addChip(LinearLayout container, String label, String tag) {
        Button b = button(label, filter.equals(tag)); b.setTextSize(11); b.setMinHeight(dp(36));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(40), 1);
        p.setMargins(0, 0, dp(7), 0); container.addView(b, p);
        b.setOnClickListener(v -> { filter = tag; render(); });
    }
    private void fillEmployees() {
        if (employeesContainer == null) return;
        employeesContainer.removeAllViews();
        int n = 0;
        for (EmployeeDb.Employee e : db.payrollEmployees()) {
            if (!"SEMUA".equals(filter) && !filter.equals(e.status)) continue;
            String haystack = (e.name + " " + e.payrollCode + " " + e.position + " " + e.task + " "
                    + e.orderRef + " " + e.orderName + " " + e.game + " " + e.buyer).toLowerCase(Locale.ROOT);
            if (!haystack.contains(search.toLowerCase(Locale.ROOT).trim())) continue;
            employeeCard(employeesContainer, e, true); n++;
        }
        if (n == 0) {
            LinearLayout empty = panel(); empty.addView(text("Tidak ada karyawan sesuai filter.", 14, SUB, false));
            employeesContainer.addView(empty, lp(-1, -2));
        }
    }
    private void employeeCard(LinearLayout parent, EmployeeDb.Employee e, boolean management) {
        LinearLayout p = panel();
        LinearLayout title = horizontal();
        TextView name = text(e.name, 17, INK, true);
        title.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        TextView status = text(e.visibleStatus(), 11, tint(e.status), true);
        status.setBackground(shape(0xfff3f4f6, 9));
        status.setPadding(dp(9), dp(7), dp(9), dp(7)); title.addView(status); p.addView(title);
        if (!e.position.isEmpty()) { space(p, 5); p.addView(text(e.position, 13, SUB, false)); }
        space(p, 10);
        String elapsed = EmployeeDb.SLEEP.equals(e.status)
                ? "Tidur selama " + duration(e.statusSince)
                : "⏱ " + duration(e.statusSince);
        p.addView(text(elapsed + "  •  Sejak " + time(e.statusSince), 12, SUB, false));
        if (!e.task.isEmpty() || !e.orderRef.isEmpty() || !e.orderName.isEmpty() || !e.game.isEmpty() || !e.buyer.isEmpty()) {
            space(p, 7);
            if (!e.orderRef.isEmpty()) p.addView(text("Order: " + e.orderRef, 13, INK, false));
            if (!e.orderName.isEmpty()) p.addView(text("Nama order: " + e.orderName, 13, INK, false));
            if (!e.game.isEmpty()) p.addView(text("Game: " + e.game, 13, INK, false));
            if (!e.buyer.isEmpty()) p.addView(text("Buyer: " + e.buyer, 13, INK, false));
            if (!e.task.isEmpty() && !e.task.equals(e.orderRef)) p.addView(text("Tugas: " + e.task, 13, INK, false));
        }
        if (!e.note.isEmpty()) { space(p, 5); p.addView(text("Catatan: " + e.note, 12, SUB, false)); }
        space(p, 12);
        Button change = button("Ubah Status", true); p.addView(change, lp(-1, 42));
        change.setOnClickListener(v -> statusDialog(e));
        if (management) {
            space(p, 8);
            LinearLayout actions = horizontal();
            Button edit = button(e.payrollManaged ? "Catatan" : "Edit", false), history = button("Riwayat", false), del = button("Hapus", false);
            actions.addView(edit, new LinearLayout.LayoutParams(0, dp(40), 1));
            View gap1 = new View(this); actions.addView(gap1, lp(7, 1));
            actions.addView(history, new LinearLayout.LayoutParams(0, dp(40), 1));
            View gap2 = new View(this); actions.addView(gap2, lp(7, 1));
            if (!e.payrollManaged) actions.addView(del, new LinearLayout.LayoutParams(0, dp(40), 1));
            p.addView(actions);
            edit.setOnClickListener(v -> editDialog(e));
            history.setOnClickListener(v -> { historyEmployee = e.id; page = "Riwayat"; render(); });
            del.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Hapus " + e.name + "?")
                    .setMessage("Karyawan akan dihapus dari daftar. Riwayat perubahan tetap tersimpan.")
                    .setNegativeButton("Batal", null)
                    .setPositiveButton("Hapus", (d, w) -> { db.delete(e.id); render(); }).show());
        }
        parent.addView(p, lp(-1, -2));
        if (parent == employeesContainer || parent == body) space(parent, 10);
        else space(parent, 9);
    }

    private void addDialog() {
        LinearLayout form = form();
        EditText name = input("Nama karyawan *", ""), position = input("Jabatan / Divisi", "");
        EditText task = input("Tugas / order (opsional)", ""), note = input("Catatan (opsional)", "");
        form.addView(name); form.addView(position);
        TextView label = text("Status awal", 13, SUB, true); form.addView(label);
        Spinner spinner = new Spinner(this);
        spinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, STATUS_LABEL));
        form.addView(spinner); form.addView(task); form.addView(note);
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Tambah Karyawan").setView(form)
                .setNegativeButton("Batal", null).setPositiveButton("Simpan", null).create();
        d.setOnShowListener(x -> d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (trim(name).isEmpty()) { name.setError("Nama wajib diisi"); return; }
            db.add(trim(name), trim(position), STATUS[spinner.getSelectedItemPosition()], trim(task), trim(note));
            d.dismiss(); render(); toast("Karyawan ditambahkan");
        })); d.show();
    }
    private void editDialog(EmployeeDb.Employee e) {
        LinearLayout form = form();
        EditText name = input("Nama *", e.name), position = input("Jabatan", e.position);
        if (e.payrollManaged) { name.setEnabled(false); position.setEnabled(false); }
        EditText task = input("Tugas", e.task), note = input("Catatan", e.note);
        form.addView(name); form.addView(position); form.addView(task); form.addView(note);
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Edit Karyawan").setView(form)
                .setNegativeButton("Batal", null).setPositiveButton("Simpan", null).create();
        d.setOnShowListener(x -> d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (trim(name).isEmpty()) { name.setError("Nama wajib diisi"); return; }
            db.edit(e, trim(name), trim(position), trim(task), trim(note)); d.dismiss(); render();
        })); d.show();
    }
    private LinearLayout form() {
        LinearLayout content = vertical(); content.setPadding(dp(22), dp(5), dp(22), 0); return content;
    }
    private void statusDialog(EmployeeDb.Employee e) {
        int current = 0;
        for (int i = 0; i < STATUS.length; i++) if (STATUS[i].equals(e.status)) current = i;
        new AlertDialog.Builder(this).setTitle("Status " + e.name)
                .setSingleChoiceItems(STATUS_LABEL, current, (dialog, which) -> {
                    dialog.dismiss();
                    String next = STATUS[which];
                    if (next.equals(e.status)) { toast("Status tidak berubah"); return; }
                    LinearLayout form = form();
                    EditText task = input("Tugas / order boosting", e.task), reason = input("Keterangan perubahan (opsional)", "");
                    if (EmployeeDb.WORK.equals(next)) form.addView(task);
                    form.addView(reason);
                    new AlertDialog.Builder(this).setTitle("Ubah ke " + STATUS_LABEL[which])
                            .setView(form).setNegativeButton("Batal", null)
                            .setPositiveButton("Simpan", (x, w) -> {
                                db.changeStatus(e, next, trim(task), trim(reason)); render(); toast("Status diperbarui");
                            }).show();
                }).setNegativeButton("Batal", null).show();
    }

    private void historyPage() {
        heading("Riwayat Aktivitas", "Perubahan status tercatat otomatis beserta waktunya.");
        if (historyEmployee != 0) {
            Button all = button("← Tampilkan semua riwayat", false); body.addView(all, lp(-1, 44));
            all.setOnClickListener(v -> { historyEmployee = 0; render(); }); space(body, 14);
        }
        List<EmployeeDb.Event> events = db.history(historyEmployee);
        if (events.isEmpty()) { info("Belum ada riwayat aktivitas."); return; }
        for (EmployeeDb.Event e : events) {
            LinearLayout p = panel();
            p.addView(text(e.employeeName, 16, INK, true)); space(p, 4);
            String transition = e.fromStatus.isEmpty() ? "Baru → " + EmployeeDb.label(e.toStatus)
                    : EmployeeDb.label(e.fromStatus) + " → " + EmployeeDb.label(e.toStatus);
            p.addView(text(transition, 13, PURPLE, true)); space(p, 5);
            p.addView(text(time(e.changedAt), 12, SUB, false));
            if (!e.note.isEmpty()) { space(p, 5); p.addView(text(e.note, 13, SUB, false)); }
            body.addView(p, lp(-1, -2)); space(body, 10);
        }
    }

    private void settingsPage() {
        heading("Pengaturan & Data", "Akun Monitor, notifikasi, status lokal, dan backup.");
        LinearLayout integration = panel();
        integration.addView(text("Integrasi Payroll ComePlayers", 17, INK, true)); space(integration, 7);
        integration.addView(text("Karyawan FH3 dan hak akun dari ComePlayers. Order dan TASK dari kiriman admin Telegram FH3.", 12, SUB, false));
        space(integration, 7);
        integration.addView(text(linked() ? "✓ " + db.payrollEmployees().size() + " nama FH3 dari website • sinkron setiap 2 menit saat aktif."
                    : "Belum login ke EVOGAMING Monitor.", 13, SUB, false));
        space(integration, 11);
        if (!linked()) {
            Button login = button("Login Username", true);
            integration.addView(login, lp(-1, 44)); login.setOnClickListener(v -> loginDialog());
        } else {
            Button update = button("↻ Sinkronkan Nama Sekarang", true);
            integration.addView(update, lp(-1, 44)); update.setOnClickListener(v -> refreshPayroll(true));
            space(integration, 8);
            Button logout = button("Keluar dari Akun Payroll", false);
            integration.addView(logout, lp(-1, 44));
            logout.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Keluar dari Monitor?")
                    .setMessage("Daftar dan riwayat lokal tidak dihapus, tetapi aplikasi akan meminta login ulang.")
                    .setNegativeButton("Batal", null).setPositiveButton("Keluar", (d, w) -> {
                        accountVersion++; stopService(new Intent(this,OrderNotificationService.class));prefs.edit().putBoolean("order_notifications",false).apply(); payroll.logout();
                        earningsData = null; earningsCode = ""; earningsError = ""; earningsOffset = 0;
                        pendingOrders = new JSONArray(); activeTasks = new JSONArray();
                        pendingError = ""; tasksError = "";
                        earningsBusy = false; pendingBusy = false; tasksBusy = false; syncBusy = false;
                        prefs.edit().remove("payroll_linked").apply(); render();
                    }).show());
        }
        body.addView(integration, lp(-1, -2)); space(body, 14);
        if(getSharedPreferences("monitor_identity",MODE_PRIVATE).getBoolean("isAdmin",false)){
            Button manage=button("Kelola Order & Akun (Admin)",true);body.addView(manage,lp(-1,48));
            manage.setOnClickListener(v->startActivity(new Intent(this,MonitorAdminActivity.class)));
        }
        android.widget.Switch notifications=new android.widget.Switch(this);notifications.setText("Notifikasi order (termasuk latar belakang)");
        notifications.setChecked(prefs.getBoolean("order_notifications",false));body.addView(notifications,lp(-1,55));
        notifications.setOnCheckedChangeListener((v,enabled)->{
            prefs.edit().putBoolean("order_notifications",enabled).apply();
            if(enabled){if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},830);return;}
                startOrderNotifications();}else stopService(new Intent(this,OrderNotificationService.class));
        });
        android.widget.Switch sound=new android.widget.Switch(this);sound.setText("Suara order baru: musik (10 detik)");sound.setChecked(prefs.getBoolean("order_sound",true));
        body.addView(sound,lp(-1,48));sound.setOnCheckedChangeListener((v,enabled)->{prefs.edit().putBoolean("order_sound",enabled).apply();render();});
        LinearLayout notificationStatus=panel();
        notificationStatus.addView(text("Status notifikasi HP",17,INK,true));space(notificationStatus,8);
        notificationStatus.addView(text(OrderNotifications.diagnostics(this),13,SUB,false));space(notificationStatus,10);
        Button testNotification=button("Tes notifikasi + suara",true);notificationStatus.addView(testNotification,lp(-1,46));
        testNotification.setOnClickListener(v->{
            if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED){
                notificationTestPending=true;requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},830);
            }else showNotificationTest();
        });
        Button notificationPermission=button("Izin & banner notifikasi",false);notificationStatus.addView(notificationPermission,lp(-1,46));
        notificationPermission.setOnClickListener(v->notificationSettings());
        Button battery=button("Pengaturan baterai aplikasi",false);notificationStatus.addView(battery,lp(-1,46));
        battery.setOnClickListener(v->startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()))));
        body.addView(notificationStatus,lp(-1,-2));space(body,12);
        info("Antrean diperiksa sekitar 30 detik saat layanan berjalan, juga saat daftar order diperbarui. Android dapat menunda jaringan ketika HP tidur. Tes memakai musik dan kanal yang sama tanpa mengubah order. Force stop menghentikan pemantauan sampai aplikasi dibuka lagi.");

        LinearLayout settings = panel();
        settings.addView(text("Status tidur", 16, INK, true)); space(settings, 7);
        settings.addView(text("Status Tidur tetap ditampilkan sebagai Tidur. Durasi tidur berjalan terlihat langsung pada kartu karyawan.", 13, SUB, false));
        body.addView(settings, lp(-1, -2)); space(body, 12);
        LinearLayout data = panel();
        data.addView(text("Ekspor & Backup", 16, INK, true)); space(data, 7);
        data.addView(text("CSV untuk spreadsheet; JSON untuk memindahkan semua data dan riwayat ke HP lain secara manual.", 13, SUB, false));
        space(data, 12);
        Button csv = button("Ekspor Daftar Karyawan (.csv)", false);
        Button backup = button("Backup Semua Data (.json)", false);
        Button restore = button("Pulihkan dari Backup (.json)", false);
        data.addView(csv, lp(-1, 46)); space(data, 8);
        data.addView(backup, lp(-1, 46)); space(data, 8);
        data.addView(restore, lp(-1, 46));
        csv.setOnClickListener(v -> createDocument(CSV, "text/csv", "CP-Karyawan.csv"));
        backup.setOnClickListener(v -> createDocument(BACKUP, "application/json", "CP-Backup.json"));
        restore.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Pulihkan backup?").setMessage("Backup yang dipilih akan MENGGANTI seluruh data karyawan dan riwayat di HP ini. Simpan backup sekarang terlebih dahulu.")
                .setNegativeButton("Batal", null).setPositiveButton("Pilih File", (d, w) -> {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("application/json");
                    i.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(i, RESTORE);
                }).show());
        body.addView(data, lp(-1, -2)); space(body, 12);
        LinearLayout privacy = panel();
        privacy.addView(text("Penyimpanan & Privasi", 16, INK, true)); space(privacy, 8);
        privacy.addView(text("Nama, kode, dan divisi karyawan serta ringkasan order aktif diambil dari Payroll Website setelah login. Status boosting, waktu tidur, dan riwayat tetap lokal di HP ini. Backup JSON berisi data karyawan dan ringkasan order, simpan dengan aman.", 13, SUB, false));
        body.addView(privacy, lp(-1, -2));
    }
    private void createDocument(int request, String mime, String filename) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(mime); i.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(i, request);
    }
    private static String escapeCsv(String s) {
        if (s == null) s = "";
        // Hindari spreadsheet formula injection saat file dibuka di Excel/Sheets.
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }
    private String csvContent() {
        StringBuilder csv = new StringBuilder("Nama,Jabatan,Status,Durasi Status (menit),Mulai Status,Order,Nama Order,Game,Buyer,Tugas,Catatan\r\n");
        for (EmployeeDb.Employee e : db.all()) {
            String[] cols = {e.name, e.position, e.visibleStatus(),
                    String.valueOf(Math.max(0, (now() - e.statusSince) / 60000)),
                    time(e.statusSince), e.orderRef, e.orderName, e.game, e.buyer, e.task, e.note};
            for (int i = 0; i < cols.length; i++) {
                if (i > 0) csv.append(','); csv.append(escapeCsv(cols[i]));
            }
            csv.append("\r\n");
        }
        return csv.toString();
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == PROOF_PHOTO) {
            String actionLabel = "start".equals(proofAction) ? "START" : "DONE";
            new AlertDialog.Builder(this).setTitle("Kirim screenshot " + actionLabel + "?")
                .setMessage("Order: " + proofOrderRef + "\nKaryawan: " + proofEmployeeCode
                    + "\n\nFoto akan dikirim ke grup Telegram FH3 dan status order di website akan berubah setelah Telegram berhasil menerima gambar.")
                .setNegativeButton("Batal", null)
                .setPositiveButton("Kirim Foto", (dialog, which) -> uploadProgress(uri))
                .show();
            return;
        }
        try {
            if (requestCode == CSV || requestCode == BACKUP) {
                String contents = requestCode == CSV ? "\ufeff" + csvContent() : db.backup(0).toString(2);
                try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                    if (out == null) throw new Exception("Tidak dapat membuka file");
                    out.write(contents.getBytes(StandardCharsets.UTF_8)); out.flush();
                }
                toast("File berhasil disimpan");
            } else if (requestCode == RESTORE) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new Exception("Tidak dapat membaca backup");
                    byte[] buffer = new byte[8192]; int length, total = 0;
                    while ((length = input.read(buffer)) != -1) {
                        total += length; if (total > 10 * 1024 * 1024) throw new Exception("Backup terlalu besar (maks 10 MB)");
                        bytes.write(buffer, 0, length);
                    }
                }
                JSONObject root = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                db.restore(root);
                long t = root.optLong("sleepThresholdMinutes", 120);
                if (t >= 1 && t <= 10080) prefs.edit().putLong("sleep_limit", t).apply();
                historyEmployee = 0; filter = "SEMUA"; search = ""; render();
                toast("Semua data berhasil dipulihkan");
            }
        } catch (Exception e) {
            new AlertDialog.Builder(this).setTitle("Gagal memproses file")
                    .setMessage(e.getMessage() == null ? "File tidak dapat diproses" : e.getMessage())
                    .setPositiveButton("OK", null).show();
        }
    }
}
