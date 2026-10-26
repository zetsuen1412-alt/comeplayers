using CPBoostMonitor;
using System.Diagnostics;
using System.Drawing.Imaging;
using System.Text;
using System.Runtime.InteropServices;

internal static class OrderNotificationChecks
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    internal static void Run(string output)
    {
        static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        // Parse the actual embedded WAV, including optional RIFF chunks. No audio
        // is played and no user account/cache or Telegram endpoint is accessed.
        using (var stream = typeof(MainForm).Assembly.GetManifestResourceStream(OrderAlerts.AudioResource)!) {
            Check(stream is not null, "published assembly embeds notification music");
            using var reader = new BinaryReader(stream!, Encoding.ASCII);
            Check(Encoding.ASCII.GetString(reader.ReadBytes(4)) == "RIFF", "notification music is a WAV container");
            reader.ReadInt32(); Check(Encoding.ASCII.GetString(reader.ReadBytes(4)) == "WAVE", "notification music has a WAVE header");
            int rate = 0, bytesPerSecond = 0, dataBytes = 0; short codec = 0, channels = 0, bits = 0;
            while (stream!.Position + 8 <= stream.Length) {
                var chunk = Encoding.ASCII.GetString(reader.ReadBytes(4)); int length = reader.ReadInt32();
                long end = stream.Position + length;
                if (length < 0 || end > stream.Length) throw new Exception("Invalid WAV chunk");
                if (chunk == "fmt ") { codec = reader.ReadInt16(); channels = reader.ReadInt16(); rate = reader.ReadInt32(); bytesPerSecond = reader.ReadInt32(); reader.ReadInt16(); bits = reader.ReadInt16(); }
                if (chunk == "data") dataBytes = length;
                stream.Position = end + (length & 1);
            }
            Check(codec == 1 && channels == 2 && rate == 44100 && bits == 16, "notification music uses SoundPlayer-compatible PCM stereo");
            Check(bytesPerSecond > 0 && Math.Abs(dataBytes / (double)bytesPerSecond - 10) < 0.01, "notification music lasts ten seconds");
        }
        string root = Path.Combine(output, "fh3-alert-test-" + Guid.NewGuid().ToString("N"));
        try {
            using (var alerts = new OrderAlerts(root)) {
                Check(alerts.Observe("", new[] { "X100" }).Count == 0, "no notification before account identity is known");
                Check(alerts.Observe("test-a", new[] { "X100" }).Count == 0, "first per-account queue is silent");
                Check(alerts.Observe("test-a", new[] { "X100", "X101" }).SequenceEqual(new[] { "X101" }), "a new order alerts once");
                alerts.SoundEnabled = false; alerts.PlaySound();
            }
            using (var alerts = new OrderAlerts(root)) {
                Check(!alerts.SoundEnabled, "muted notification setting survives restart");
                Check(alerts.Observe("test-a", new[] { "X101" }).Count == 0, "saved order does not re-alert after restart");
                Check(alerts.Observe("test-b", new[] { "X200" }).Count == 0, "switching accounts starts an independent silent baseline");
            }
        } finally {
            if (Directory.Exists(root)) { foreach (var file in Directory.EnumerateFiles(root)) File.Delete(file); Directory.Delete(root); }
        }
        int opened = 0, dismissed = 0;
        using (var host = new Form { ClientSize = new Size(640, 480), ShowInTaskbar = false, Opacity = 0 })
        using (var toast = new OrderNotificationToast(new[] { "X5127", "X5128" }, () => opened++, preview: true) { Opacity = 0 }) {
            host.Show(); Application.DoEvents(); toast.Show(); Application.DoEvents();
            Check(toast.DoesNotActivate && !toast.ShowInTaskbar && toast.IsAlwaysOnTop && GetForegroundWindow() != toast.Handle,
                "corner popup stays on top without taking focus or creating a taskbar window");
            host.WindowState = FormWindowState.Minimized; Application.DoEvents();
            Check(toast.Visible && toast.Owner is null && GetForegroundWindow() != toast.Handle,
                "popup remains visible without taking focus when the main window is minimized");
            foreach (var area in new[] { new Rectangle(0, 0, 1920, 1040), new Rectangle(-1280, 0, 1280, 984), new Rectangle(48, 0, 592, 440) }) {
                toast.PlaceInWorkingArea(area);
                Check(area.Contains(toast.NotificationBounds) && toast.Right < area.Right && toast.Bottom < area.Bottom, "corner popup stays above the taskbar and inside its monitor");
            }
            toast.Dismissed += (_, _) => dismissed++;
            using var picture = new Bitmap(toast.Width, toast.Height);
            toast.DrawToBitmap(picture, new Rectangle(Point.Empty, toast.Size));
            picture.Save(Path.Combine(output, "monitor-new-order-popup.png"), ImageFormat.Png);
            toast.OpenOrders(); toast.OpenOrders();
            Check(opened == 1 && dismissed == 1 && toast.IsDisposed, "click opens the order list once and closes the popup");
        }
        using (var toast = new OrderNotificationToast(new[] { "X5129" }, () => opened++, preview: true) { Opacity = 0 }) {
            toast.Show(); toast.DismissNotification(); Check(opened == 1 && toast.IsDisposed, "close button dismisses without opening or taking an order");
        }
        using (var toast = new OrderNotificationToast(new[] { "X5130" }, () => opened++) { Opacity = 0 }) {
            toast.Show(); var clock = Stopwatch.StartNew();
            while (!toast.IsDisposed && clock.Elapsed < TimeSpan.FromSeconds(12)) { Application.DoEvents(); Thread.Sleep(10); }
            Check(toast.IsDisposed && opened == 1, "popup automatically closes without taking an order");
        }
    }
}
