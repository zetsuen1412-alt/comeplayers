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
    private static final int PURPLE = Color.rgb(79, 70, 229);
    private static final int BORDER = Color.rgb(229, 231, 235);
    private static final int WHITE = Color.WHITE;
    private static final String[] STATUS = {EmployeeDb.READY, EmployeeDb.IDLE, EmployeeDb.SLEEP, EmployeeDb.WORK};
    private static final String[] STATUS_LABEL = {"Ready Boosting", "Farming", "Tidur", "Sedang Bekerja"};
    private static final int CSV = 401, BACKUP = 402, RESTORE = 403;

    private EmployeeDb db;
    private SharedPreferences prefs;
    private PayrollSync payroll;
    private boolean syncBusy = false;
    private final Runnable payrollTicker = new Runnable() {
        @Override public void run() {
            refreshPayroll(false);
            handler.postDelayed(this, 120000L); // sepanjang aplikasi aktif
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
        payroll = new PayrollSync(new SecureSession(this), db);
        render();
    }
    @Override protected void onResume() {
        super.onResume(); handler.removeCallbacks(ticker); handler.postDelayed(ticker, 60000);
        handler.removeCallbacks(payrollTicker); handler.post(payrollTicker);
    }
    @Override protected void onPause() {
        handler.removeCallbacks(ticker); handler.removeCallbacks(payrollTicker); super.onPause();
    }
    @Override protected void onDestroy() { payroll.shutdown(); db.close(); super.onDestroy(); }

    private boolean linked() { return payroll.hasSession(); }
    private void refreshPayroll(boolean manual) {
        if (syncBusy || !linked()) {
            if (manual && !linked()) loginDialog();
            return;
        }
        syncBusy = true;
        payroll.sync((message, ok) -> {
            syncBusy = false;
            if (ok) prefs.edit().putLong("payroll_last_sync", now()).putString("payroll_sync_message", message).remove("payroll_sync_error").apply();
            else prefs.edit().putString("payroll_sync_error", message).apply();
            if (manual || !ok) toast(message);
            render();
        });
    }

    private void loginDialog() {
        LinearLayout form = form();
        form.addView(text("Masuk memakai email dan password akun yang memiliki akses Payroll ComePlayers.", 13, SUB, false));
        space(form, 8);
        EditText email = input("Email payroll", "");
        email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = input("Password", "");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(email); form.addView(password);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Hubungkan Payroll Website")
                .setView(form).setNegativeButton("Batal", null).setPositiveButton("Login", null).create();
        dialog.setOnShowListener(x -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (!trim(email).contains("@")) { email.setError("Masukkan email akun payroll."); return; }
            if (trim(password).isEmpty()) { password.setError("Password harus diisi."); return; }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            payroll.login(trim(email), password.getText().toString(), (message, ok) -> {
                password.setText("");
                if (ok) {
                    prefs.edit().putBoolean("payroll_linked", true).putLong("payroll_last_sync", now())
                            .putString("payroll_sync_message", message).remove("payroll_sync_error").apply();
                    dialog.dismiss();
                    filter = "SEMUA"; search = ""; page = "Karyawan";
                    render(); toast(message);
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
    private long threshold() { return prefs.getLong("sleep_limit", 120); }
    private long now() { return System.currentTimeMillis(); }
    private String time(long millis) { return new SimpleDateFormat("dd MMM yyyy, HH:mm", new Locale("id", "ID")).format(new Date(millis)); }
    private String duration(long since) {
        long minutes = Math.max(0, (now() - since) / 60000);
        if (minutes < 60) return minutes + " menit";
        long hours = minutes / 60;
        if (hours < 24) return hours + " jam " + minutes % 60 + " menit";
        return (hours / 24) + " hari " + (hours % 24) + " jam";
    }
    private boolean overdue(EmployeeDb.Employee e) { return EmployeeDb.SLEEP.equals(e.status) && Math.max(0, now() - e.statusSince) >= threshold() * 60000L; }
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
        header.addView(text("CP  /  BOOST MONITOR", 20, WHITE, true));
        space(header, 4);
        header.addView(text("Pantau kesiapan tim boosting", 12, 0xffc7d2fe, false));
        root.addView(header, lp(-1, -2));
        // Selalu gunakan roster payroll, jangan tampilkan angka nol mode lokal tanpa login.
        if (!linked()) {
            LinearLayout gate = vertical(); gate.setPadding(dp(25), dp(48), dp(25), 0);
            gate.addView(text("Hubungkan Karyawan Payroll", 23, INK, true));
            space(gate, 12);
            gate.addView(text("Hanya nama karyawan FH3 dari Payroll → Karyawan. Divisi lain dibersihkan dari APK.", 14, SUB, false));
            space(gate, 14);
            gate.addView(text("Login sekali dengan akun yang memiliki izin Payroll. Data diambil saat login, lalu diperbarui tiap 2 menit selama APK aktif.", 13, SUB, false));
            space(gate, 20);
            Button login = button("Login & Ambil Karyawan dari Website", true);
            gate.addView(login, lp(-1, 55));
            login.setOnClickListener(v -> loginDialog()); root.addView(gate); return;
        }
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(false);
        body = vertical(); body.setPadding(dp(15), dp(18), dp(15), dp(22));
        scroll.addView(body); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if ("Dashboard".equals(page)) dashboard();
        else if ("Karyawan".equals(page)) employeesPage();
        else if ("Riwayat".equals(page)) historyPage();
        else settingsPage();
        navigation();
    }

    private void navigation() {
        LinearLayout nav = horizontal(); nav.setBackgroundColor(WHITE);
        String[] pages = {"Dashboard", "Karyawan", "Riwayat", "Pengaturan"};
        String[] symbols = {"▦", "♙", "◷", "⚙"};
        for (int i = 0; i < pages.length; i++) {
            final String dest = pages[i];
            TextView t = text(symbols[i] + "\n" + dest, 11, page.equals(dest) ? PURPLE : SUB, page.equals(dest));
            t.setGravity(Gravity.CENTER); t.setPadding(0, dp(11), 0, dp(11));
            nav.addView(t, new LinearLayout.LayoutParams(0, dp(62), 1));
            t.setOnClickListener(v -> { page = dest; if (!"Riwayat".equals(dest)) historyEmployee = 0; render(); });
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
        int ready = 0, idle = 0, sleeping = 0, late = 0, working = 0;
        List<EmployeeDb.Employee> priority = new ArrayList<>();
        List<EmployeeDb.Employee> available = new ArrayList<>();
        for (EmployeeDb.Employee e : all) {
            switch (e.status) {
                case EmployeeDb.READY: ready++; available.add(e); break;
                case EmployeeDb.IDLE: idle++; break;
                case EmployeeDb.SLEEP: if (overdue(e)) { late++; priority.add(e); } else sleeping++; break;
                case EmployeeDb.WORK: working++; break;
            }
        }
        summaryRow("🟢 Ready Boosting", ready, "READY", "🔵 Sedang Bekerja", working, "WORK");
        summaryRow("🟠 Farming", idle, "IDLE", "🌙 Tidur", sleeping, "SLEEP");
        summarySingle("🚨 Tidur Terlalu Lama", late, "LATE");
        space(body, 18);
        space(body, 23);
        body.addView(text("Perlu Diperhatikan", 18, INK, true)); space(body, 10);
        if (priority.isEmpty()) info("Tidak ada karyawan yang melewati batas waktu tidur.");
        else {
            priority.sort((a, b) -> Long.compare(a.statusSince, b.statusSince));
            for (EmployeeDb.Employee e : priority) employeeCard(body, e, false);
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
        addChip(second, "Farming", "IDLE"); addChip(second, "Tidur", "SLEEP"); addChip(second, "Tidur Lama", "LATE");
        wraps.addView(first); space(wraps, 8); wraps.addView(second);
        chipScroll.addView(wraps); body.addView(chipScroll, lp(-1, -2)); space(body, 14);
        employeesContainer = vertical(); body.addView(employeesContainer, lp(-1, -2)); fillEmployees();
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
            if (!"SEMUA".equals(filter) && !("LATE".equals(filter) ? overdue(e) : filter.equals(e.status) && !("SLEEP".equals(filter) && overdue(e)))) continue;
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
        TextView status = text(e.visibleStatus(threshold(), now()), 11, overdue(e) ? 0xffb91c1c : tint(e.status), true);
        status.setBackground(shape(overdue(e) ? 0xffffe4e6 : 0xfff3f4f6, 9));
        status.setPadding(dp(9), dp(7), dp(9), dp(7)); title.addView(status); p.addView(title);
        if (!e.position.isEmpty()) { space(p, 5); p.addView(text(e.position + (e.payrollManaged ? " • " + e.payrollCode + " • Payroll" : ""), 13, SUB, false)); }
        space(p, 10);
        p.addView(text("⏱ " + duration(e.statusSince) + "  •  Sejak " + time(e.statusSince), 12, SUB, false));
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
        heading("Pengaturan & Data", "Integrasi payroll, batas tidur, dan backup.");
        LinearLayout integration = panel();
        integration.addView(text("Integrasi Payroll ComePlayers", 17, INK, true)); space(integration, 7);
        integration.addView(text("Sumber: www.comeplayers.com • divisi FH1, FH2, FH3 dan data karyawan payroll lainnya.", 12, SUB, false));
        space(integration, 7);
        integration.addView(text(linked() ? "✓ " + db.payrollEmployees().size() + " nama FH3 dari website • sinkron setiap 2 menit saat aktif."
                    : "Belum login ke Payroll ComePlayers.", 13, SUB, false));
        space(integration, 11);
        if (!linked()) {
            Button login = button("Login & Hubungkan Payroll", true);
            integration.addView(login, lp(-1, 44)); login.setOnClickListener(v -> loginDialog());
        } else {
            Button update = button("↻ Sinkronkan Nama Sekarang", true);
            integration.addView(update, lp(-1, 44)); update.setOnClickListener(v -> refreshPayroll(true));
            space(integration, 8);
            Button logout = button("Keluar dari Akun Payroll", false);
            integration.addView(logout, lp(-1, 44));
            logout.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Keluar dari Payroll?")
                    .setMessage("Daftar dan riwayat lokal tidak dihapus, tetapi aplikasi akan meminta login ulang.")
                    .setNegativeButton("Batal", null).setPositiveButton("Keluar", (d, w) -> {
                        payroll.logout(); prefs.edit().remove("payroll_linked").apply(); render();
                    }).show());
        }
        body.addView(integration, lp(-1, -2)); space(body, 14);
        LinearLayout settings = panel();
        settings.addView(text("Batas Tidur Terlalu Lama", 16, INK, true)); space(settings, 7);
        settings.addView(text("Saat ini: " + threshold() + " menit. Status Tidur berubah menjadi Tidur Lama secara otomatis saat melewati batas.", 13, SUB, false));
        space(settings, 11);
        Button change = button("Ubah Batas Tidur", true); settings.addView(change, lp(-1, 43));
        change.setOnClickListener(v -> thresholdDialog());
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
    private void thresholdDialog() {
        LinearLayout form = form(); EditText minutes = input("Menit", String.valueOf(threshold()));
        minutes.setInputType(InputType.TYPE_CLASS_NUMBER); form.addView(minutes);
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Batas Tidur Lama (menit)").setView(form)
                .setNegativeButton("Batal", null).setPositiveButton("Simpan", null).create();
        d.setOnShowListener(x -> d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                long value = Long.parseLong(trim(minutes));
                if (value < 1 || value > 10080) { minutes.setError("Masukkan 1–10080 menit"); return; }
                prefs.edit().putLong("sleep_limit", value).apply(); d.dismiss(); render();
            } catch (NumberFormatException ex) { minutes.setError("Isi angka yang valid"); }
        })); d.show();
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
            String[] cols = {e.name, e.position, e.visibleStatus(threshold(), now()),
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
        try {
            if (requestCode == CSV || requestCode == BACKUP) {
                String contents = requestCode == CSV ? "\ufeff" + csvContent() : db.backup(threshold()).toString(2);
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
