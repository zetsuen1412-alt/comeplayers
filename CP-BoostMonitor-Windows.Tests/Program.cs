using CPBoostMonitor;

static void Assert(bool check, string name)
{
    if (!check) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

var orders = new List<PayrollOrder>
{
    new() { OrderRef = "X4671", Game = "AION 2", OrderName = "Boost Level",
        Buyer = "Admin Test", Task = "Level 50", EmployeeName = "Mulyana",
        EmployeeCode = "FH301", Status = "assigned" },
    new() { OrderRef = "X9001", Game = "Mobile Legends", OrderName = "Rank",
        Buyer = "Buyer Dua", Task = "Mythic", EmployeeName = "Budi",
        EmployeeCode = "FH302", Status = "in_progress" },
};

Assert(OrderFilters.Pending(orders, "").Count() == 2, "empty pending search does not hide data");
Assert(OrderFilters.Pending(orders, "x4671").Single().OrderRef == "X4671", "reference lookup ignores case");
Assert(OrderFilters.Pending(orders, "AION 50").Single().OrderRef == "X4671", "search spans game + task");
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

    store.Set(worker, "SLEEP", 60, true, now);
    Assert(store.Get(worker.Code) == "SLEEP", "new sleep status persisted");
    Assert(store.GetSleep(worker.Code)!.DurationMinutes == 60, "sleep duration stored");
    Assert(store.GetSleep(worker.Code)!.Until == now.AddHours(1), "sleep deadline stored");
    Assert(!store.ApplyExpired(now.AddMinutes(59)), "sleep countdown not finished early");
    Assert(store.ApplyExpired(now.AddHours(1)), "sleep auto-Ready at deadline");
    Assert(store.Get(worker.Code) == "READY", "worker automatically Ready after sleep ends");
    Assert(!store.ApplyExpired(now.AddHours(2)), "expiry is idempotent");

    store.Set(worker, "SLEEP", 30, false, now);
    Assert(!store.ApplyExpired(now.AddHours(1)), "manual sleep does not auto-end");
    Assert(store.Get(worker.Code) == "SLEEP", "worker remains asleep without auto-Ready");
    Assert(store.Display(worker.Code, now.AddHours(1)).Contains("durasi habis"),
        "expired manual sleep is visible");
    store.Set(worker, "WORK", now: now.AddHours(1));
    Assert(store.GetSleep(worker.Code) is null, "new non-sleep status clears timer");

    var reopened = new LocalStatusStore(localFile);
    Assert(reopened.Get(worker.Code) == "WORK", "status survives application restart");
    Assert(reopened.GetSleep(worker.Code) is null, "cleared timer stays cleared after restart");
    Assert(reopened.History.Count >= 4, "auto and manual status changes audited");

    try
    {
        reopened.Set(worker, "SLEEP", 0);
        throw new Exception("Zero-minute sleep must fail");
    }
    catch (InvalidOperationException) { Assert(true, "invalid 0-minute sleep blocked"); }
    try
    {
        reopened.Set(worker, "SLEEP", 1441);
        throw new Exception("Too-long sleep must fail");
    }
    catch (InvalidOperationException) { Assert(true, "sleep limit 1440 minutes enforced"); }

    var legacyPath = Path.Combine(tempRoot, "old-status.json");
    File.WriteAllText(legacyPath, "{\"Status\":{\"LEGACY\":\"SLEEP\"},\"Events\":[]}");
    var legacy = new LocalStatusStore(legacyPath);
    Assert(legacy.Get("LEGACY") == "SLEEP", "legacy status file still readable");
    Assert(legacy.Display("LEGACY", DateTimeOffset.UtcNow) == "Tidur • manual",
        "legacy sleep without timer remains manual");
}
finally
{
    Directory.Delete(tempRoot, recursive: true);
}
Console.WriteLine("All EVOGAMING single-page worker sleep tests passed.");
