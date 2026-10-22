using CPBoostMonitor;
using System.Drawing.Imaging;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("Supply the preview output directory.");
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        string output = Path.GetFullPath(args[0]); Directory.CreateDirectory(output);
        var names = new[] { "ADIT3", "AJI3", "RIKI3", "STAYLIN3", "DAVA3", "TEGUH3", "AHMAD3", "TATANG3" };
        var people = names.Select((name, i) => new Employee { Id = $"demo:{i}", Code = $"EMP-{105 + i:0000}", Name = name,
            Team = "FH3", Active = true, LocalStatus = i % 3 == 0 ? "WORK" : "READY" }).ToList();
        people[1].LocalStatus = "SLEEP";
        people[1].SleepStartedAt = DateTimeOffset.UtcNow.AddHours(-2).AddMinutes(-13).AddSeconds(-7);
        var snapshot = new CompletedSnapshot { Schema = 1, Scope = "FH3", Complete = true,
            SelectedEmployeeCode = people[0].Code, WorkTotal = 24,
            Employees = people.Select((p, i) => new EmployeeCompletion { EmployeeCode = p.Code, EmployeeName = p.Name, CompletedCount = 24 - i * 3 }).ToList(),
            Totals = new CompletionTotals { CompletedCount = 108, Contributors = 8, EmployeeCount = 8 },
            Work = Enumerable.Range(0, 24).Select(i => new CompletedOrder { EmployeeCode = people[0].Code,
                OrderRef = $"X{4827 - i}", Game = i % 2 == 0 ? "AION" : "THRONE & LIBERTY",
                Task = "Data contoh untuk pratinjau desain.", CompletedAt = new DateTimeOffset(2026, 10, 22, 3, 15, 0, TimeSpan.Zero).AddDays(-i).ToString("O") }).ToList(),
        };
        var pending = Enumerable.Range(0, 4).Select(i => new PayrollOrder { OrderRef = $"X{4901 + i}", Game = "AION",
            Task = "Leveling dan misi harian", OrderName = "12H", CanTake = true }).ToList();
        foreach (var size in new[] { new Size(1460, 900), new Size(1120, 740) }) {
            using var form = new MainForm(preview: true) { ClientSize = size, ShowInTaskbar = false, Opacity = 0 };
            form.Show();
            form.LoadPreview(snapshot, people, pending, "Order Selesai");
            form.PerformLayout();
            using var image = new Bitmap(form.Width, form.Height);
            form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size));
            image.Save(Path.Combine(output, $"monitor-completed-{size.Width}.png"), ImageFormat.Png);
            Console.WriteLine($"Rendered Order Selesai at {size.Width}x{size.Height} with synthetic data.");
        }
        foreach (var size in new[] { new Size(1460, 900), new Size(1120, 740) }) {
            using var operations = new MainForm(preview: true) { ClientSize = size, ShowInTaskbar = false, Opacity = 0 };
            operations.Show();
            operations.LoadPreview(snapshot, people, pending, "Take Order"); operations.PerformLayout();
            using var screen = new Bitmap(operations.Width, operations.Height);
            operations.DrawToBitmap(screen, new Rectangle(Point.Empty, operations.Size));
            screen.Save(Path.Combine(output, $"monitor-operations-{size.Width}.png"), ImageFormat.Png);
            Console.WriteLine($"Rendered Take Order at {size.Width}x{size.Height} with an elapsed sleep clock.");
        }
    }
}
