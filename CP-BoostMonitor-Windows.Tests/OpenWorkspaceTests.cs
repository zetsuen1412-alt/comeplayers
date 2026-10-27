using CPBoostMonitor;
using System.Net;
using System.Text;

internal static class OpenWorkspaceTests
{
    private sealed class Transport : HttpMessageHandler
    {
        internal readonly List<string> Requests = new();
        internal bool Offline;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath.Split('/').Last(); Requests.Add(request.Method + " " + path);
            if (path == "session") throw new Exception("Worker mode must never authenticate or refresh a token");
            if (request.Headers.Authorization != null || !request.Headers.TryGetValues("X-Monitor-Mode", out var mode) || mode.Single() != "public")
                throw new Exception("Expected worker protocol without a bearer token");
            if (Offline) throw new TaskCanceledException("synthetic network failure");
            var body = path switch {
                "roster" => """{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":false,"accessScope":"public","accountId":"public-fh3","employees":[{"id":"e1","code":"E1","name":"Adit","team":"FH3","active":true}]}""",
                "pending" => """{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[]}""",
                "tasks" => """{"schema":1,"scope":"FH3","workflowSchema":1,"sourceOfTruth":"telegram_fh3_manual","tasks":[]}""",
                _ => """{"ok":true,"assigned":true,"takeSent":true,"employeeName":"Adit","caption":"x800/adit/start","chatTitle":"FH3"}""",
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
    internal static async Task Run()
    {
        void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        var file = Path.Combine(Path.GetTempPath(), "fh3-open-" + Guid.NewGuid().ToString("N"), "session.dat");
        using var transport = new Transport(); using var api = new PayrollApi(transport, file);
        Check(api.PublicMode && api.WorkspaceAvailable && !api.LoggedIn && !api.IsAdmin, "fresh installation opens the worker workspace without any account or activation");
        Check((await api.RosterAsync()).Count == 1 && api.AccessScope == "public", "public worker roster loads without authenticating and grants no admin rights");
        await api.PendingAsync(); await api.TasksAsync();
        Check(!File.Exists(file) && transport.Requests.All(x => x != "POST session"), "polling writes no login file and never invokes login or token refresh");
        await api.AssignAsync("X800", "E1"); await api.TakeNoticeAsync("X800", "E1");
        var image = new byte[] { 137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0 };
        await api.ProgressAsync("X800", "E1", "start", image, "image/png");
        Check(transport.Requests.Contains("POST assign") && transport.Requests.Contains("POST take") && transport.Requests.Contains("POST progress"), "TAKE and photo reports use public operational transport without an embedded credential");
        var count = transport.Requests.Count;
        try { await api.MutateAsync("management", new { action = "archive" }); throw new Exception("Guest mutation accepted"); }
        catch (UnauthorizedAccessException) { Check(transport.Requests.Count == count, "worker mode rejects admin writes before sending a network request"); }
        transport.Offline = true;
        try { await api.ProgressAsync("X800", "E1", "done", image, "image/png"); throw new Exception("Uncertain photo accepted"); }
        catch (OperationCanceledException) { Check(transport.Requests.Count == count + 1 && api.PublicMode, "uncertain guest photo is sent once and does not force a login"); }
        try { await api.RosterAsync(); throw new Exception("Offline read accepted"); }
        catch (MonitorReadException) { Check(api.WorkspaceAvailable && !api.LoggedIn, "network failures do not close the public workspace"); }
        transport.Offline = false; await api.RosterAsync();
        Check(api.PublicMode && !api.IsAdmin, "worker mode reconnects after an outage without sign-in");
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var oldBytes = System.Security.Cryptography.ProtectedData.Protect(Encoding.UTF8.GetBytes(
            """{"accessToken":"old-private-access-token","refreshToken":"old-private-refresh-token","expiresAt":1,"adminSession":true}"""),
            null, System.Security.Cryptography.DataProtectionScope.CurrentUser);
        File.WriteAllBytes(file, oldBytes);
        using (var oldTransport = new Transport())
        using (var reopened = new PayrollApi(oldTransport, file)) {
            await reopened.RosterAsync();
            Check(reopened.PublicMode && !reopened.LoggedIn && oldTransport.Requests.SequenceEqual(new[] { "GET roster" })
                && oldBytes.SequenceEqual(File.ReadAllBytes(file)), "reopening with an expired encrypted admin session still loads worker data without refreshing or deleting that session");
        }
        File.Delete(file); Directory.Delete(Path.GetDirectoryName(file)!);
    }
}
