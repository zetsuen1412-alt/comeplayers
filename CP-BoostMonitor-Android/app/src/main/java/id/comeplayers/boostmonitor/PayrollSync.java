package id.comeplayers.boostmonitor;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Scoped HTTPS integration: payroll roster read-only; boosting statuses stay locally managed. */
final class PayrollSync {
    private static final String BASE = "https://www.comeplayers.com/api/admin/payroll/mobile";
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    interface Done { void accept(String message, boolean ok); }
    interface DataDone { void accept(JSONObject data, String message, boolean ok); }

    private final SecureSession session;
    private final EmployeeDb db;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean syncing = false;

    PayrollSync(SecureSession session, EmployeeDb db) { this.session = session; this.db = db; }

    boolean hasSession() { return session.exists(); }
    void logout() { session.clear(); }
    void shutdown() { executor.shutdown(); }

    void login(String email, String password, Done callback) {
        executor.execute(() -> {
            try {
                JSONObject input = new JSONObject();
                input.put("action", "login"); input.put("email", email); input.put("password", password);
                JSONObject result = call("POST", "/session", input, null);
                // Login hanya dianggap berhasil sesudah data karyawan website tersimpan.
                JSONObject roster = call("GET", "/roster", null, result.getString("accessToken"));
                db.syncRoster(roster);
                session.save(result);
                int tasks = 0;
                String taskWarning = "";
                try { tasks = syncTasks(result.getString("accessToken")); }
                catch (Exception taskError) { taskWarning = " Tugas order belum tersinkron; coba Perbarui dari Payroll."; }
                finish(callback, "Berhasil mengambil " + db.payrollEmployees().size()
                        + " nama karyawan dan " + tasks + " tugas aktif dari Payroll Website (revisi " + roster.optLong("revision") + ")." + taskWarning, true);
            } catch (Exception e) { finish(callback, friendly(e), false); }
        });
    }

    void sync(Done callback) {
        executor.execute(() -> {
            try {
                JSONObject credentials = session.load();
                if (credentials == null) { finish(callback, "Hubungkan akun payroll dahulu.", false); return; }
                if (credentials.optLong("expiresAt") <= System.currentTimeMillis() / 1000L + 120L)
                    credentials = refresh(credentials);
                JSONObject snapshot;
                try {
                    snapshot = call("GET", "/roster", null, credentials.getString("accessToken"));
                } catch (ApiException error) {
                    if (error.status != 401) throw error;
                    credentials = refresh(credentials);
                    snapshot = call("GET", "/roster", null, credentials.getString("accessToken"));
                }
                int[] changed = db.syncRoster(snapshot);
                int tasks = 0;
                String taskWarning = "";
                try { tasks = syncTasks(credentials.getString("accessToken")); }
                catch (Exception taskError) { taskWarning = " • tugas order belum tersinkron"; }
                finish(callback, "Payroll tersinkron: " + db.payrollEmployees().size() + " aktif"
                        + " • baru " + changed[0] + ", diperbarui " + changed[1]
                        + ", nonaktif " + changed[2] + " • tugas aktif " + tasks
                        + taskWarning + " • revisi " + snapshot.optLong("revision"), true);
            } catch (Exception e) { finish(callback, friendly(e), false); }
        });
    }

    private JSONObject refresh(JSONObject credentials) throws Exception {
        JSONObject payload = new JSONObject(); payload.put("action", "refresh");
        payload.put("refreshToken", credentials.getString("refreshToken"));
        JSONObject fresh = call("POST", "/session", payload, null);
        session.save(fresh); return fresh;
    }

    /** Fetches active tasks directly from Payroll. Older servers may not expose it yet. */
    private int syncTasks(String token) throws Exception {
        try {
            JSONObject snapshot = call("GET", "/tasks", null, token);
            return db.syncTasks(snapshot);
        } catch (ApiException error) {
            // Keep roster login compatible while the website endpoint is rolled out.
            if (error.status == 404 || error.status == 405) return 0;
            throw error;
        }
    }

