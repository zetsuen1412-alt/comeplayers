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
    private readonly TimeSpan _readTimeout;
    internal static readonly TimeSpan AuthenticationTimeout = TimeSpan.FromSeconds(65);
    private readonly TimeSpan _authenticationTimeout;
    private bool _sessionRecoveryRequired;
    private bool _publicMode = true;

    private sealed class Session
    {
        public string AccessToken { get; set; } = "";
        public string RefreshToken { get; set; } = "";
        public long ExpiresAt { get; set; }
        public bool AdminSession { get; set; }
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

    internal PayrollApi(HttpMessageHandler handler, string sessionFile, TimeSpan? readTimeout = null, TimeSpan? authenticationTimeout = null)
    {
        _sessionFile = sessionFile;
        _readTimeout = readTimeout ?? TimeSpan.FromSeconds(20);
        _authenticationTimeout = authenticationTimeout ?? AuthenticationTimeout;
        _http = new HttpClient(handler)
        {
            BaseAddress = new Uri(Origin), Timeout = TimeSpan.FromSeconds(75),
        };
        _http.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        _http.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };
        TryLoadSession();
    }

    public bool LoggedIn => !_publicMode && _session != null && !_sessionRecoveryRequired;
    public bool PublicMode => _publicMode;
    internal int IdentityVersion => Volatile.Read(ref _sessionVersion);
    public bool WorkspaceAvailable => _publicMode || LoggedIn;
    public bool CanOperate { get; private set; }
    public bool IsAdmin { get; private set; }
    public string AccessScope { get; private set; } = "public";
    public string OwnEmployeeCode { get; private set; } = "";
    public string Username { get; private set; } = "Mode Karyawan";
    public string AccountId { get; private set; } = "public-fh3";

    private void TryLoadSession()
    {
        if (!File.Exists(_sessionFile)) return;
        try
        {
            var secret = File.ReadAllBytes(_sessionFile);
            var data = ProtectedData.Unprotect(secret, null, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<Session>(data, _json);
            if (session is { AdminSession: true, AccessToken.Length: > 10, RefreshToken.Length: > 10 })
            {
                _session = session;
                // Opening the program always starts in worker mode. Stored admin
                // credentials are not refreshed or activated until explicit sign-in.
            }
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
        _publicMode = false;
        _sessionRecoveryRequired = false;
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
        _publicMode = true;
        _sessionRecoveryRequired = false;
        CanOperate = false;
        IsAdmin = false; AccessScope = "public"; OwnEmployeeCode = "";
        Username = "Mode Karyawan"; AccountId = "public-fh3";
        try { if (File.Exists(_sessionFile)) File.Delete(_sessionFile); }
        catch (IOException) { /* Session is forgotten in memory. */ }
        }
    }

    public void EnterPublicMode()
    {
        lock (_sessionGuard) {
            _sessionVersion++; _publicMode = true; _sessionRecoveryRequired = true;
            IsAdmin = false; CanOperate = false; AccessScope = "public"; OwnEmployeeCode = "";
            Username = "Mode Karyawan"; AccountId = "public-fh3";
        }
    }

    public async Task LoginAdminAsync(string username, string password)
    {
        await LoginAsync(username, password);
        if (!IsAdmin) { Logout(); throw new UnauthorizedAccessException("Gunakan akun admin ComePlayers. Karyawan dapat langsung membuka daftar order."); }
    }

    public async Task LoginAsync(string email, string password)
    {
        int version;
        lock (_sessionGuard) { version = ++_sessionVersion; }
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password))
            throw new InvalidOperationException("Username dan password wajib diisi.");
        using var login = new HttpRequestMessage(HttpMethod.Post, "session")
        { Content = JsonContent.Create(new { action = "login", username = email.Trim(), password }, options: _json) };
        using var response = await SendReadAsync(login, "menghubungkan akun", _authenticationTimeout);
        var session = await ParseAsync<Session>(response);
        if (session is null || string.IsNullOrWhiteSpace(session.AccessToken) ||
            string.IsNullOrWhiteSpace(session.RefreshToken))
            throw new InvalidOperationException("Sesi Payroll tidak valid.");
        // Confirm Payroll authorization *before* persisting session to disk.
        using var roster = new HttpRequestMessage(HttpMethod.Get, "roster");
        roster.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var check = await SendReadAsync(roster, "memeriksa akses karyawan", _authenticationTimeout);
        var access = await ParseAsync<Envelope<Employee>>(check);
        if (access is null || access.Schema != 1 || access.Scope != "FH3" || access.Employees is null)
            throw new InvalidOperationException("Format akses Monitor tidak sesuai.");
        session.AdminSession = access.IsAdmin;
        SaveSession(session, version);
        IsAdmin = access.IsAdmin; CanOperate = access.CanOperate;
    }

    private async Task<string> TokenAsync(bool refresh = false)
    {
        if (_publicMode) return "";
        if (_sessionRecoveryRequired) throw new UnauthorizedAccessException("Pembaruan sesi belum terkonfirmasi. Silakan masuk kembali.");
        if (_session is null) throw new UnauthorizedAccessException("Login Payroll terlebih dahulu.");
        if (!refresh && _session.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120)
            return _session.AccessToken;
        await _refreshGate.WaitAsync();
        try
        {
            if (_sessionRecoveryRequired) throw new UnauthorizedAccessException("Pembaruan sesi belum terkonfirmasi. Silakan masuk kembali.");
            if (_session is null) throw new UnauthorizedAccessException("Sesi berakhir; login ulang.");
            if (!refresh && _session.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120)
                return _session.AccessToken;
            var oldRefresh = _session.RefreshToken;
            var version = Volatile.Read(ref _sessionVersion);
            Session? newSession;
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, "session")
                { Content = JsonContent.Create(new { action = "refresh", refreshToken = oldRefresh }, options: _json) };
                using var deadline = new CancellationTokenSource(_authenticationTimeout);
                using var response = await _http.SendAsync(request, deadline.Token);
                newSession = await ParseAsync<Session>(response);
            }
            catch (Exception error) when (error is OperationCanceledException or HttpRequestException or UnauthorizedAccessException or InvalidOperationException)
            {
                // A timed-out refresh may already have rotated the token. Never replay it
                // on the background timer or delete the stored session on a network error.
                if (version == Volatile.Read(ref _sessionVersion)) _sessionRecoveryRequired = true;
                throw new UnauthorizedAccessException("Sesi belum dapat dilanjutkan. Silakan masuk kembali; riwayat lokal tetap tersimpan.", error);
            }
            if (newSession is null || string.IsNullOrWhiteSpace(newSession.AccessToken))
            {
                if (version == Volatile.Read(ref _sessionVersion)) _sessionRecoveryRequired = true;
                throw new UnauthorizedAccessException("Sesi tidak dapat diperbarui.");
            }
            newSession.AdminSession = _session?.AdminSession == true;
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
        ApplyCredential(firstRequest, token);
        using var first = await SendReadAsync(firstRequest, EndpointLabel(endpoint));
        if (first.StatusCode != HttpStatusCode.Unauthorized) {
            var result = (await ParseAsync<T>(first))!;
            EnsureCurrentSession(version); return result;
        }
        if (_publicMode) return (await ParseAsync<T>(first))!;
        var fresh = await TokenAsync(refresh: true);
        using var retryRequest = new HttpRequestMessage(HttpMethod.Get, endpoint);
        ApplyCredential(retryRequest, fresh);
        using var retry = await SendReadAsync(retryRequest, EndpointLabel(endpoint));
        if (retry.StatusCode == HttpStatusCode.Unauthorized)
        {
            if (version == Volatile.Read(ref _sessionVersion)) _sessionRecoveryRequired = true;
            throw new UnauthorizedAccessException("Sesi berakhir. Silakan masuk kembali.");
        }
        var retried = (await ParseAsync<T>(retry))!;
        EnsureCurrentSession(version); return retried;
    }

    private static void ApplyCredential(HttpRequestMessage request, string token)
    {
        if (string.IsNullOrEmpty(token)) request.Headers.Add("X-Monitor-Mode", "public");
        else request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private static string EndpointLabel(string endpoint) => endpoint.Split('?')[0] switch
    {
        "roster" => "memuat daftar karyawan",
        "pending" => "memuat order baru",
        "tasks" => "memuat tugas aktif",
        "completed" => "memuat order selesai",
        "books" => "memuat Data Tutup Buku",
        _ => "membaca data ComePlayers",
    };

    private async Task<HttpResponseMessage> SendReadAsync(HttpRequestMessage request, string operation, TimeSpan? timeout = null)
    {
        using var deadline = new CancellationTokenSource(timeout ?? _readTimeout);
        try { return await _http.SendAsync(request, deadline.Token); }
        catch (Exception error) when (error is OperationCanceledException or HttpRequestException)
        {
            var message = error is OperationCanceledException
                ? $"Waktu tunggu habis saat {operation}. Layanan sedang lambat; tunggu sebentar lalu coba lagi."
                : $"Koneksi terputus saat {operation}. Periksa koneksi lalu coba lagi.";
            throw new MonitorReadException(message, error);
        }
    }

    private void EnsureCurrentSession(int version)
    {
        if (version != Volatile.Read(ref _sessionVersion) || !WorkspaceAvailable)
            throw new UnauthorizedAccessException("Sesi berubah; data akun sebelumnya diabaikan.");
    }

    public async Task<List<Employee>> RosterAsync()
    {
        var doc = await GetAsync<Envelope<Employee>>("roster");
        if (doc.Schema != 1 || doc.Scope != "FH3" || doc.Employees is null)
            throw new InvalidOperationException("Format data karyawan FH3 tidak sesuai.");
        CanOperate = doc.CanOperate;
        IsAdmin = doc.IsAdmin; OwnEmployeeCode = doc.EmployeeCode; Username = doc.Username; AccountId = doc.AccountId;
        AccessScope = IsAdmin ? "admin" : doc.AccessScope is "shared" or "public" ? doc.AccessScope : "employee";
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
        if (!IsAdmin) throw new UnauthorizedAccessException("Login admin dari Pengaturan untuk mengelola order.");
        var token = await TokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: _json) };
        ApplyCredential(request, token);
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

    public async Task<string> AssignAsync(string orderRef, string employeeCode, IReadOnlyCollection<OrderParticipant>? participants = null)
    {
        int version = Volatile.Read(ref _sessionVersion);
        if (string.IsNullOrWhiteSpace(orderRef) || string.IsNullOrWhiteSpace(employeeCode))
            throw new InvalidOperationException("Order dan karyawan wajib dipilih.");
        if (participants is not null)
        {
            if (!IsAdmin) throw new UnauthorizedAccessException("Hanya admin yang dapat mengatur tim dan pembagian hasil.");
            TeamAllocation.Validate(participants, employeeCode);
        }
        object command = participants is null ? new { orderRef, employeeCode } : new
        {
            orderRef, employeeCode, teamVersion = 0,
            participants = participants.Select(p => new { p.EmployeeCode, p.ShareBps }).ToArray(),
        };
        var token = await TokenAsync();
        EnsureCurrentSession(version);
        using var request = new HttpRequestMessage(HttpMethod.Post, "assign")
        {
            Content = JsonContent.Create(command, options: _json),
        };
        ApplyCredential(request, token);
        // Deliberately no retry for server-side assignments; manual refresh resolves uncertain results.
        using var response = await _http.SendAsync(request);
        var result = await ParseAsync<JsonElement>(response);
        EnsureCurrentSession(version);
        RequireTakeConfirmed(result);
        return result.TryGetProperty("employeeName", out var name)
            ? name.GetString() ?? employeeCode : employeeCode;
    }

    public async Task<TeamSnapshot> TeamAsync(string orderRef)
    {
        if (!IsAdmin) throw new UnauthorizedAccessException("Hanya admin yang dapat mengatur tim dan pembagian hasil.");
        var snapshot = await GetAsync<TeamSnapshot>("team?orderRef=" + Uri.EscapeDataString(orderRef));
        if (snapshot.Participants is null || snapshot.Participants.Count is < 1 or > 4 || snapshot.TeamVersion < 0)
            throw new InvalidOperationException("Data pembagian order belum lengkap. Perbarui data.");
        TeamAllocation.Validate(snapshot.Participants, snapshot.Participants[0].EmployeeCode);
        return snapshot;
    }

    public async Task SaveTeamAsync(string orderRef, long version, string leadCode,
        IReadOnlyCollection<OrderParticipant> participants, IEnumerable<string> existingCodes)
    {
        if (!IsAdmin) throw new UnauthorizedAccessException("Hanya admin yang dapat mengatur tim dan pembagian hasil.");
        if (version < 0) throw new InvalidOperationException("Versi pembagian order tidak valid.");
        TeamAllocation.Validate(participants, leadCode, existingCodes);
        await MutateAsync("team", new {
            orderRef, version, participants = participants.Select(p => new { p.EmployeeCode, p.ShareBps }).ToArray(),
        });
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
        ApplyCredential(request, token);
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
        string action, byte[] image, string mime, long pauseRevision = 0, string? startEventId = null, PayrollOrder? dailyOrder = null)
    {
        if (action is not ("start" or "done" or "pause" or "continue"))
            throw new InvalidOperationException("Aksi harus START, PAUSE, CONTINUE atau DONE.");
        var pauseReport = action is "pause" or "continue";
        var daily = dailyOrder?.Daily == true;
        if (daily && !dailyOrder!.HasDailyContext)
            throw new InvalidOperationException("Hari atau progres berubah. Segarkan Tugas sebelum mengirim.");
        if (pauseReport && !daily && (!Guid.TryParse(startEventId, out _) || pauseRevision < 0 || pauseRevision > 1_000_000))
            throw new InvalidOperationException("Status PAUSE berubah atau belum tersedia. Segarkan Tugas.");
        if (!ValidImage(image, mime))
            throw new InvalidOperationException("Screenshot harus PNG/JPG valid maksimal 7 MB.");
        var token = await TokenAsync();
        using var multipart = new MultipartFormDataContent();
        multipart.Add(new StringContent(orderRef), "orderRef");
        multipart.Add(new StringContent(employeeCode), "employeeCode");
        multipart.Add(new StringContent(action), "action");
        if (daily)
        {
            multipart.Add(new StringContent(dailyOrder!.DayNumber.ToString(System.Globalization.CultureInfo.InvariantCulture)), "dayNumber");
            multipart.Add(new StringContent(dailyOrder.DailyRevision.ToString(System.Globalization.CultureInfo.InvariantCulture)), "dailyRevision");
            multipart.Add(new StringContent(dailyOrder.DailyCycleId!), "dailyCycleId");
        }
        else if (pauseReport)
        {
            multipart.Add(new StringContent(startEventId!), "startEventId");
            multipart.Add(new StringContent(pauseRevision.ToString(System.Globalization.CultureInfo.InvariantCulture)), "pauseRevision");
        }
        using var photo = new ByteArrayContent(image);
        photo.Headers.ContentType = new MediaTypeHeaderValue(mime);
        multipart.Add(photo, "photo", mime == "image/png" ? "screenshot.png" : "screenshot.jpg");
        using var request = new HttpRequestMessage(HttpMethod.Post, "progress")
        {
            Content = multipart,
        };
        ApplyCredential(request, token);
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
            if (response.StatusCode == HttpStatusCode.Unauthorized)
                throw new UnauthorizedAccessException("Sesi berakhir. Silakan masuk kembali.");
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

internal sealed class MonitorReadException(string message, Exception inner) : HttpRequestException(message, inner) { }

