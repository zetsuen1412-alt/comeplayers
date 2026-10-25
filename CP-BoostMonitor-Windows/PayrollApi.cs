using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CPBoostMonitor;

/// <summary>Windows client of the same scoped Payroll API as CP Boost Monitor Android.
/// No Telegram token, no Supabase service-role key, and no direct database access.</summary>
public sealed class PayrollApi : IDisposable
{
    public const string Origin = "https://www.comeplayers.com/api/admin/payroll/mobile/";
    private const int MaxProofBytes = 7 * 1024 * 1024;
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _refreshGate = new(1, 1);
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    { PropertyNameCaseInsensitive = true };
    private Session? _session;
    private readonly object _sessionGuard = new();
    private int _sessionVersion;
    private readonly string _sessionFile;

    private sealed class Session
    {
        public string AccessToken { get; set; } = "";
        public string RefreshToken { get; set; } = "";
        public long ExpiresAt { get; set; }
    }
    private sealed class Envelope<T>
    {
        public int Schema { get; set; }
        public string Scope { get; set; } = "";
        public string Source { get; set; } = "";
        public string SourceOfTruth { get; set; } = "";
        public int WorkflowSchema { get; set; }
        public bool CanOperate { get; set; }
        public bool IsAdmin { get; set; }
        public string AccessScope { get; set; } = "employee";
        public string EmployeeCode { get; set; } = "";
        public string Username { get; set; } = "";
        public string AccountId { get; set; } = "";
        public long Revision { get; set; }
        public List<T>? Employees { get; set; }
        public List<T>? Pending { get; set; }
        public List<T>? Tasks { get; set; }
    }

    public PayrollApi() : this(new HttpClientHandler
        {
            AllowAutoRedirect = false, UseCookies = false,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
        }, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ComePlayers", "CPBoostMonitor", "session.dat")) { }

    internal PayrollApi(HttpMessageHandler handler, string sessionFile)
    {
        _sessionFile = sessionFile;
        _http = new HttpClient(handler)
        {
            BaseAddress = new Uri(Origin), Timeout = TimeSpan.FromSeconds(75),
        };
        _http.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        _http.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };
        TryLoadSession();
    }

    public bool LoggedIn => _session != null;
    public bool CanOperate { get; private set; }
    public bool IsAdmin { get; private set; }
    public string AccessScope { get; private set; } = "employee";
    public string OwnEmployeeCode { get; private set; } = "";
    public string Username { get; private set; } = "";
    public string AccountId { get; private set; } = "";

