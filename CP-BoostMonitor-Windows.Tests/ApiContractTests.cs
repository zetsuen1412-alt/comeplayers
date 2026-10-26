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
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":false,"accessScope":"shared","employeeCode":"","employees":[{"id":"e1","code":"F001","name":"Adit","team":"FH3","active":true},{"id":"e2","code":"F002","name":"Budi","team":"FH3","active":true}]}"""));
            var sharedRoster = await api.RosterAsync();
            Check(sharedRoster.Count == 2 && api.AccessScope == "shared" && !api.IsAdmin && api.OwnEmployeeCode == "", "shared Windows account receives all workers without admin permissions");
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","source":"payroll","pending":[]}"""));
            await Rejected(async () => { await api.PendingAsync(); });
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X4806","canTake":false,"unlinkedPayroll":true,"discord":"FH3 Demo"}]}"""));
            var pending = await api.PendingAsync();
            Check(pending.Single().UnlinkedPayroll && !pending[0].CanTake, "unlinked Telegram order cannot enable TAKE in Windows");
            Check(pending[0].Discord == "FH3 Demo", "Discord metadata deserializes without changing TAKE authorization");
            http.Respond = _ => Task.FromResult(Json("""{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X4806","canTake":true,"canTakeWithoutPayroll":true,"unlinkedPayroll":true,"needsValuation":true}]}"""));
            pending = await api.PendingAsync();
            Check(pending[0].TakeAllowed && pending[0].UnlinkedPayroll, "explicit operational journal permission allows unpriced TAKE without inventing salary");
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","workflowSchema":1,"tasks":[{"orderRef":"X4806","status":"assigned","takeStatus":"unknown","canStart":false,"deliveryUncertain":true}]}"""));
            var tasks = await api.TasksAsync();
            Check(tasks[0].DeliveryUncertain && !tasks[0].CanStart && !tasks[0].CanDone, "uncertain TAKE never unlocks screenshot actions");
            var cycle = "00000000-0000-4000-8000-000000000001";
            var photo = new byte[] {137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0};
            int progressCalls=0;
            http.Respond = async r => {
                progressCalls++;
                Check(r.RequestUri!.AbsolutePath.EndsWith("/progress"), "pause uses the authorized proof transport");
                var fields=new Dictionary<string,string>();
                foreach(var part in (MultipartFormDataContent)r.Content!)
                    if(part.Headers.ContentDisposition!.FileName is null) fields[part.Headers.ContentDisposition.Name!.Trim('"')]=await part.ReadAsStringAsync();
                Check(fields["action"]=="pause" && fields["startEventId"]==cycle && fields["pauseRevision"]=="2", "pause sends the reviewed START cycle and revision");
                return Json("""{"ok":true,"status":"paused","caption":"x4806/adit/pause"}""");
            };
            await Rejected(async()=>{await api.ProgressAsync("X4806","E1","pause",photo,"image/png");});
            Check(progressCalls==0,"missing pause cycle cannot make a network request");
            var paused=await api.ProgressAsync("X4806","E1","pause",photo,"image/png",2,cycle);
            Check(paused.Status=="paused" && progressCalls==1,"pause requires server confirmation and is sent once");
            http.Respond = _ => {progressCalls++;return Task.FromResult(Json("""{"error":"Laporan belum pasti"}""",HttpStatusCode.Conflict));};
            await Rejected(async()=>{await api.ProgressAsync("X4806","E1","continue",photo,"image/png",3,cycle);});
            Check(progressCalls==2,"uncertain CONTINUE is surfaced without automatic photo retry");
            var daily=new PayrollOrder{Daily=true,TotalDays=7,CompletedDays=1,DayNumber=2,DailyRevision=4,DailyCycleId=cycle};
            http.Respond=async r=>{
                var fields=new Dictionary<string,string>();
                foreach(var part in (MultipartFormDataContent)r.Content!)
                    if(part.Headers.ContentDisposition!.FileName is null)fields[part.Headers.ContentDisposition.Name!.Trim('"')]=await part.ReadAsStringAsync();
                Check(fields["dayNumber"]=="2"&&fields["dailyRevision"]=="4"&&fields["dailyCycleId"]==cycle&&!fields.ContainsKey("pauseRevision"),"daily photo sends reviewed day and durable revision, not the legacy pause cycle");
                return Json("""{"ok":true,"status":"assigned","caption":"x4806/adit/day2/done"}""");
            };
            await api.ProgressAsync("X4806","E1","done",photo,"image/png",dailyOrder:daily);
            daily.DayNumber=3;await Rejected(async()=>{await api.ProgressAsync("X4806","E1","done",photo,"image/png",dailyOrder:daily);});
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
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":false,"employees":[]}"""));
            await api.RosterAsync();
            try { await api.ArchiveOrderAsync("X4806", 8, "Order duplikat"); throw new Exception("Employee archive accepted"); }
            catch (UnauthorizedAccessException) { Check(true, "employee cannot invoke pending order archive"); }
            http.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":true,"employees":[]}"""));
            await api.RosterAsync();
            int archiveCalls = 0;
            http.Respond = async r => {
                archiveCalls++;
                Check(r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/management"), "delete uses the existing authorized management endpoint");
                using var body = JsonDocument.Parse(await r.Content!.ReadAsStringAsync());
                var command = body.RootElement;
                Check(command.GetProperty("orderRef").GetString() == "X4806" && command.GetProperty("version").GetInt64() == 8
                    && command.GetProperty("action").GetString() == "archive" && command.GetProperty("reason").GetString() == "Order duplikat"
                    && !command.TryGetProperty("employeeCode", out _), "delete sends the reviewed order version and reason without requiring an employee");
                return Json("""{"ok":true,"version":9}""");
            };
            await Rejected(() => api.ArchiveOrderAsync("X4806", 8, "  a "));
            Check(archiveCalls == 0, "invalid reason does not send a mutation");
            await api.ArchiveOrderAsync("X4806", 8, "  Order duplikat  ");
            http.Respond = _ => { archiveCalls++; return Task.FromResult(Json("""{"error":"Order berubah. Perbarui data sebelum menyimpan."}""", HttpStatusCode.Conflict)); };
            await Rejected(() => api.ArchiveOrderAsync("X4806", 8, "Order duplikat"));
            Check(archiveCalls == 2, "stale archive is surfaced without automatic mutation retry");
            foreach (var operation in new[] { "assign", "take" }) {
                http.Respond = r => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session : """{"schema":1,"scope":"FH3","canOperate":true,"employees":[]}"""));
                await api.LoginAsync("test@example.invalid", "synthetic-password");
                var pendingTake = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
                http.Respond = _ => pendingTake.Task;
                var taking = operation == "assign" ? api.AssignAsync("X4806", "E1") : api.TakeNoticeAsync("X4806", "E1");
                api.Logout(); pendingTake.SetResult(Json("""{"ok":true,"takeSent":true,"employeeName":"Contoh","caption":"fixture"}"""));
                try { await taking; throw new Exception("Late TAKE accepted after logout"); }
                catch (UnauthorizedAccessException) { Check(!api.LoggedIn, "late " + operation + " confirmation cannot change local status after logout"); }
            }
            http.Respond = r => Task.FromResult(Json(r.RequestUri!.AbsolutePath.EndsWith("/session") ? Session : """{"schema":1,"scope":"FH3","canOperate":true,"employees":[]}"""));
            await api.LoginAsync("test@example.invalid", "synthetic-password");
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
