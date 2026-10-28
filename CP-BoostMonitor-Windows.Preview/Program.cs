using CPBoostMonitor;
using System.Drawing.Imaging;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("Supply the preview output directory.");
        System.Globalization.CultureInfo.DefaultThreadCurrentCulture = System.Globalization.CultureInfo.GetCultureInfo("id-ID");
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        PendingArchiveChecks.Run();
        ActiveArchiveChecks.Run();
        string output = Path.GetFullPath(args[0]); Directory.CreateDirectory(output);
        DailyDurationChecks.Run(output);
        OrderNotificationChecks.Run(output);
        PauseChecks.Run(output);
        ConnectionRecoveryChecks.Run(output);
        OpenWorkspaceChecks.Run(output);
        FastActionChecks.Run(output);
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
                Discord = "FH3 Demo", Task = "Data contoh untuk pratinjau desain.", CompletedAt = new DateTimeOffset(2026, 10, 22, 3, 15, 0, TimeSpan.Zero).AddDays(-i).ToString("O") }).ToList(),
        };
        var pending = Enumerable.Range(0, 4).Select(i => new PayrollOrder { OrderRef = $"X{4901 + i}", Game = "AION",
            Discord = "FH3 Demo", Task = "Leveling dan misi harian", OrderName = "12H", CanTake = true }).ToList();
        var active = new List<PayrollOrder> { new() { OrderRef = "X4888", Game = "AION", Discord = "FH3 Demo",
            EmployeeName = "TEGUH3", EmployeeCode = people[5].Code, Status = "in_progress", CanDone = true,
            TakeStatus = "sent", StartStatus = "sent", ActionMessage = "START terkonfirmasi. Unggah screenshot DONE setelah selesai." } };
        using (var accounts = new MonitorAccountDialog(people, _ => Task.CompletedTask) { ShowInTaskbar = false, Opacity = 0 }) {
            accounts.Show(); accounts.PerformLayout();
            if (accounts.Settings.AccessScope != "employee" || accounts.Settings.EmployeeCode != people[0].Code) throw new Exception("Personal account defaults changed");
            accounts.Shared = true;
            if (accounts.EmployeePickerEnabled || accounts.Settings.EmployeeCode != null || accounts.Settings.AccessScope != "shared") throw new Exception("Shared account retained a single employee binding");
            accounts.Show(); accounts.PerformLayout();
            using var screen = new Bitmap(accounts.Width, accounts.Height);
            accounts.DrawToBitmap(screen, new Rectangle(Point.Empty, accounts.Size));
            screen.Save(Path.Combine(output, "monitor-shared-account.png"), ImageFormat.Png);
            accounts.Shared = false;
            if (!accounts.EmployeePickerEnabled || accounts.Settings.EmployeeCode != people[0].Code) throw new Exception("Switching back lost personal employee selection");
            Console.WriteLine("PASS: personal defaults, shared scope without employee binding, and return to personal selection");
        }
        var management = new ManagementSnapshot {TotalRupiah=375000,
            Eligible=new(){new(){OrderRef="X4827",WageRupiah=125000},new(){OrderRef="X4826",WageRupiah=250000}},
            Orders=Enumerable.Range(0,12).Select(i=>new ManagedOrder {OrderRef=$"X{4827-i}",EmployeeName=names[i%names.Length],
                Game="AION",Status=i<4?"Selesai":"in_progress",AdminState=i==5?"refund":i==7?"problem":"normal",
                WageRupiah=i<4?125000:null,CanPrice=i<4}).ToList()};
        snapshot.Work[0].EmployeeId=people[0].Id;snapshot.Work[0].EmployeeName=names[0];snapshot.Work[0].WageRupiah=125000;snapshot.Work[0].Closed=true;
        var books=new BookSnapshot{Closings=new(){new(){Id="preview",Title="Tutup Buku 24 Oktober 2026",CreatedAt="2026-10-24T03:00:00Z",TotalRupiah=125000,OrderCount=1,Work=new(){snapshot.Work[0]},
            Employees=new(){new(){EmployeeId=people[0].Id,EmployeeName=names[0],OrderCount=1,TotalRupiah=125000}}}}};
        foreach(var page in new[]{"Kelola Order","Data Tutup Buku"}) foreach(var size in new[]{new Size(1460,900),new Size(1120,740)}){
            using var form=new MainForm(preview:true){ClientSize=size,ShowInTaskbar=false,Opacity=0};form.Show();
            form.LoadAdminPreview(management,books,people,page);form.PerformLayout();
            using var bitmap=new Bitmap(form.Width,form.Height);form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));
            bitmap.Save(Path.Combine(output,$"monitor-{(page=="Kelola Order"?"admin":"books")}-{size.Width}.png"),ImageFormat.Png);
        }
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
            operations.LoadPreview(snapshot, people, pending, "Take Order", isAdmin: true, tasks: active); operations.PerformLayout();
            using var screen = new Bitmap(operations.Width, operations.Height);
            operations.DrawToBitmap(screen, new Rectangle(Point.Empty, operations.Size));
            screen.Save(Path.Combine(output, $"monitor-operations-{size.Width}.png"), ImageFormat.Png);
            Console.WriteLine($"Rendered Take Order at {size.Width}x{size.Height} with an elapsed sleep clock.");
        }
        using var archive = new ArchiveOrderDialog(new ManagedOrder { OrderRef = "X4901", Game = "AION", Discord = "FH3 Demo", EmployeeName = "Belum ditugaskan", Status = "Order baru" }) { ShowInTaskbar = false, Opacity = 0 };
        archive.Show(); archive.PerformLayout();
        using var confirmation = new Bitmap(archive.Width, archive.Height);
        archive.DrawToBitmap(confirmation, new Rectangle(Point.Empty, archive.Size));
        confirmation.Save(Path.Combine(output, "monitor-delete-confirmation.png"), ImageFormat.Png);
    }
}