    private void TryLoadSession()
    {
        if (!File.Exists(_sessionFile)) return;
        try
        {
            var secret = File.ReadAllBytes(_sessionFile);
            var data = ProtectedData.Unprotect(secret, null, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<Session>(data, _json);
            if (session is { AccessToken.Length: > 10, RefreshToken.Length: > 10 })
                _session = session;
        }
        catch (Exception e) when (e is CryptographicException or IOException or UnauthorizedAccessException or JsonException)
        {
            _session = null; // Windows account changed or corrupted session.
        }
    }

    private void SaveSession(Session session, int version)
    {
        lock (_sessionGuard) {
        if (version != _sessionVersion) throw new UnauthorizedAccessException("Sesi berubah; login kembali.");
        _session = session;
        var dir = Path.GetDirectoryName(_sessionFile)!;
        Directory.CreateDirectory(dir);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(session, _json);
        var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        var tmp = _sessionFile + ".tmp";
        File.WriteAllBytes(tmp, encrypted);
        File.Move(tmp, _sessionFile, true);
        }
    }

    public void Logout()
    {
        lock (_sessionGuard) {
        _sessionVersion++;
        _session = null;
        CanOperate = false;
        IsAdmin = false; AccessScope = "employee"; OwnEmployeeCode = Username = AccountId = "";
        try { if (File.Exists(_sessionFile)) File.Delete(_sessionFile); }
        catch (IOException) { /* Session is forgotten in memory. */ }
        }
    }

    public async Task LoginAsync(string email, string password)
    {
        int version;
        lock (_sessionGuard) { version = ++_sessionVersion; }
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password))
            throw new InvalidOperationException("Username dan password wajib diisi.");
        using var response = await _http.PostAsJsonAsync("session",
            new { action = "login", username = email.Trim(), password }, _json);
        var session = await ParseAsync<Session>(response);
        if (session is null || string.IsNullOrWhiteSpace(session.AccessToken) ||
            string.IsNullOrWhiteSpace(session.RefreshToken))
            throw new InvalidOperationException("Sesi Payroll tidak valid.");
        // Confirm Payroll authorization *before* persisting session to disk.
        using var roster = new HttpRequestMessage(HttpMethod.Get, "roster");
        roster.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var check = await _http.SendAsync(roster);
        _ = await ParseAsync<JsonElement>(check);
        SaveSession(session, version);
    }

    private async Task<string> TokenAsync(bool refresh = false)
    {
        if (_session is null) throw new UnauthorizedAccessException("Login Payroll terlebih dahulu.");
        if (!refresh && _session.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120)
            return _session.AccessToken;
        await _refreshGate.WaitAsync();
        try
        {
            if (_session is null) throw new UnauthorizedAccessException("Sesi berakhir; login ulang.");
            if (!refresh && _session.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120)
                return _session.AccessToken;
            var oldRefresh = _session.RefreshToken;
            var version = Volatile.Read(ref _sessionVersion);
            using var response = await _http.PostAsJsonAsync("session",
                new { action = "refresh", refreshToken = oldRefresh }, _json);
            var newSession = await ParseAsync<Session>(response);
            if (newSession is null || string.IsNullOrWhiteSpace(newSession.AccessToken))
                throw new UnauthorizedAccessException("Sesi tidak dapat diperbarui.");
            SaveSession(newSession, version);
            return newSession.AccessToken;
        }
        finally { _refreshGate.Release(); }
    }

    private async Task<T> GetAsync<T>(string endpoint)
    {
        var version = Volatile.Read(ref _sessionVersion);
        var token = await TokenAsync();
        using var firstRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
        firstRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var first = await _http.SendAsync(firstRequest);
        if (first.StatusCode != HttpStatusCode.Unauthorized) {
            var result = (await ParseAsync<T>(first))!;
            EnsureCurrentSession(version); return result;
        }
        var fresh = await TokenAsync(refresh: true);
        using var retryRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
        retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", fresh);
        using var retry = await _http.SendAsync(retryRequest);
        var retried = (await ParseAsync<T>(retry))!;
        EnsureCurrentSession(version); return retried;
    }

    private void EnsureCurrentSession(int version)
    {
        if (version != Volatile.Read(ref _sessionVersion) || !LoggedIn)
            throw new UnauthorizedAccessException("Sesi berubah; data akun sebelumnya diabaikan.");
    }

    public async Task<List<Employee>> RosterAsync()
    {
        var doc = await GetAsync<Envelope<Employee>>("roster");
        if (doc.Schema != 1 || doc.Scope != "FH3" || doc.Employees is null)
            throw new InvalidOperationException("Format data karyawan FH3 tidak sesuai.");
        CanOperate = doc.CanOperate;
        IsAdmin = doc.IsAdmin; OwnEmployeeCode = doc.EmployeeCode; Username = doc.Username; AccountId = doc.AccountId;
        AccessScope = IsAdmin ? "admin" : doc.AccessScope == "shared" ? "shared" : "employee";
        return doc.Employees.Where(e => e.Team == "FH3" && e.Active).ToList();
    }
    public async Task<List<PayrollOrder>> PendingAsync()
    {
        var doc = await GetAsync<Envelope<PayrollOrder>>("pending");
        if (doc.Schema != 2 || doc.Scope != "FH3" || doc.SourceOfTruth != "telegram_fh3_manual" || doc.Pending is null)
            throw new InvalidOperationException("Format data order baru tidak sesuai.");
        return doc.Pending;
    }
    public async Task<List<PayrollOrder>> TasksAsync()
    {
        var doc = await GetAsync<Envelope<PayrollOrder>>("tasks");
        if (doc.Schema != 1 || doc.Scope != "FH3" || doc.SourceOfTruth != "telegram_fh3_manual"
            || doc.WorkflowSchema != 1 || doc.Tasks is null)
            throw new InvalidOperationException("Format data tugas FH3 tidak sesuai.");
        return doc.Tasks;
    }

    public async Task<CompletedSnapshot> CompletedAsync(string employeeCode = "", int offset = 0)
    {
        var doc = await GetAsync<CompletedSnapshot>("completed?employeeCode="
            + Uri.EscapeDataString(employeeCode) + "&offset=" + offset);
        if (doc.Schema != 1 || doc.Scope != "FH3" || doc.SourceOfTruth != "telegram_fh3_manual"
            || doc.CompletionRule != "telegram_done_confirmed" || !doc.Complete
            || doc.Employees is null || doc.Work is null || doc.Totals is null
            || doc.Employees.Any(row => row.CompletedCount < 0 || string.IsNullOrWhiteSpace(row.EmployeeCode))
            || doc.Work.Any(row => row.EmployeeCode != employeeCode || !DateTimeOffset.TryParse(row.CompletedAt, out _))
            || doc.WorkTotal < doc.Work.Count || doc.Work.Count > 50
            || doc.SelectedEmployeeCode != (employeeCode.Length == 0 ? null : employeeCode))
            throw new InvalidOperationException("Format riwayat order selesai FH3 tidak sesuai.");
        return doc;
    }

    public Task<ManagementSnapshot> ManagementAsync() => GetAsync<ManagementSnapshot>("management");
    public Task<BookSnapshot> BooksAsync() => GetAsync<BookSnapshot>("books");
    public Task ArchiveOrderAsync(string orderRef, long version, string reason)
    {
        if (!IsAdmin) throw new UnauthorizedAccessException("Hanya admin yang dapat menghapus order.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(orderRef, @"^X\d{2,12}$") || version < 0
            || reason.Trim().Length < 3 || reason.Length > 500)
            throw new InvalidOperationException("Pilih order dan isi alasan penghapusan 3–500 karakter.");
        return MutateAsync("management", new { orderRef, version, action = "archive", reason = reason.Trim() });
    }
    public async Task MutateAsync(string path, object body)
    {
        var token = await TokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: _json) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        var result = await ParseAsync<JsonElement>(response);
        if (!result.TryGetProperty("ok", out var ok) || !ok.GetBoolean()) throw new InvalidOperationException("Perubahan belum terkonfirmasi; perbarui data.");
    }

    public async Task<string> VerifyGroupAsync()
    {
        var info = await GetAsync<JsonElement>("proof-setup");
        if (!info.TryGetProperty("ready", out var ready) || !ready.GetBoolean())
            throw new InvalidOperationException("Grup EVO Ilham FH3 belum siap.");
        return info.TryGetProperty("liveTitle", out var title) ? title.GetString() ?? "EVO Ilham FH3"
            : "EVO Ilham FH3";
    }

    public async Task<string> AssignAsync(string orderRef, string employeeCode)
    {
        int version = Volatile.Read(ref _sessionVersion);
        if (string.IsNullOrWhiteSpace(orderRef) || string.IsNullOrWhiteSpace(employeeCode))
            throw new InvalidOperationException("Order dan karyawan wajib dipilih.");
        var token = await TokenAsync();
        EnsureCurrentSession(version);
        using var request = new HttpRequestMessage(HttpMethod.Post, "assign")
        {
            Content = JsonContent.Create(new { orderRef, employeeCode }, options: _json),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        // Deliberately no retry for server-side assignments; manual refresh resolves uncertain results.
        using var response = await _http.SendAsync(request);
        var result = await ParseAsync<JsonElement>(response);
        EnsureCurrentSession(version);
        RequireTakeConfirmed(result);
        return result.TryGetProperty("employeeName", out var name)
            ? name.GetString() ?? employeeCode : employeeCode;
    }

    /// <summary>Idempotent TAKE proof. The backend responds alreadySent without duplicate message.</summary>
    public async Task<string> TakeNoticeAsync(string orderRef, string employeeCode)
    {
        int version = Volatile.Read(ref _sessionVersion);
        if (string.IsNullOrWhiteSpace(orderRef) || string.IsNullOrWhiteSpace(employeeCode))
            throw new InvalidOperationException("Pilih satu tugas aktif terlebih dahulu.");
        var token = await TokenAsync();
        EnsureCurrentSession(version);
        using var request = new HttpRequestMessage(HttpMethod.Post, "take")
        {
            Content = JsonContent.Create(new { orderRef, employeeCode }, options: _json),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        // Do NOT auto-retry ambiguous Telegram requests.
        using var response = await _http.SendAsync(request);
        var result = await ParseAsync<JsonElement>(response);
        EnsureCurrentSession(version);
        RequireTakeConfirmed(result);
        var caption = result.TryGetProperty("caption", out var value)
            ? value.GetString() ?? "" : "";
        return caption;
    }

    internal static void RequireTakeConfirmed(JsonElement result)
    {
        if (!result.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True
            || !result.TryGetProperty("takeSent", out var sent) || sent.ValueKind != JsonValueKind.True)
            throw new InvalidOperationException("TAKE belum dikonfirmasi Telegram. Segarkan tugas dan periksa grup.");
    }

    /// <summary>Send proof photo exactly once. Network ambiguity must be checked in Telegram, not retried.</summary>
    public async Task<ProofResult> ProgressAsync(string orderRef, string employeeCode,
        string action, byte[] image, string mime)
    {
        if (action != "start" && action != "done")
            throw new InvalidOperationException("Aksi harus START atau DONE.");
        if (!ValidImage(image, mime))
            throw new InvalidOperationException("Screenshot harus PNG/JPG valid maksimal 7 MB.");
        var token = await TokenAsync();
        using var multipart = new MultipartFormDataContent();
        multipart.Add(new StringContent(orderRef), "orderRef");
        multipart.Add(new StringContent(employeeCode), "employeeCode");
        multipart.Add(new StringContent(action), "action");
        using var photo = new ByteArrayContent(image);
        photo.Headers.ContentType = new MediaTypeHeaderValue(mime);
        multipart.Add(photo, "photo", mime == "image/png" ? "screenshot.png" : "screenshot.jpg");
        using var request = new HttpRequestMessage(HttpMethod.Post, "progress")
        {
            Content = multipart,
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        // NEVER auto-retry this operation. Telegram sendPhoto has no idempotency key.
        using var response = await _http.SendAsync(request);
        var result = await ParseAsync<JsonElement>(response);
        if (!result.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
            throw new InvalidOperationException("Server belum mengonfirmasi pengiriman bukti.");
        return new ProofResult
        {
            Caption = result.TryGetProperty("caption", out var caption) ? caption.GetString() ?? "" : "",
            ChatTitle = result.TryGetProperty("chatTitle", out var chat) ? chat.GetString() ?? "" : "",
            Status = result.TryGetProperty("status", out var status) ? status.GetString() ?? "" : "",
            AlreadySent = result.TryGetProperty("alreadySent", out var already) && already.GetBoolean(),
        };
    }

    public static bool ValidImage(byte[] data, string mime)
    {
        if (data.Length < 16 || data.Length > MaxProofBytes) return false;
        if (mime == "image/png")
            return data[0] == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71
                && data[4] == 13 && data[5] == 10 && data[6] == 26 && data[7] == 10;
        if (mime == "image/jpeg")
            return data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff
                && data[^2] == 0xff && data[^1] == 0xd9;
        return false;
    }
    private static async Task<T?> ParseAsync<T>(HttpResponseMessage response)
    {
        // Payroll mobile endpoints return a small, privacy-filtered payload.
        var bytes = await response.Content.ReadAsByteArrayAsync();
        if (bytes.Length > 2 * 1024 * 1024)
            throw new InvalidOperationException("Respons server terlalu besar.");
        if (!response.IsSuccessStatusCode)
        {
            string detail = "Operasi Payroll belum berhasil.";
            try
            {
                using var doc = JsonDocument.Parse(bytes);
                if (doc.RootElement.TryGetProperty("error", out var error))
                    detail = error.GetString() ?? detail;
            }
            catch (JsonException) { /* Error body is not JSON. */ }
            throw new InvalidOperationException(
                $"{detail} (HTTP {(int)response.StatusCode})");
        }
        try { return JsonSerializer.Deserialize<T>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
        catch (JsonException) { throw new InvalidOperationException("Data dari website tidak sesuai format."); }
    }

    public void Dispose() { _http.Dispose(); _refreshGate.Dispose(); }
}
