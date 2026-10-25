package id.comeplayers.boostmonitor;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Telegram-backed FH3 workflow over HTTPS. All bot credentials remain on the website. */
final class PayrollSync {
    private static final String BASE = "https://www.comeplayers.com/api/admin/payroll/mobile";
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    interface Done { void accept(String message, boolean ok); }
    interface DataDone { void accept(JSONObject data, String message, boolean ok); }

    private final android.content.SharedPreferences identity;
    private final SecureSession session;
    private final EmployeeDb db;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean syncing = false;
    private long sessionVersion = 0;
    private final Object sessionGuard = new Object();

    PayrollSync(SecureSession session, EmployeeDb db, android.content.Context context) { this.session = session; this.db = db; this.identity=context.getSharedPreferences("monitor_identity",android.content.Context.MODE_PRIVATE); }
    private void rememberIdentity(JSONObject roster) { identity.edit().putBoolean("isAdmin",roster.optBoolean("isAdmin")).putString("accountId",roster.optString("accountId")).putString("username",roster.optString("username")).apply(); }

    boolean hasSession() { return session.exists(); }
    void logout() { synchronized (sessionGuard) { sessionVersion++; session.clear(); identity.edit().clear().apply(); } }
    void shutdown() { executor.shutdownNow(); }

    void login(String email, String password, Done callback) {
        final long secureVersion=session.revision();
        final long version;
        synchronized (sessionGuard) { version = ++sessionVersion; }
        executor.execute(() -> {
            try {
                JSONObject input = new JSONObject();
                input.put("action", "login"); input.put("username", email); input.put("password", password);
                JSONObject result = call("POST", "/session", input, null);
                // Login hanya dianggap berhasil sesudah data karyawan website tersimpan.
                JSONObject roster = call("GET", "/roster", null, result.getString("accessToken"));
                synchronized (sessionGuard) {
                    if (version != sessionVersion) throw new IOException("Sesi sudah berubah.");
                    db.syncRoster(roster); session.saveIfVersion(secureVersion,result); rememberIdentity(roster);
                }
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
                int[] changed = db.syncRoster(snapshot); rememberIdentity(snapshot);
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
        final long secureVersion=session.revision();
        final long version;
        synchronized (sessionGuard) {
            JSONObject current = session.load();
            if (current == null || !current.optString("refreshToken").equals(credentials.optString("refreshToken")))
                throw new IOException("Sesi berubah; login kembali.");
            version = sessionVersion;
        }
        JSONObject payload = new JSONObject(); payload.put("action", "refresh");
        payload.put("refreshToken", credentials.getString("refreshToken"));
        JSONObject fresh = call("POST", "/session", payload, null);
        synchronized (sessionGuard) {
            if (version != sessionVersion) throw new IOException("Sesi berubah; login kembali.");
            session.saveIfVersion(secureVersion,fresh);
        }
        return fresh;
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
                if (!MonitorContract.pending(result))
                    throw new IllegalStateException("Daftar order tidak valid.");
                main.post(() -> callback.accept(result, "", true));
            } catch (Exception error) {
                String message = friendly(error);
                main.post(() -> callback.accept(null, message, false));
            }
        });
    }

    /** Assignment and TAKE can have different outcomes; never lose a committed assignment. */
    void assignOrder(String orderRef, String employeeCode, DataDone callback) {
        orderAction("/assign", orderRef, employeeCode, callback);
    }

    /** Deliberate retry only. Server refuses uncertain or duplicate TAKE deliveries. */
    void takeOrder(String orderRef, String employeeCode, DataDone callback) {
        orderAction("/take", orderRef, employeeCode, callback);
    }

    private void orderAction(String path, String orderRef, String employeeCode, DataDone callback) {
        executor.execute(() -> {
            try {
                JSONObject input = new JSONObject();
                input.put("orderRef", orderRef);
                input.put("employeeCode", employeeCode);
                JSONObject result = authorizedCall("POST", path, input);
                if (!MonitorContract.confirmedTake(result))
                    throw new IllegalStateException("TAKE belum dikonfirmasi. Segarkan Tugas dan periksa Telegram.");
                main.post(() -> callback.accept(result, "✓ TAKE " + orderRef
                        + " / " + employeeCode + " diterima Telegram dan tercatat di website.", true));
            } catch (Exception error) {
                JSONObject details = error instanceof ApiException ? ((ApiException) error).details : null;
                main.post(() -> callback.accept(details, friendly(error), false));
            }
        });
    }

    /** Individual active order cards (not a merged text field on the employee row). */
    void loadActiveTasks(DataDone callback) {
        executor.execute(() -> {
            try {
                JSONObject result = authorizedCall("GET", "/tasks", null);
                if (!MonitorContract.tasks(result))
                    throw new IOException("Daftar tugas aktif tidak valid.");
                main.post(() -> callback.accept(result, "", true));
            } catch (Exception error) {
                main.post(() -> callback.accept(null, friendly(error), false));
            }
        });
    }

    void loadEarnings(String employeeCode, int offset, DataDone callback) { request("GET","/books",null,callback); }
    void request(String method,String path,JSONObject body,DataDone callback) {
        executor.execute(()->{try {JSONObject result=authorizedCall(method,path,body);
            main.post(()->callback.accept(result,"",true));}
            catch(Exception e){main.post(()->callback.accept(null,friendly(e),false));}});
    }