    /** Only website admins may read/assign pending FH3 orders. Never persist the queue in SQLite. */
    void loadPendingOrders(DataDone callback) {
        executor.execute(() -> {
            try {
                JSONObject result = authorizedCall("GET", "/pending", null);
                if (result.optInt("schema") != 2 || !"FH3".equals(result.optString("scope"))
                        || !"payroll".equals(result.optString("source"))
                        || result.optJSONArray("pending") == null)
                    throw new IllegalStateException("Daftar order tidak valid.");
                main.post(() -> callback.accept(result, "", true));
            } catch (Exception error) {
                String message = friendly(error);
                main.post(() -> callback.accept(null, message, false));
            }
        });
    }

    /** Persist to website/Telegram atomically; caller refreshes tasks after success. */
    void assignOrder(String orderRef, String employeeCode, Done callback) {
        executor.execute(() -> {
            try {
                JSONObject input = new JSONObject();
                input.put("orderRef", orderRef);
                input.put("employeeCode", employeeCode);
                JSONObject result = authorizedCall("POST", "/assign", input);
                if (!result.optBoolean("ok")) throw new IllegalStateException("Penugasan belum dikonfirmasi website.");
                finish(callback, "Order " + result.optString("orderRef", orderRef) + " ditugaskan ke "
                        + result.optString("employeeName", employeeCode) + " dan tersimpan di website.", true);
            } catch (Exception error) { finish(callback, friendly(error), false); }
        });
    }

    private JSONObject authorizedCall(String method, String path, JSONObject payload) throws Exception {
        JSONObject credentials = session.load();
        if (credentials == null) throw new ApiException(401, "Login Payroll diperlukan.");
        if (credentials.optLong("expiresAt") <= System.currentTimeMillis() / 1000L + 120L)
            credentials = refresh(credentials);
        try {
            return call(method, path, payload, credentials.getString("accessToken"));
        } catch (ApiException error) {
            if (error.status != 401) throw error;
            credentials = refresh(credentials);
            return call(method, path, payload, credentials.getString("accessToken"));
        }
    }

    private void finish(Done cb, String message, boolean ok) { main.post(() -> cb.accept(message, ok)); }

    private static String friendly(Exception e) {
        if (e instanceof ApiException) return e.getMessage();
        if (e instanceof java.net.SocketTimeoutException) return "Koneksi payroll terlalu lama. Data lama tetap tersimpan.";
        return "Sinkronisasi gagal. Periksa internet, izin akun, dan koneksi website. Data lama tetap aman.";
    }

    private static JSONObject call(String method, String suffix, JSONObject json, String token) throws Exception {
        URL target = new URL(BASE + suffix);
        HttpURLConnection c = (HttpURLConnection) target.openConnection();
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(12000); c.setReadTimeout(16000);
        c.setRequestMethod(method); c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Cache-Control", "no-store");
        if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (json != null) {
                c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = c.getOutputStream()) {
                    out.write(json.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = c.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? c.getInputStream() : c.getErrorStream();
            if (stream == null) throw new ApiException(status, "Server payroll tidak mengembalikan jawaban.");
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            try (InputStream in = stream) {
                byte[] buffer = new byte[4096]; int n, bytes = 0;
                while ((n = in.read(buffer)) != -1) {
                    bytes += n;
                    if (bytes > MAX_BYTES) throw new IllegalStateException("Respon payroll melebihi batas aman.");
                    data.write(buffer, 0, n);
                }
            }
            JSONObject result;
            try { result = new JSONObject(new String(data.toByteArray(), StandardCharsets.UTF_8)); }
            catch (org.json.JSONException error) {
                if (status < 200 || status >= 300)
                    throw new ApiException(status, "Akses payroll ditolak (" + status + ").");
                throw error;
            }
            if (status < 200 || status >= 300) throw new ApiException(status, result.optString("error", "Akses payroll ditolak (" + status + ")."));
            return result;
        } finally { c.disconnect(); }
    }

    private static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }
}
