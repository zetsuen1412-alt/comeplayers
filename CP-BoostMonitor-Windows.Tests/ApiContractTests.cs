using CPBoostMonitor;
using System.Net;
using System.Text;
using System.Text.Json;

internal static class ApiContractTests
{
    private sealed class FakeHttp : HttpMessageHandler
    {
        internal Func<HttpRequestMessage, Task<HttpResponseMessage>> Respond = _ => Task.FromResult(Json("{}"));
        internal int AssignCalls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/assign")) AssignCalls++;
            return Respond(request);
        }
    }
    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    private static readonly string Session = """{"accessToken":"synthetic-access-token","refreshToken":"synthetic-refresh-token","expiresAt":4102444800}""";

    public static async Task Run()
    {
        static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        static async Task Rejected(Func<Task> action) {
            try { await action(); } catch (InvalidOperationException) { return; }
            throw new Exception("Request should be rejected");
        }
        using (var json = JsonDocument.Parse("""{"ok":true,"takeSent":false,"assigned":true}""")) {
            try { PayrollApi.RequireTakeConfirmed(json.RootElement); throw new Exception("Unconfirmed TAKE accepted"); }
            catch (InvalidOperationException) { Check(true, "committed assignment is not falsely called Telegram TAKE success"); }
        }
        if (!OperatingSystem.IsWindows()) return; // DPAPI CurrentUser is Windows-specific.
        var root = Path.Combine(Path.GetTempPath(), "fh3-api-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var file = Path.Combine(root, "session.dat");
            using var http = new FakeHttp();
            http.Respond = r => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session : """{"schema":1,"scope":"FH3","canOperate":true,"employees":[]}"""));
            using var api = new PayrollApi(http, file);
            await api.LoginAsync("test@example.invalid", "synthetic-password");
            Check(api.LoggedIn && File.Exists(file), "Windows login uses scoped API and encrypted session");
            Check(!Encoding.UTF8.GetString(File.ReadAllBytes(file)).Contains("synthetic-access-token"), "DPAPI file excludes plaintext access token");
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","source":"payroll","pending":[]}"""));
            await Rejected(async () => { await api.PendingAsync(); });
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X4806","canTake":false,"unlinkedPayroll":true}]}"""));
            var pending = await api.PendingAsync();
            Check(pending.Single().UnlinkedPayroll && !pending[0].CanTake, "unlinked Telegram order cannot enable TAKE in Windows");
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X4806","canTake":true,"canTakeWithoutPayroll":true,"unlinkedPayroll":true,"needsValuation":true}]}"""));
            pending = await api.PendingAsync();
            Check(pending[0].TakeAllowed && pending[0].UnlinkedPayroll, "explicit operational journal permission allows unpriced TAKE without inventing salary");
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","workflowSchema":1,"tasks":[{"orderRef":"X4806","status":"assigned","takeStatus":"unknown","canStart":false,"deliveryUncertain":true}]}"""));
            var tasks = await api.TasksAsync();
            Check(tasks[0].DeliveryUncertain && !tasks[0].CanStart && !tasks[0].CanDone, "uncertain TAKE never unlocks screenshot actions");
            http.Respond = r => {
                Check(r.RequestUri!.AbsolutePath.EndsWith("/completed"), "completed view requests operational history instead of salaries");
                return Task.FromResult(Json("""{"schema":1,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","completionRule":"telegram_done_confirmed","complete":true,"selectedEmployeeCode":"E1","employees":[{"employeeCode":"E1","employeeName":"ADIT3","completedCount":1}],"totals":{"completedCount":1,"employeeCount":1,"contributors":1},"workTotal":1,"work":[{"orderRef":"X4806","employeeCode":"E1","completedAt":"2026-10-22T03:00:00Z"}]}"""));
            };
            var completed = await api.CompletedAsync("E1");
            Check(completed.Employees[0].CompletedCount == 1 && completed.Work.Single().OrderRef == "X4806", "confirmed completed order count and employee list deserialize correctly");
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","sourceOfTruth":"payroll","completionRule":"telegram_done_confirmed","complete":true,"employees":[],"work":[],"totals":{}}"""));
            await Rejected(async () => { await api.CompletedAsync(); });
            http.Respond = _ => Task.FromResult(Json("""{"ok":false,"assigned":true,"takeSent":false,"error":"Periksa grup"}""", HttpStatusCode.Conflict));
            await Rejected(async () => { await api.AssignAsync("X4806", "E1"); });
            Check(http.AssignCalls == 1, "uncertain assignment is not automatically resent");
            var waiting = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
            http.Respond = _ => waiting.Task;
            var read = api.PendingAsync(); api.Logout();
            waiting.SetResult(Json("""{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[]}"""));
            try { await read; throw new Exception("Late response accepted"); }
            catch (UnauthorizedAccessException) { Check(!api.LoggedIn && !File.Exists(file), "logout rejects late private responses and preserves logged-out state"); }
        }
        finally {
            var resolved = Path.GetFullPath(root);
            var allowed = Path.Combine(Path.GetTempPath(), "fh3-api-tests-");
            if (!resolved.StartsWith(allowed, StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe cleanup target");
            Directory.Delete(resolved, recursive: true);
        }
    }
}
