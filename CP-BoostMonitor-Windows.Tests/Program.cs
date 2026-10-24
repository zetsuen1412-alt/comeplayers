using CPBoostMonitor;

static void Assert(bool check, string name)
{
    if (!check) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

var alertTracker = new NewOrderTracker();
Assert(alertTracker.Observe(new[]{"X100"}).Count==0,"first queue establishes silent baseline");
Assert(alertTracker.Observe(new[]{"X100","X101","X101"}).SequenceEqual(new[]{"X101"}),"new order alerts once");
Assert(alertTracker.Observe(Array.Empty<string>()).Count==0,"taking an order is not an alert");
Assert(alertTracker.Observe(new[]{"X101"}).Count==0,"returning known order does not alert again");
Assert(new NewOrderTracker(alertTracker.Snapshot()).Observe(new[]{"X101","X102"}).SequenceEqual(new[]{"X102"}),"restart preserves alert deduplication");

var orders = new List<PayrollOrder>
{
    new() { OrderRef = "X4671", Game = "AION 2", OrderName = "Boost Level",
        Discord = "FH3 Demo", Buyer = "Admin Test", Task = "Level 50", EmployeeName = "Mulyana",
        EmployeeCode = "FH301", Status = "assigned" },
    new() { OrderRef = "X9001", Game = "Mobile Legends", OrderName = "Rank",
        Buyer = "Buyer Dua", Task = "Mythic", EmployeeName = "Budi",
        EmployeeCode = "FH302", Status = "in_progress" },
};

Assert(OrderFilters.Pending(orders, "").Count() == 2, "empty pending search does not hide data");
Assert(OrderFilters.Pending(orders, "x4671").Single().OrderRef == "X4671", "reference lookup ignores case");
Assert(OrderFilters.Pending(orders, "AION 50").Single().OrderRef == "X4671", "search spans game + task");
Assert(OrderFilters.Pending(orders, "fh3 demo").Single().OrderRef == "X4671", "Discord search matches pending order");
Assert(OrderFilters.Active(orders, "FH3 Demo", "assigned").Single().OrderRef == "X4671", "Discord search matches active task");
Assert(!OrderFilters.Pending(orders, "AION mobile").Any(), "all query terms must match");
Assert(OrderFilters.Active(orders, "", "assigned").Single().EmployeeName == "Mulyana", "status assigned filter");
Assert(OrderFilters.Active(orders, "BUDI", "Semua Status").Single().OrderRef == "X9001", "search employee in tasks");
Assert(!OrderFilters.Active(orders, "X4671", "in_progress").Any(), "status + text filter combined");
Assert(OrderFilters.Active(orders, "", "Semua Status").Count() == 2, "all active tasks visible");

var employees = new List<Employee>
{
    new() { Code = "FH301", Name = "Mulyana", Team = "FH3", LocalStatus = "WORK" },
    new() { Code = "FH302", Name = "Budi", Team = "FH3", LocalStatus = "SLEEP" },
};
Assert(OrderFilters.Employees(employees, "Mulyana").Single().Code == "FH301", "employee name search");
Assert(OrderFilters.Employees(employees, "Tidur").Single().Name == "Budi", "local status search");
Assert(OrderFilters.Employees(employees, "fh3 FH302").Single().Name == "Budi", "employee team and code search");

Console.WriteLine("All CP Boost Monitor Windows search/filter checks passed.");

var tempRoot = Path.Combine(Path.GetTempPath(), "evogaming-sleep-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(tempRoot);
try
{
    var localFile = Path.Combine(tempRoot, "local-status.json");
    var store = new LocalStatusStore(localFile);
    var worker = new Employee { Code = "FH3-TEST", Name = "Uji Sleep", Team = "FH3", Active = true };
    var now = new DateTimeOffset(2026, 10, 20, 1, 0, 0, TimeSpan.Zero);

    store.Set(worker, "SLEEP", now: now);
    Assert(store.Get(worker.Code) == "SLEEP", "sleep starts without selecting a duration");
    Assert(store.GetSleep(worker.Code)!.StartedAt == now, "sleep start persisted");
    Assert(store.Display(worker.Code, now) == "Tidur • 00:00:00", "clock starts at zero");
    Assert(store.Display(worker.Code, now.AddSeconds(1)) == "Tidur • 00:00:01", "elapsed seconds increase");
    Assert(store.Display(worker.Code, now.AddHours(26).AddMinutes(3).AddSeconds(4)) == "Tidur • 26:03:04", "sleep has no 24-hour limit");
    Assert(store.Display(worker.Code, now.AddHours(-1)) == "Tidur • 00:00:00", "clock rollback does not display negative sleep");
    store.Set(worker, "SLEEP", now: now.AddHours(1));
    Assert(store.GetSleep(worker.Code)!.StartedAt == now && store.History.Count == 1, "repeated sleep preserves start and history");
    var reopened = new LocalStatusStore(localFile);
    Assert(reopened.Get(worker.Code) == "SLEEP", "restart never changes sleeping worker to Ready");
    Assert(reopened.Display(worker.Code, now.AddHours(2)) == "Tidur • 02:00:00", "elapsed clock resumes after restart");
    reopened.Set(worker, "WORK", now: now.AddHours(2));
    Assert(reopened.GetSleep(worker.Code) is null, "leaving sleep clears active clock");
    Assert(reopened.History[0].Note.Contains("02:00:00"), "completed sleep duration remains in history");
    Assert(reopened.History.Count == 2, "status transitions retained");
    reopened.Set(worker, "SLEEP", now: now.AddHours(3));
    Assert(reopened.Display(worker.Code, now.AddHours(3).AddSeconds(10)) == "Tidur • 00:00:10", "next sleep starts a fresh clock");
    Assert(new LocalStatusStore(localFile).History.Count == 3, "sleep history survives subsequent restart");

    var legacyPath = Path.Combine(tempRoot, "old-status.json");
    var legacyJson = """{"Status":{"LEGACY":"SLEEP"},"Sleep":{"LEGACY":{"StartedAt":"2026-10-20T01:00:00Z","Until":"2026-10-20T02:00:00Z","DurationMinutes":60,"AutoReady":true}},"Events":[]}""";
    File.WriteAllText(legacyPath, legacyJson);
    var legacy = new LocalStatusStore(legacyPath);
    Assert(legacy.Get("LEGACY") == "SLEEP", "old expired auto-Ready deadline is ignored");
    Assert(legacy.Display("legacy", now.AddDays(3)) == "Tidur • 72:00:00", "old timer start and case-insensitive identity retained");
    Assert(File.ReadAllText(legacyPath) == legacyJson, "opening old snapshot does not rewrite history");
    File.WriteAllText(legacyPath, """{"Status":{"LEGACY":"SLEEP"},"Events":[{"EmployeeCode":"LEGACY","To":"SLEEP","ChangedAt":"2026-10-20T01:00:00Z"}]}""");
    Assert(new LocalStatusStore(legacyPath).Display("LEGACY", now.AddMinutes(5)) == "Tidur • 00:05:00", "legacy status event recovers actual start");
    File.WriteAllText(legacyPath, """{"Status":{"LEGACY":"SLEEP"},"Events":[]}""");
    Assert(new LocalStatusStore(legacyPath).Display("LEGACY", now) == "Tidur • waktu mulai tidak tercatat", "missing legacy start is never invented");
    File.WriteAllText(legacyPath, "unreadable original history");
    var unreadable = new LocalStatusStore(legacyPath);
    try {
        unreadable.Set(worker, "SLEEP", now: now);
        throw new Exception("Unreadable history must be protected");
    }
    catch (InvalidOperationException) { Assert(File.ReadAllText(legacyPath) == "unreadable original history", "corrupt original file cannot be overwritten"); }
    try {
        reopened.Set(worker, "INVALID", now: now);
        throw new Exception("Invalid status must fail");
    }
    catch (InvalidOperationException) { Assert(true, "invalid status is rejected"); }

}
finally
{
    var resolved = Path.GetFullPath(tempRoot);
    if (!resolved.StartsWith(Path.Combine(Path.GetTempPath(), "evogaming-sleep-tests-"), StringComparison.OrdinalIgnoreCase))
        throw new Exception("Unsafe cleanup target");
    Directory.Delete(resolved, recursive: true);
}
Console.WriteLine("All EVOGAMING single-page worker sleep tests passed.");

await ApiContractTests.Run();
