using CPBoostMonitor;
using System.Net;
using System.Text;
using System.Text.Json;

internal static class FastActionChecks
{
    private sealed class Transport : HttpMessageHandler
    {
        internal TaskCompletionSource<bool>? PendingGate;
        internal bool Archived;
        internal int Proofs, Archives, ManagementReads, PendingReads, RosterReads;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath.Split('/').Last();
            if (path == "roster") RosterReads++;
            string body;
            switch (path) {
                case "session": body = """{"accessToken":"synthetic-access-token","refreshToken":"synthetic-refresh-token","expiresAt":4102444800}"""; break;
                case "roster": body = """{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":true,"username":"Fixture","accountId":"fixture","employees":[{"id":"e1","code":"E1","name":"ADIT3","team":"FH3","active":true}]}"""; break;
                case "pending":
                    PendingReads++;
                    if (PendingGate is { } gate) await gate.Task.WaitAsync(ct);
                    body = """{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[]}"""; break;
                case "tasks":
                    body = "{\"schema\":1,\"scope\":\"FH3\",\"sourceOfTruth\":\"telegram_fh3_manual\",\"workflowSchema\":1,\"tasks\":" +
                        (Archived ? "[]" : """[{"orderRef":"X800","employeeCode":"E1","employeeId":"e1","employeeName":"ADIT3","status":"assigned","takeStatus":"sent","canStart":true,"controlVersion":7}]""") + "}"; break;
                case "progress":
                    Proofs++;
                    var photo = await request.Content!.ReadAsStringAsync(ct);
                    Check(photo.Contains("X800") && photo.Contains("start"), "START sends the selected active order without a left-side employee selection");
                    body = """{"ok":true,"caption":"X800/ADIT3/start","status":"in_progress"}"""; break;
                case "management":
                    if (request.Method == HttpMethod.Get) { ManagementReads++; throw new Exception("Archive fetched the full management page"); }
                    Archives++;
                    var command = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement;
                    Check(command.GetProperty("orderRef").GetString() == "X800" && command.GetProperty("version").GetInt64() == 7,
                        "direct archive retains the selected order and server control version");
                    Archived = true; body = """{"ok":true}"""; break;
                default: throw new Exception("Unexpected request: " + path);
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS: " + label); }
    private static IEnumerable<Control> All(Control parent) { foreach (Control c in parent.Controls) { yield return c; foreach (var child in All(c)) yield return child; } }
    private static void PumpUntil(Func<bool> done)
    {
        var until = DateTime.UtcNow.AddSeconds(5);
        while (!done() && DateTime.UtcNow < until) { Application.DoEvents(); Thread.Sleep(1); }
        Check(done(), "asynchronous UI check completes without waiting for a network timeout");
    }

    internal static void Run(string output)
    {
        using var transport = new Transport();
        using var api = new PayrollApi(transport, Path.Combine(output, "fast-actions-synthetic-session.dat"));
        api.LoginAdminAsync("fixture", "synthetic-password").GetAwaiter().GetResult();
        using var form = new MainForm(true, api) { ShowInTaskbar = false, Opacity = 0 };
        form.Show(); form.ReconnectForCheckAsync().GetAwaiter().GetResult();
        var tasks = (DataGridView)form.Controls.Find("ActiveTasks", true).Single();
        tasks.CurrentCell = tasks.Rows[0].Cells[0];
        var start = All(form).OfType<Button>().First(b => b.Visible && b.Text == "START + Foto");
        var archive = (Button)form.Controls.Find("DeleteActiveOrder", true).Single();
        using var bitmap = new Bitmap(2, 2);
        using var image = new MemoryStream(); bitmap.Save(image, System.Drawing.Imaging.ImageFormat.Png);
        form.ScreenshotForCheck = () => (image.ToArray(), "image/png");
        var gate = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        transport.PendingGate = gate;
        var background = form.ReconnectForCheckAsync();
        Check(!background.IsCompleted && start.Enabled && archive.Enabled, "background polling leaves START and archive clickable");
        start.PerformClick();
        Check(transport.Proofs == 1 && !background.IsCompleted, "START reaches the API immediately while a background read is stalled");
        start.PerformClick();
        Check(transport.Proofs == 1, "successful START cannot be sent again while awaiting updated status");
        archive.PerformClick();
        Check(transport.Archives == 1 && transport.ManagementReads == 0 && !background.IsCompleted,
            "archive reaches the API without a management preflight or blocking polling");
        Check(tasks.Rows.Count == 0, "confirmed archive disappears immediately without waiting for refresh");
        transport.PendingGate = null; gate.SetResult(true);
        PumpUntil(() => background.IsCompleted && transport.PendingReads == 3);
        background.GetAwaiter().GetResult();
        Application.DoEvents();
        Check(tasks.Rows.Count == 0 && transport.PendingReads == 3,
            "stale pre-action response cannot resurrect an archived task; two actions coalesce to one refresh");
        Check(transport.RosterReads == 2, "polling and action refresh reuse roster; only login and initial workspace read it");
    }
}
