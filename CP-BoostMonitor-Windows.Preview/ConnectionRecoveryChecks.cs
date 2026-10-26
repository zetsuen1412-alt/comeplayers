using CPBoostMonitor;
using System.Net;
using System.Text;
using System.Drawing.Imaging;

internal static class ConnectionRecoveryChecks
{
    private sealed class Transport : HttpMessageHandler
    {
        internal bool Offline;
        internal bool Expired;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (Offline) throw new TaskCanceledException("synthetic startup timeout");
            var body = request.RequestUri!.AbsolutePath.Split('/').Last() switch
            {
                "session" => """{"accessToken":"synthetic-access-token","refreshToken":"synthetic-refresh-token","expiresAt":4102444800}""",
                "roster" => """{"schema":1,"scope":"FH3","canOperate":true,"accessScope":"shared","username":"Contoh","employees":[{"id":"fixture","code":"E1","name":"Adit","team":"FH3","active":true}]}""",
                "pending" => """{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X800","canTake":true,"game":"AION"}]}""",
                "tasks" => """{"schema":1,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","workflowSchema":1,"tasks":[]}""",
                _ => throw new Exception("Unexpected request"),
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Expired ? body.Replace("4102444800", "1") : body, Encoding.UTF8, "application/json") });
        }
    }

    internal static void Run(string output)
    {
        static void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        var root = Path.Combine(Path.GetTempPath(), "fh3-connection-ui-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var http = new Transport();
            var api = new PayrollApi(http, Path.Combine(root, "session.dat"));
            api.LoginAsync("fixture", "synthetic-password").GetAwaiter().GetResult();
            using var form = new MainForm(preview: true, api: api) { ShowInTaskbar = false, Opacity = 0, ClientSize = new Size(1120,740) };
            form.Show();
            var reconnect = (Button)form.Controls.Find("ReconnectMonitor", true).Single();
            var pending = (DataGridView)form.Controls.Find("PendingOrders", true).Single();
            http.Offline = true;
            form.ReconnectForCheckAsync().GetAwaiter().GetResult();
            Check(form.RecoveryPolling && reconnect.Enabled, "failed first load keeps recovery polling and manual reconnect available");
            Check(api.LoggedIn && pending.Rows.Count == 0, "startup network failure keeps login without presenting fetched orders");
            form.PerformLayout();
            Check(reconnect.Width >= 150 && reconnect.Visible, "reconnect control remains visible at minimum window size");
            using (var image = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size)); image.Save(Path.Combine(output, "monitor-startup-disconnected.png"), ImageFormat.Png); }
            http.Offline = false;
            reconnect.PerformClick();
            Check(pending.Rows.Count == 1 && pending.Rows[0].Cells[0].Value?.ToString() == "X800", "manual reconnect populates the queue after a failed startup");
            Check(form.RecoveryPolling && api.Username == "Contoh", "recovered connection retains periodic polling and verified account identity");
            http.Offline = true;
            form.ReconnectForCheckAsync().GetAwaiter().GetResult();
            Check(pending.Rows.Count == 1 && reconnect.Enabled, "later network failures preserve the last successful snapshot and allow recovery");
            http.Offline = false;
            form.ReconnectForCheckAsync().GetAwaiter().GetResult();
            using (var image = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size)); image.Save(Path.Combine(output, "monitor-startup-recovered.png"), ImageFormat.Png); }
            http.Expired = true;
            api.LoginAsync("fixture", "synthetic-password").GetAwaiter().GetResult();
            http.Offline = true;
            form.ReconnectForCheckAsync().GetAwaiter().GetResult();
            Check(!api.LoggedIn && !form.RecoveryPolling && !reconnect.Enabled && !pending.Visible && File.Exists(Path.Combine(root,"session.dat")), "uncertain session refresh stops polling and opens sign-in without deleting the saved session");
        }
        finally
        {
            if (!Path.GetFullPath(root).StartsWith(Path.Combine(Path.GetTempPath(), "fh3-connection-ui-"), StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe cleanup target");
            Directory.Delete(root, true);
        }
    }
}
