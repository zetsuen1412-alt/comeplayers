using CPBoostMonitor;
using System.Net;
using System.Text;

internal static class ConnectionRecoveryTests
{
    private sealed class Transport : HttpMessageHandler
    {
        internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Respond = (_, _) => Task.FromResult(Json("{}"));
        internal List<string> Requests = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(request.Method + " " + request.RequestUri!.AbsolutePath.Split('/').Last());
            return Respond(request, ct);
        }
    }
    private const string Session = """{"accessToken":"synthetic-access-token","refreshToken":"synthetic-refresh-token","expiresAt":4102444800}""";
    private const string Roster = """{"schema":1,"scope":"FH3","canOperate":true,"accessScope":"shared","employees":[{"id":"e1","code":"E1","name":"Adit","team":"FH3","active":true}]}""";
    private static HttpResponseMessage Json(string value, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
    private static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }

    internal static async Task Run()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "fh3-connection-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var file = Path.Combine(root, "session.dat");
            using var http = new Transport();
            http.Respond = (r, _) => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session : Roster));
            using var api = new PayrollApi(http, file, TimeSpan.FromMilliseconds(50));
            await api.LoginAsync("fixture", "synthetic-password");
            var saved = File.ReadAllBytes(file);
            var timer = System.Diagnostics.Stopwatch.StartNew();
            http.Respond = async (_, ct) => { await Task.Delay(Timeout.InfiniteTimeSpan, ct); return Json("{}"); };
            try { await api.RosterAsync(); throw new Exception("Hanging GET should time out"); }
            catch (MonitorReadException error)
            {
                Check(error.Message.Contains("daftar karyawan") && timer.Elapsed < TimeSpan.FromSeconds(2), "hanging read has a bounded deadline and localized stage message");
            }
            Check(api.LoggedIn && saved.SequenceEqual(File.ReadAllBytes(file)), "read timeout retains encrypted login unchanged");
            http.Requests.Clear();
            http.Respond = (_, _) => Task.FromResult(Json(Roster));
            Check((await api.RosterAsync()).Single().Name == "Adit" && http.Requests.SequenceEqual(new[] { "GET roster" }), "next read reconnects using the saved session without repeating login");
            foreach (var operation in new[] { "assign", "take", "progress", "management" })
            {
                http.Requests.Clear();
                http.Respond = (_, _) => throw new TaskCanceledException("synthetic uncertain delivery");
                try
                {
                    if (operation == "assign") await api.AssignAsync("X800", "E1");
                    else if (operation == "take") await api.TakeNoticeAsync("X800", "E1");
                    else if (operation == "management") await api.MutateAsync("management", new { action = "archive" });
                    else await api.ProgressAsync("X800", "E1", "start", new byte[] {137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0}, "image/png");
                    throw new Exception("Ambiguous mutation must fail");
                }
                catch (OperationCanceledException) { Check(http.Requests.SequenceEqual(new[] { "POST " + operation }), operation + " timeout is sent exactly once and never replayed"); }
            }

            http.Respond = (r, _) => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session.Replace("4102444800", "1") : Roster));
            await api.LoginAsync("fixture", "synthetic-password");
            var expiredSaved = File.ReadAllBytes(file);
            http.Requests.Clear();
            http.Respond = (_, _) => throw new TaskCanceledException("synthetic lost refresh response");
            for (int attempt = 0; attempt < 2; attempt++)
            {
                try { await api.RosterAsync(); throw new Exception("Unconfirmed refresh should require sign-in"); }
                catch (UnauthorizedAccessException) { }
            }
            Check(!api.LoggedIn && http.Requests.SequenceEqual(new[] { "POST session" }), "uncertain token refresh requires sign-in and cannot be replayed by polling");
            Check(expiredSaved.SequenceEqual(File.ReadAllBytes(file)), "uncertain refresh preserves stored encrypted session instead of deleting local data");
            http.Respond = (r, _) => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session : Roster));
            await api.LoginAsync("fixture", "synthetic-password");
            Check(api.LoggedIn && (await api.RosterAsync()).Count == 1, "explicit sign-in recovers after uncertain refresh");

            http.Respond = (r, _) => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session.Replace("4102444800", "1") : Roster));
            await api.LoginAsync("fixture", "synthetic-password");
            http.Requests.Clear();
            var lostRefresh = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
            http.Respond = (_, _) => lostRefresh.Task;
            var firstRead = api.RosterAsync();
            var queuedRead = api.PendingAsync();
            lostRefresh.SetException(new TaskCanceledException("synthetic lost response"));
            foreach (var read in new Task[] { firstRead, queuedRead })
            {
                try { await read; throw new Exception("Unconfirmed concurrent refresh accepted"); }
                catch (UnauthorizedAccessException) { }
            }
            Check(http.Requests.SequenceEqual(new[] { "POST session" }), "queued reads cannot replay an uncertain refresh after waiting for its lock");
            http.Respond = (r, _) => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session.Replace("4102444800", "1") : Roster));
            await api.LoginAsync("fixture", "synthetic-password");
            http.Requests.Clear();
            http.Respond = (_, _) => Task.FromResult(Json("""{"error":"Layanan belum tersedia"}""", HttpStatusCode.ServiceUnavailable));
            for (int attempt = 0; attempt < 2; attempt++)
            {
                try { await api.RosterAsync(); throw new Exception("Unconfirmed server refresh accepted"); }
                catch (UnauthorizedAccessException) { }
            }
            Check(!api.LoggedIn && http.Requests.SequenceEqual(new[] { "POST session" }), "refresh server failure cannot cause repeated token rotation in the background");
            using var slowAuthHttp = new Transport();
            slowAuthHttp.Respond = async (request, ct) => {
                if (request.RequestUri!.AbsolutePath.EndsWith("/session")) { await Task.Delay(150, ct); return Json(Session); }
                return Json(Roster);
            };
            using var slowAuth = new PayrollApi(slowAuthHttp, Path.Combine(root,"slow-session.dat"),TimeSpan.FromMilliseconds(50),TimeSpan.FromSeconds(2));
            await slowAuth.LoginAsync("fixture","synthetic-password");
            Check(slowAuth.LoggedIn && slowAuthHttp.Requests.SequenceEqual(new[]{"POST session","GET roster"}),"authentication may outlast the read deadline and is still sent exactly once");
            using var stalledAuthHttp = new Transport();
            stalledAuthHttp.Respond = async (_, ct) => {await Task.Delay(Timeout.InfiniteTimeSpan,ct);return Json(Session);};
            using var stalledAuth = new PayrollApi(stalledAuthHttp,Path.Combine(root,"stalled.dat"),TimeSpan.FromSeconds(2),TimeSpan.FromMilliseconds(50));
            try {await stalledAuth.LoginAsync("fixture","synthetic-password");throw new Exception("Authentication must remain bounded");}
            catch(MonitorReadException){Check(!stalledAuth.LoggedIn && !File.Exists(Path.Combine(root,"stalled.dat")) && stalledAuthHttp.Requests.Count==1,"authentication deadline cancels a stalled login without replay or saved credentials");}
        }
        finally
        {
            if (!Path.GetFullPath(root).StartsWith(Path.Combine(Path.GetTempPath(), "fh3-connection-tests-"), StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe cleanup target");
            Directory.Delete(root, true);
        }
    }
}
