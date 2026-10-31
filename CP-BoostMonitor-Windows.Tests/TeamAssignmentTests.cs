using CPBoostMonitor;
using System.Net;
using System.Text;
using System.Text.Json;

internal static class TeamAssignmentTests
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
        Console.WriteLine("PASS: " + message);
    }
    private static List<OrderParticipant> Team(params int[] shares) => shares.Select((share, i) => new OrderParticipant {
        EmployeeId = "id" + i, EmployeeCode = "F" + i, EmployeeName = "Worker " + i, ShareBps = share,
    }).ToList();
    private static void Invalid(Action action, string message)
    {
        try { action(); } catch (InvalidOperationException) { Check(true, message); return; }
        throw new Exception("Accepted invalid team: " + message);
    }
    private sealed class Transport : HttpMessageHandler
    {
        public Func<HttpRequestMessage, Task<HttpResponseMessage>> Respond = _ => Task.FromResult(Json("{}"));
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Respond(request);
    }
    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };
    public static async Task Run()
    {
        foreach (var shares in new[] { new[] {10000}, new[] {6000,4000}, new[] {3334,3333,3333}, new[] {2500,2500,2500,2500} })
        {
            TeamAllocation.Validate(Team(shares), "F0"); Check(true, shares.Length + " workers share exactly 100 percent");
        }
        Invalid(() => TeamAllocation.Validate(Team(), "F0"), "empty team rejected");
        Invalid(() => TeamAllocation.Validate(Team(2000,2000,2000,2000,2000), "F0"), "fifth worker rejected");
        var duplicate = Team(5000,5000); duplicate[1].EmployeeCode = "f0";
        Invalid(() => TeamAllocation.Validate(duplicate, "F0"), "case-insensitive duplicate worker rejected");
        Invalid(() => TeamAllocation.Validate(Team(5000,4999), "F0"), "99.99 percent cannot lose part of order income");
        Invalid(() => TeamAllocation.Validate(Team(10000,1), "F0"), "over-allocation rejected");
        Invalid(() => TeamAllocation.Validate(Team(10000,0), "F0"), "zero share rejected");
        Invalid(() => TeamAllocation.Validate(Team(10000), "F1"), "lead cannot disappear");
        Invalid(() => TeamAllocation.Validate(Team(10000), "F0", new[]{"F0","F1"}), "joined worker cannot disappear");
        TeamAllocation.Validate(Team(6000,4000), "F0", new[]{"F0"});
        Check(TeamAllocation.Percent(3333) == "33,33%", "basis points display without floating point drift");
        var folder = Path.Combine(Path.GetTempPath(), "monitor-team-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            using var transport = new Transport();
            // A synthetic roster supplies the role for transport checks. Session encryption
            // remains covered by ApiContractTests and is not replaced in production.
            transport.Respond = _ => Task.FromResult(Json("""{"schema":1,"scope":"FH3","isAdmin":true,"canOperate":true,"employees":[]}"""));
            using var api = new PayrollApi(transport, Path.Combine(folder, "session.dat"));
            await api.RosterAsync();
            int calls = 0;
            transport.Respond = async r => {
                calls++;
                using var command = JsonDocument.Parse(await r.Content!.ReadAsStringAsync());
                Check(command.RootElement.GetProperty("employeeCode").GetString() == "F0", "team TAKE preserves canonical lead");
                Check(command.RootElement.GetProperty("teamVersion").GetInt32() == 0 && command.RootElement.GetProperty("participants").GetArrayLength() == 2, "initial TAKE transmits whole team atomically");
                Check(command.RootElement.GetProperty("participants")[1].GetProperty("shareBps").GetInt32() == 4000, "team TAKE sends exact integer shares");
                return Json("""{"ok":true,"takeSent":true,"employeeName":"Worker 0"}""");
            };
            await api.AssignAsync("X123", "F0", Team(6000,4000));
            Check(calls == 1, "team TAKE is sent once");
            transport.Respond = r => {
                Check(r.Method == HttpMethod.Get && r.RequestUri!.Query.Contains("orderRef=X123"), "team editor fetches current order snapshot");
                return Task.FromResult(Json("""{"teamVersion":7,"participants":[{"employeeCode":"F0","shareBps":6000},{"employeeCode":"F1","shareBps":4000}]}"""));
            };
            var snapshot = await api.TeamAsync("X123"); Check(snapshot.TeamVersion == 7, "reviewed team version retained");
            int edits = 0;
            transport.Respond = async r => {
                edits++;
                using var command = JsonDocument.Parse(await r.Content!.ReadAsStringAsync());
                Check(r.RequestUri!.AbsolutePath.EndsWith("/team") && command.RootElement.GetProperty("version").GetInt64() == 7, "team edit sends reviewed version");
                return Json("""{"error":"Order berubah. Perbarui data."}""", HttpStatusCode.Conflict);
            };
            try { await api.SaveTeamAsync("X123", snapshot.TeamVersion, "F0", Team(5000,5000), new[]{"F0","F1"}); throw new Exception("Stale edit accepted"); }
            catch (InvalidOperationException) { Check(edits == 1, "stale team edit has no automatic retry"); }
            transport.Respond = async r => {
                var fields = new Dictionary<string,string>();
                foreach (var part in (MultipartFormDataContent)r.Content!) if (part.Headers.ContentDisposition!.FileName is null)
                    fields[part.Headers.ContentDisposition.Name!.Trim('"')] = await part.ReadAsStringAsync();
                Check(fields["employeeCode"] == "F0" && fields["action"] == "done" && !fields.ContainsKey("participants"), "team does not duplicate or change lead DONE proof");
                return Json("""{"ok":true,"status":"done"}""");
            };
            await api.ProgressAsync("X123", "F0", "done", new byte[] {137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0}, "image/png");
            var roster = Team(6000,4000).Select(p => new Employee {Id=p.EmployeeId,Code=p.EmployeeCode,Name=p.EmployeeName,Team="FH3",Active=true}).ToList();
            var store = new LocalStatusStore(Path.Combine(folder, "status.json"));
            store.ApplyConfirmedTasks(roster, new[]{new PayrollOrder {OrderRef="X123",TakeStatus="sent",Status="assigned",CanStart=true,Participants=Team(6000,4000)}});
            Check(roster.All(e => store.Get(e.Code) == "WORK"), "confirmed team TAKE marks all verified participants working");
        }
        finally
        {
            var resolved = Path.GetFullPath(folder);
            if (!resolved.StartsWith(Path.Combine(Path.GetTempPath(), "monitor-team-tests-"), StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe cleanup target");
            Directory.Delete(resolved, true);
        }
    }
}
