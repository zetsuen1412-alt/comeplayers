package id.comeplayers.boostmonitor;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import java.util.HashMap;
import java.util.Map;

/** Status boosting dan riwayat tersimpan di perangkat; identitas dapat berasal dari payroll website. */
public final class EmployeeDb extends SQLiteOpenHelper {
    public static final String READY = "READY";
    public static final String IDLE = "IDLE";
    public static final String SLEEP = "SLEEP";
    public static final String WORK = "WORK";

    public static final class Employee {
        public long id, statusSince, createdAt;
        public String name, position, status, task, note, payrollId, payrollCode;
        public String orderRef, orderName, game, buyer;
        public boolean payrollManaged;
        /** Visible status stays stable; sleep duration is shown beside the status in the card. */
        public String visibleStatus() { return label(status); }
    }

    public static final class Event {
        public long id, employeeId, changedAt;
        public String employeeName, fromStatus, toStatus, note;
    }

    public static String label(String s) {
        if (s == null) return "-";
        switch (s) {
            case READY: return "Ready Boosting";
            case IDLE: return "Farming";
            case SLEEP: return "Tidur";
            case WORK: return "Sedang Bekerja";
            default: return s;
        }
    }

    public EmployeeDb(Context context) { super(context, "cp_boost_monitor.db", null, 4); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE employees (_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, position TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, task TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', status_since INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payroll_id TEXT UNIQUE, payroll_code TEXT, payroll_active INTEGER NOT NULL DEFAULT 1, order_ref TEXT NOT NULL DEFAULT '', order_name TEXT NOT NULL DEFAULT '', game TEXT NOT NULL DEFAULT '', buyer TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE events (_id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, employee_name TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', changed_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX events_employee_idx ON events(employee_id, changed_at)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE employees ADD COLUMN payroll_id TEXT");
            db.execSQL("ALTER TABLE employees ADD COLUMN payroll_code TEXT");
            db.execSQL("ALTER TABLE employees ADD COLUMN payroll_active INTEGER NOT NULL DEFAULT 1");
            db.execSQL("CREATE UNIQUE INDEX employee_payroll_idx ON employees(payroll_id)");
        }
        if (oldVersion < 3) removeNonFH3(db);
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE employees ADD COLUMN order_ref TEXT NOT NULL DEFAULT ''");
            db.execSQL("ALTER TABLE employees ADD COLUMN order_name TEXT NOT NULL DEFAULT ''");
            db.execSQL("ALTER TABLE employees ADD COLUMN game TEXT NOT NULL DEFAULT ''");
            db.execSQL("ALTER TABLE employees ADD COLUMN buyer TEXT NOT NULL DEFAULT ''");
        }
    }

    /** Menghapus data non-FH3 HANYA pada SQLite HP, tidak pada website payroll. */
    private static void removeNonFH3(SQLiteDatabase db) {
        db.execSQL("DELETE FROM events WHERE employee_id IN (" +
                "SELECT _id FROM employees WHERE payroll_id IS NULL OR position <> 'FH3')");
        db.execSQL("DELETE FROM employees WHERE payroll_id IS NULL OR position <> 'FH3'");
        db.execSQL("DELETE FROM events WHERE employee_id NOT IN (SELECT _id FROM employees)");
    }

    private static Employee readEmployee(Cursor c) {
        Employee e = new Employee();
        e.id = c.getLong(0); e.name = c.getString(1); e.position = c.getString(2);
        e.status = c.getString(3); e.task = c.getString(4); e.note = c.getString(5);
        e.statusSince = c.getLong(6); e.createdAt = c.getLong(7);
        e.payrollId = c.isNull(8) ? null : c.getString(8);
        e.payrollCode = c.isNull(9) ? null : c.getString(9);
        e.orderRef = c.getString(10); e.orderName = c.getString(11);
        e.game = c.getString(12); e.buyer = c.getString(13);
        e.payrollManaged = e.payrollId != null;
        return e;
    }

    public List<Employee> all() { return employees(false); }
    /** Hanya identitas karyawan dari Payroll Website; data manual lama tidak ditampilkan. */
    public List<Employee> payrollEmployees() {
        List<Employee> result = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT _id,name,position,status,task,note,status_since,created_at,payroll_id,payroll_code,order_ref,order_name,game,buyer " +
                "FROM employees WHERE payroll_active=1 AND payroll_id IS NOT NULL AND position='FH3' ORDER BY name COLLATE NOCASE", null)) {
            while (c.moveToNext()) result.add(readEmployee(c));
        }
        return result;
    }
    private List<Employee> employees(boolean includeInactive) {
        List<Employee> result = new ArrayList<>();
        String where = includeInactive ? "" : " WHERE payroll_active=1";
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT _id,name,position,status,task,note,status_since,created_at,payroll_id,payroll_code,order_ref,order_name,game,buyer FROM employees" + where + " ORDER BY name COLLATE NOCASE", null)) {
            while (c.moveToNext()) result.add(readEmployee(c));
        }
        return result;
    }
    /** Menggabungkan roster lengkap tanpa mengubah status boosting, tugas, atau riwayat lama. */
    public int[] syncRoster(JSONObject snapshot) throws JSONException {
        if (snapshot.optInt("schema") != 1 || !"FH3".equals(snapshot.optString("scope")) || !snapshot.has("revision"))
            throw new JSONException("Roster bukan khusus FH3. Sinkronisasi dibatalkan.");
        JSONArray list = snapshot.getJSONArray("employees");
        if (list.length() > 15000) throw new JSONException("Daftar FH3 terlalu besar; data lama dipertahankan.");
        Set<String> keys = new HashSet<>();
        Set<String> codes = new HashSet<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject x = list.getJSONObject(i);
            String id = x.getString("id").trim();
            String code = x.getString("code").trim();
            String name = x.getString("name").trim();
            String team = x.getString("team").trim();
            if (id.isEmpty() || id.length() > 200 || code.isEmpty() || code.length() > 100 || name.isEmpty() || name.length() > 160
                    || !team.equals("FH3")
                    || !keys.add(id) || !codes.add(code)) throw new JSONException("Data payroll duplikat/tidak valid. Sync dibatalkan.");
            x.getBoolean("active");
        }
        int added = 0, changed = 0, deactivated = 0;
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            long now = System.currentTimeMillis();
            for (int i = 0; i < list.length(); i++) {
                JSONObject x = list.getJSONObject(i);
                String id = x.getString("id").trim(), code = x.getString("code").trim();
                String name = x.getString("name").trim(), team = x.getString("team").trim();
                boolean active = x.getBoolean("active");
                long localId = 0;
                boolean alreadyCurrent = false;
                try (Cursor c = database.rawQuery("SELECT _id,name,position,payroll_code,payroll_active FROM employees WHERE payroll_id=?", new String[] {id})) {
                    if (c.moveToFirst()) {
                        localId = c.getLong(0);
                        alreadyCurrent = name.equals(c.getString(1)) && team.equals(c.getString(2))
                                && code.equals(c.getString(3)) && c.getInt(4) == (active ? 1 : 0);
                    }
                }
                if (localId == 0) {
                    // Migrasi data manual hanya bila nama+divisi cocok satu-satunya (hindari salah mengaitkan identitas).
                    try (Cursor c = database.rawQuery("SELECT _id FROM employees WHERE payroll_id IS NULL AND name=? COLLATE NOCASE AND position=?", new String[] {name, team})) {
                        if (c.moveToFirst()) { long candidate = c.getLong(0); if (!c.moveToNext()) localId = candidate; }
                    }
                }
                ContentValues v = new ContentValues();
                v.put("name", name); v.put("position", team); v.put("payroll_id", id); v.put("payroll_code", code);
                v.put("payroll_active", active ? 1 : 0); v.put("updated_at", now);
                if (localId > 0) {
                    if (!alreadyCurrent) {
                        database.update("employees", v, "_id=?", new String[] {String.valueOf(localId)});
                        changed++;
                    }
                }
                else {
                    v.put("status", IDLE); v.put("task", ""); v.put("note", "");
                    v.put("status_since", now); v.put("created_at", now);
                    long inserted = database.insertOrThrow("employees", null, v);
                    log(database, inserted, name, "", IDLE, "Karyawan baru dari payroll website", now);
                    added++;
                }
            }
            // ID di luar roster FH3 tidak boleh tertinggal di APK (mis. pindah divisi).
            List<Long> missing = new ArrayList<>();
            try (Cursor c = database.rawQuery("SELECT _id,payroll_id FROM employees WHERE payroll_id IS NOT NULL", null)) {
                while (c.moveToNext()) if (!keys.contains(c.getString(1))) missing.add(c.getLong(0));
            }
            for (Long id : missing) {
                String[] args = {String.valueOf(id)};
                database.delete("events", "employee_id=?", args);
                database.delete("employees", "_id=?", args);
                deactivated++;
            }
            removeNonFH3(database);
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
        return new int[] {added, changed, deactivated};
    }

    /**
     * Applies the active Telegram/boosting assignment snapshot. The endpoint must return
     * only FH3 assignments and identify employees by payroll id or code, never by name.
     */
    public int syncTasks(JSONObject snapshot) throws JSONException {
        if (snapshot.optInt("schema") != 1 || !"FH3".equals(snapshot.optString("scope"))
                || !snapshot.has("revision")) {
            throw new JSONException("Snapshot tugas bukan khusus FH3. Sinkronisasi dibatalkan.");
        }
        JSONArray list = snapshot.optJSONArray("tasks");
        if (list == null || list.length() > 15000) throw new JSONException("Daftar tugas tidak valid.");
        Map<String, java.util.List<JSONObject>> assignments = new HashMap<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject x = list.getJSONObject(i);
            String taskStatus = first(x, "status").toLowerCase(java.util.Locale.ROOT);
            if (!x.optBoolean("active", true) || "completed".equals(taskStatus) || "cancelled".equals(taskStatus)
                    || "canceled".equals(taskStatus) || "done".equals(taskStatus) || "closed".equals(taskStatus)) continue;
            String id = first(x, "employeeId", "payrollId");
            String code = first(x, "employeeCode", "payrollCode", "code");
            String key = !id.isEmpty() ? "id:" + id : (!code.isEmpty() ? "code:" + code : "");
            if (key.isEmpty()) throw new JSONException("Tugas tidak memiliki identitas karyawan.");
            java.util.List<JSONObject> employeeTasks = assignments.get(key);
            if (employeeTasks == null) { employeeTasks = new ArrayList<>(); assignments.put(key, employeeTasks); }
            employeeTasks.add(x);
            for (String field : new String[] {"orderRef", "orderName", "game", "buyer", "task"}) {
                String value = first(x, field);
                if (value.length() > 500) throw new JSONException("Data tugas terlalu panjang.");
            }
        }
        boolean replace = snapshot.optBoolean("complete", true) || snapshot.optBoolean("replace", false);
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        int updated = 0;
        try {
            long now = System.currentTimeMillis();
            if (replace) {
                ContentValues clear = new ContentValues();
                clear.put("task", ""); clear.put("order_ref", ""); clear.put("order_name", "");
                clear.put("game", ""); clear.put("buyer", ""); clear.put("updated_at", now);
                database.update("employees", clear,
                        "payroll_id IS NOT NULL AND payroll_active=1 AND "
                                + "(order_ref<>'' OR order_name<>'' OR game<>'' OR buyer<>'')", null);
            }
            for (Map.Entry<String, java.util.List<JSONObject>> entry : assignments.entrySet()) {
                java.util.List<JSONObject> employeeTasks = entry.getValue();
                JSONObject x = employeeTasks.get(0);
                String id = first(x, "employeeId", "payrollId");
                String code = first(x, "employeeCode", "payrollCode", "code");
                String where; String[] args;
                if (!id.isEmpty()) { where = "payroll_id=?"; args = new String[] {id}; }
                else { where = "payroll_code=?"; args = new String[] {code}; }
                ContentValues v = new ContentValues();
                String orderRef = joinUnique(employeeTasks, "orderRef", "order", "orderId");
                String orderName = joinUnique(employeeTasks, "orderName", "orderTitle");
                String game = joinUnique(employeeTasks, "game");
                String buyer = joinUnique(employeeTasks, "buyer", "buyerName");
                String task = joinUnique(employeeTasks, "task");
                v.put("task", task.isEmpty() ? orderRef : task);
                v.put("order_ref", orderRef); v.put("order_name", orderName);
                v.put("game", game); v.put("buyer", buyer);
                v.put("updated_at", now);
                int count = database.update("employees", v, where + " AND payroll_active=1 AND position='FH3'", args);
                updated += count;
            }
            if (!assignments.isEmpty() && updated == 0) {
                throw new JSONException("Tugas tidak cocok dengan roster FH3 di perangkat.");
            }
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
        return updated;
    }

    private static String first(JSONObject object, String... names) {
        for (String name : names) {
            String value = object.optString(name, "").trim();
            if (!value.isEmpty() && !"null".equalsIgnoreCase(value)) return value;
        }
        return "";
    }

    private static String joinUnique(java.util.List<JSONObject> objects, String... names) {
        StringBuilder result = new StringBuilder();
        Set<String> seen = new HashSet<>();
        for (JSONObject object : objects) {
            String value = first(object, names);
            if (value.isEmpty() || !seen.add(value)) continue;
            if (result.length() > 0) result.append(" • ");
            result.append(value);
        }
        return result.toString();
    }

    public long add(String name, String position, String status, String task, String note) {
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues v = new ContentValues();
            v.put("name", name); v.put("position", position); v.put("status", status);
            v.put("task", task); v.put("note", note); v.put("status_since", now);
            v.put("created_at", now); v.put("updated_at", now);
            long id = db.insertOrThrow("employees", null, v);
            log(db, id, name, "", status, "Karyawan ditambahkan", now);
            db.setTransactionSuccessful();
            return id;
        } finally { db.endTransaction(); }
    }

    public void edit(Employee e, String name, String position, String task, String note) {
        ContentValues v = new ContentValues();
        // Untuk identitas payroll, nama/divisi hanya boleh diubah dari website.
        if (!e.payrollManaged) { v.put("name", name); v.put("position", position); }
        v.put("task", task); v.put("note", note);
        v.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("employees", v, "_id=?", new String[]{String.valueOf(e.id)});
    }

    public boolean markWorkingAfterConfirmedTake(String code, String orderRef) {
        return markWorkingAfterConfirmedTake(code, null, orderRef);
    }

    private boolean markWorkingAfterConfirmedTake(String code, String expectedId, String orderRef) {
        if (code == null || orderRef == null || !orderRef.matches("X[0-9]{2,12}")) return false;
        Employee worker = null;
        List<Employee> roster = payrollEmployees();
        for (Employee e : roster) if (code.equalsIgnoreCase(e.payrollCode)) {
            if (worker != null) return false;
            worker = e;
        }
        if (worker == null || worker.payrollId == null || worker.payrollId.isEmpty()
                || (expectedId != null && !expectedId.equals(worker.payrollId))
                || !MonitorContract.canMarkWorking(worker.status)) return false;
        int identities = 0;
        for (Employee e : roster) if (worker.payrollId.equals(e.payrollId)) identities++;
        if (identities != 1) return false;
        changeStatus(worker, WORK, null, "Otomatis setelah TAKE " + orderRef + " terkonfirmasi");
        return true;
    }

    public int applyConfirmedTasks(JSONObject snapshot) throws JSONException {
        if (!MonitorContract.tasks(snapshot)) return 0;
        JSONArray tasks = snapshot.getJSONArray("tasks");
        if (tasks.length() > 15000) throw new JSONException("Terlalu banyak tugas aktif.");
        Set<String> seen = new HashSet<>();
        int changed = 0;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.getJSONObject(i);
            if (!MonitorContract.confirmedActiveTake(task)) continue;
            String code = task.getString("employeeCode");
            if (seen.add(code.toUpperCase(java.util.Locale.ROOT))
                    && markWorkingAfterConfirmedTake(code, task.getString("employeeId"), task.getString("orderRef"))) changed++;
        }
        return changed;
    }

    public void changeStatus(Employee e, String next, String task, String note) {
        if (e.status.equals(next)) return;
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues v = new ContentValues();
            v.put("status", next); v.put("status_since", now); v.put("updated_at", now);
            // Keep server-provided order context when a user changes only local status.
            if (WORK.equals(next) && task != null && !task.trim().isEmpty()) v.put("task", task.trim());
            db.update("employees", v, "_id=?", new String[]{String.valueOf(e.id)});
            log(db, e.id, e.name, e.status, next, note, now);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    private static void log(SQLiteDatabase db, long id, String name, String from, String to, String note, long at) {
        ContentValues v = new ContentValues();
        v.put("employee_id", id); v.put("employee_name", name);
        v.put("from_status", from); v.put("to_status", to); v.put("note", note); v.put("changed_at", at);
        db.insertOrThrow("events", null, v);
    }

    private boolean payrollActive(long id) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT payroll_active FROM employees WHERE _id=?", new String[] {String.valueOf(id)})) {
            return c.moveToFirst() && c.getInt(0) == 1;
        }
    }
    public void delete(long id) {
        getWritableDatabase().delete("employees", "_id=? AND payroll_id IS NULL", new String[]{String.valueOf(id)});
    }

    public List<Event> history(long employeeId) {
        List<Event> result = new ArrayList<>();
        String where = employeeId > 0 ? " WHERE employee_id=?" : "";
        String[] args = employeeId > 0 ? new String[]{String.valueOf(employeeId)} : null;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT _id,employee_id,employee_name,from_status,to_status,note,changed_at FROM events" + where + " ORDER BY changed_at DESC,_id DESC LIMIT 1500", args)) {
            while (c.moveToNext()) {
                Event e = new Event();
                e.id = c.getLong(0); e.employeeId = c.getLong(1); e.employeeName = c.getString(2);
                e.fromStatus = c.getString(3); e.toStatus = c.getString(4);
                e.note = c.getString(5); e.changedAt = c.getLong(6);
                result.add(e);
            }
        }
        return result;
    }

    public JSONObject backup(long thresholdMinutes) throws JSONException {
        JSONObject root = new JSONObject();
        root.put("schema", 3); root.put("sleepThresholdMinutes", thresholdMinutes);
        JSONArray employees = new JSONArray(), events = new JSONArray();
        for (Employee e : employees(true)) {
            JSONObject o = new JSONObject();
            o.put("id", e.id); o.put("name", e.name); o.put("position", e.position);
            o.put("status", e.status); o.put("task", e.task); o.put("note", e.note);
            o.put("orderRef", e.orderRef); o.put("orderName", e.orderName);
            o.put("game", e.game); o.put("buyer", e.buyer);
            o.put("statusSince", e.statusSince); o.put("createdAt", e.createdAt);
            o.put("payrollId", e.payrollId == null ? JSONObject.NULL : e.payrollId);
            o.put("payrollCode", e.payrollCode == null ? JSONObject.NULL : e.payrollCode);
            o.put("payrollActive", e.payrollManaged ? payrollActive(e.id) : true);
            employees.put(o);
        }
        // Export seluruh riwayat, tidak hanya 1500 catatan yang terlihat di layar.
        try (Cursor c = getReadableDatabase().rawQuery("SELECT _id,employee_id,employee_name,from_status,to_status,note,changed_at FROM events ORDER BY _id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0)); o.put("employeeId", c.getLong(1));
                o.put("employeeName", c.getString(2)); o.put("fromStatus", c.getString(3));
                o.put("toStatus", c.getString(4)); o.put("note", c.getString(5));
                o.put("changedAt", c.getLong(6)); events.put(o);
            }
        }
        root.put("employees", employees); root.put("events", events);
        return root;
    }

    public void restore(JSONObject root) throws JSONException {
        if (root.optInt("schema", -1) != 1 && root.optInt("schema", -1) != 2 && root.optInt("schema", -1) != 3) throw new JSONException("Versi backup tidak didukung");
        JSONArray employees = root.getJSONArray("employees");
        JSONArray events = root.getJSONArray("events");
        // Validasi seluruh data sebelum transaksi untuk mencegah backup rusak menimpa data.
        for (int i = 0; i < employees.length(); i++) {
            JSONObject x = employees.getJSONObject(i);
            String status = x.getString("status");
            if (!READY.equals(status) && !IDLE.equals(status) && !SLEEP.equals(status) && !WORK.equals(status)) throw new JSONException("Status tidak valid");
            if (x.getString("name").trim().isEmpty() || x.getLong("id") <= 0 || x.getLong("statusSince") <= 0) throw new JSONException("Data karyawan tidak valid");
        }
        for (int i = 0; i < events.length(); i++) {
            JSONObject x = events.getJSONObject(i);
            x.getLong("id"); x.getLong("employeeId"); x.getString("employeeName");
            x.getString("fromStatus"); x.getString("toStatus"); x.getLong("changedAt");
        }
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("events", null, null); db.delete("employees", null, null);
            long now = System.currentTimeMillis();
            for (int i = 0; i < employees.length(); i++) {
                JSONObject x = employees.getJSONObject(i); ContentValues v = new ContentValues();
                v.put("_id", x.getLong("id")); v.put("name", x.getString("name"));
                v.put("position", x.optString("position", "")); v.put("status", x.getString("status"));
                v.put("task", x.optString("task", "")); v.put("note", x.optString("note", ""));
                if (root.optInt("schema") >= 3) {
                    v.put("order_ref", x.optString("orderRef", ""));
                    v.put("order_name", x.optString("orderName", ""));
                    v.put("game", x.optString("game", ""));
                    v.put("buyer", x.optString("buyer", ""));
                }
                v.put("status_since", x.getLong("statusSince")); v.put("created_at", x.getLong("createdAt"));
                v.put("updated_at", now);
                if (root.optInt("schema") >= 2) {
                    if (!x.isNull("payrollId")) v.put("payroll_id", x.getString("payrollId"));
                    if (!x.isNull("payrollCode")) v.put("payroll_code", x.getString("payrollCode"));
                    v.put("payroll_active", x.optBoolean("payrollActive", true) ? 1 : 0);
                }
                db.insertOrThrow("employees", null, v);
            }
            for (int i = 0; i < events.length(); i++) {
                JSONObject x = events.getJSONObject(i); ContentValues v = new ContentValues();
                v.put("_id", x.getLong("id")); v.put("employee_id", x.getLong("employeeId"));
                v.put("employee_name", x.getString("employeeName")); v.put("from_status", x.getString("fromStatus"));
                v.put("to_status", x.getString("toStatus")); v.put("note", x.optString("note", ""));
                v.put("changed_at", x.getLong("changedAt")); db.insertOrThrow("events", null, v);
            }
            removeNonFH3(db); // Backup versi lama tak boleh mengembalikan divisi lain.
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
}
