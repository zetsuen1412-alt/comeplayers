using CPBoostMonitor;
using System.Net;
using System.Text;
using System.Drawing.Imaging;

internal static class OpenWorkspaceChecks
{
    private sealed class Transport : HttpMessageHandler
    {
        internal readonly List<string> Requests = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            string path = request.RequestUri!.AbsolutePath.Split('/').Last(); Requests.Add(path);
            if (path == "session" || request.Headers.Authorization != null) throw new Exception("Guest UI tried to log in");
            var body = path switch {
                "roster" => """{"schema":1,"scope":"FH3","canOperate":true,"isAdmin":false,"accessScope":"public","username":"Mode Karyawan","accountId":"public-fh3","employees":[{"id":"e1","code":"E1","name":"ADIT3","team":"FH3","active":true},{"id":"e2","code":"E2","name":"BUDI3","team":"FH3","active":true}]}""",
                "pending" => """{"schema":2,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","pending":[{"orderRef":"X800","canTake":true,"game":"AION2","discord":"FH3 Demo","durationDisplay":"8 jam × 7 hari","task":"Data contoh untuk pratinjau"}]}""",
                "tasks" => """{"schema":1,"scope":"FH3","sourceOfTruth":"telegram_fh3_manual","workflowSchema":1,"tasks":[]}""",
                _ => throw new Exception("Unexpected UI request: " + path),
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
    private static IEnumerable<Control> All(Control parent) { foreach (Control child in parent.Controls) { yield return child; foreach (var next in All(child)) yield return next; } }
    internal static void Run(string output)
    {
        static void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        using var http = new Transport();
        using var api = new PayrollApi(http, Path.Combine(output, "never-created-guest-session.dat"));
        using var form = new MainForm(preview: true, api: api) { ShowInTaskbar = false, Opacity = 0, ClientSize = new Size(1460, 900) };
        form.Show(); form.ReconnectForCheckAsync().GetAwaiter().GetResult(); form.PerformLayout();
        var grid = (DataGridView)form.Controls.Find("PendingOrders", true).Single();
        Check(grid.Visible && grid.Rows.Count == 1 && api.PublicMode && !api.LoggedIn, "fresh Windows launch shows real worker data without an account gate");
        Check(http.Requests.SequenceEqual(new[] { "roster", "tasks", "pending" }) || http.Requests.SequenceEqual(new[] { "roster", "pending", "tasks" }), "startup requests only worker data and never a login session");
        Check(!All(form).OfType<Button>().Single(b => b.Text == "Kelola Order").Visible, "public worker home hides order administration");
        using (var image = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size)); image.Save(Path.Combine(output, "monitor-open-worker.png"), ImageFormat.Png); }
        All(form).OfType<Button>().Single(b => b.Text == "Pengaturan").PerformClick();
        var adminLogin = (Button)form.Controls.Find("OpenAdminLogin", true).Single();
        Check(adminLogin.Visible, "Settings exposes the explicit admin sign-in button");
        using (var image = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size)); image.Save(Path.Combine(output, "monitor-open-settings.png"), ImageFormat.Png); }
        adminLogin.PerformClick();
        Check(All(form).OfType<Button>().Single(b => b.Text == "Kembali ke Order Baru").Visible, "admin sign-in can return to worker orders without logging in");
        All(form).OfType<Button>().Single(b => b.Text == "Kembali ke Order Baru").PerformClick();
        Check(grid.Visible && grid.Rows.Count == 1 && api.PublicMode, "cancelling admin sign-in preserves the worker queue");
    }
}