    /** Check website's actual Telegram bot and FH3 group without sending any photos. */
    void checkProofGroup(Done callback) {
        executor.execute(() -> {
            try {
                JSONObject result = authorizedCall("GET", "/proof-setup", null);
                if (!result.optBoolean("ready")) throw new IOException(
                        result.optString("error", "Grup Telegram FH3 belum siap."));
                finish(callback, "✓ Grup Telegram terhubung: "
                        + result.optString("liveTitle", "EVO Ilham FH3")
                        + "\nBot Payroll Website dapat mengakses grup. Belum ada foto yang dikirim.", true);
            } catch (Exception error) { finish(callback, friendly(error), false); }
        });
    }

    /**
     * User-selected screenshot is sent straight to the website over HTTPS.
     * The website exclusively owns Telegram credentials and resolves the trusted FH3 chat.
     * No automatic retries for photo uploads: Telegram does not support idempotency keys.
     */
    void sendProof(String orderRef, String employeeCode, String action,
                   Uri photo, ContentResolver resolver, Done callback) {
        executor.execute(() -> {
            try {
                if (!"start".equals(action) && !"done".equals(action))
                    throw new IOException("Aksi order tidak valid.");
                String mime = resolver.getType(photo);
                if (!"image/png".equals(mime) && !"image/jpeg".equals(mime))
                    throw new IOException("Pilih foto PNG atau JPEG.");
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                try (InputStream input = resolver.openInputStream(photo)) {
                    if (input == null) throw new IOException("Tidak dapat membaca foto.");
                    byte[] chunk = new byte[8192]; int count;
                    while ((count = input.read(chunk)) != -1) {
                        if (buffer.size() + count > 7 * 1024 * 1024)
                            throw new IOException("Foto melebihi 7 MB. Pilih gambar lebih kecil.");
                        buffer.write(chunk, 0, count);
                    }
                }
                byte[] bytes = buffer.toByteArray();
                if (bytes.length < 16) throw new IOException("Gambar kosong/tidak lengkap.");
                JSONObject credentials = session.load();
                if (credentials == null) throw new IOException("Login Payroll diperlukan.");
                if (credentials.optLong("expiresAt") <= System.currentTimeMillis() / 1000L + 120L)
                    credentials = refresh(credentials);
                JSONObject result = sendPhotoRequest(orderRef, employeeCode, action, mime, bytes,
                        credentials.getString("accessToken"));
                if (!result.optBoolean("ok")) throw new IOException("Website belum mengonfirmasi foto.");
                finish(callback, "✓ " + result.optString("caption", orderRef + "/" + action)
                        + "\nBukti telah diterima grup Telegram "
                        + result.optString("chatTitle", "FH3") + " dan status disimpan di website.", true);
            } catch (Exception error) {
                finish(callback, error.getMessage() == null ? "Pengiriman bukti gagal; periksa Telegram sebelum mengulang."
                        : error.getMessage(), false);
            }
        });
    }

    private static JSONObject sendPhotoRequest(String orderRef, String employeeCode,
            String action, String mime, byte[] photo, String token) throws Exception {
        final String boundary = "cpProof" + Long.toHexString(System.nanoTime());
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + "/progress").openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(14000); connection.setReadTimeout(75000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        connection.setDoOutput(true);
        connection.setChunkedStreamingMode(8192);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                writeField(output, boundary, "orderRef", orderRef);
                writeField(output, boundary, "employeeCode", employeeCode);
                writeField(output, boundary, "action", action);
                String header = "--" + boundary + "\r\nContent-Disposition: form-data; name=" + (char)34 + "photo" + (char)34
                        + "; filename=" + (char)34 + "evidence.jpg" + (char)34 + "\r\n"
                        + "Content-Type: " + mime + "\r\n\r\n";
                output.write(header.getBytes(StandardCharsets.UTF_8));
                output.write(photo);
                output.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) throw new IOException("Website tidak memberi jawaban; periksa grup Telegram.");
            ByteArrayOutputStream reply = new ByteArrayOutputStream();
            try (InputStream input = stream) {
                byte[] chunk = new byte[4096]; int n;
                while ((n = input.read(chunk)) != -1) {
                    if (reply.size() + n > 64 * 1024) throw new IOException("Respons server terlalu besar.");
                    reply.write(chunk, 0, n);
                }
            }
            JSONObject result = new JSONObject(new String(reply.toByteArray(), StandardCharsets.UTF_8));
            if (status < 200 || status >= 300)
                throw new ApiException(status, result.optString("error",
                        "Pengiriman belum dikonfirmasi; cek grup Telegram sebelum mengulang."));
            return result;
        } finally { connection.disconnect(); }
    }

    private static void writeField(OutputStream output, String boundary,
                                    String name, String value) throws IOException {
        output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name="
                + (char)34 + name + (char)34 + "\r\n\r\n" + value + "\r\n")
                .getBytes(StandardCharsets.UTF_8));
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
        c.setConnectTimeout(12000); c.setReadTimeout("GET".equals(method) ? 20000 : 65000);
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
            if (status < 200 || status >= 300) throw new ApiException(status,
                    result.optString("error", "Akses payroll ditolak (" + status + ")."), result);
            return result;
        } finally { c.disconnect(); }
    }

    private static final class ApiException extends Exception {
        final int status;
        final JSONObject details;
        ApiException(int status, String message) { this(status, message, null); }
        ApiException(int status, String message, JSONObject details) {
            super(message); this.status = status; this.details = details;
        }
    }
}
