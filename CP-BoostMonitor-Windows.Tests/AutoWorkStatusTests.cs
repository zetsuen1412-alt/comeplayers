using CPBoostMonitor;

internal static class AutoWorkStatusTests
{
    internal static void Run()
    {
        static void Check(bool value, string label) { if (!value) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        var root = Path.Combine(Path.GetTempPath(), "fh3-auto-work-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var path = Path.Combine(root, "status.json"); var store = new LocalStatusStore(path);
            var employee = new Employee { Id = "e1", Code = "E1", Name = "Contoh", Team = "FH3", Active = true };
            Check(store.MarkWorkingAfterConfirmedTake(employee, "X100"), "confirmed TAKE moves Ready to Work");
            Check(store.Get("E1") == "WORK" && store.History.Single().Note.Contains("TAKE X100"), "automatic Work is persisted with its TAKE reason");
            var reopened = new LocalStatusStore(path);
            Check(reopened.Get("E1") == "WORK", "automatic Work survives restart");
            Check(!reopened.MarkWorkingAfterConfirmedTake(employee, "X100") && reopened.History.Count == 1, "rechecking confirmed TAKE does not duplicate status history");
            reopened.Set(employee, "IDLE");
            Check(reopened.MarkWorkingAfterConfirmedTake(employee, "X101") && reopened.Get("E1") == "WORK", "a farming employee taking an order becomes Work");
            var started = new DateTimeOffset(2026, 10, 25, 1, 0, 0, TimeSpan.Zero);
            reopened.Set(employee, "SLEEP", started); int count = reopened.History.Count;
            Check(!reopened.MarkWorkingAfterConfirmedTake(employee, "X102") && reopened.GetSleep("E1")!.StartedAt == started
                && reopened.History.Count == count, "automatic TAKE never wakes a sleeping employee or resets the sleep clock");
            foreach (var status in new[] { "BREAK", "OFFLINE" }) {
                reopened.Set(employee, status); Check(!reopened.MarkWorkingAfterConfirmedTake(employee, "X102") && reopened.Get("E1") == status, "manual " + status + " is preserved");
            }
            reopened.Set(employee, "READY");
            PayrollOrder Task(string takeStatus = "sent", string state = "assigned", bool uncertain = false) => new() {
                OrderRef = "X200", EmployeeId = "e1", EmployeeCode = "E1", TakeStatus = takeStatus,
                Status = state, DeliveryUncertain = uncertain, CanStart = true
            };
            foreach (var task in new[] { Task("missing"), Task("unknown"), Task("failed"), Task(uncertain: true), Task(state: "completed"), Task(state: "cancelled") }) {
                reopened.ApplyConfirmedTasks(new[] { employee }, new[] { task });
                Check(reopened.Get("E1") == "READY", "unconfirmed, uncertain or terminal task cannot mark Work: " + task.TakeStatus + "/" + task.Status);
            }
            var blocked = Task(); blocked.CanStart = false;
            reopened.ApplyConfirmedTasks(new[] { employee }, new[] { blocked });
            Check(reopened.Get("E1") == "READY", "server-blocked work cannot start a new Work status");
            var wrong = Task(); wrong.EmployeeId = "someone-else";
            reopened.ApplyConfirmedTasks(new[] { employee }, new[] { wrong });
            Check(reopened.Get("E1") == "READY", "reused employee code cannot override stable employee identity");
            reopened.ApplyConfirmedTasks(new[] { employee, new Employee { Id = "e2", Code = "E1", Active = true, Team = "FH3" } }, new[] { Task() });
            Check(reopened.Get("E1") == "READY", "ambiguous roster identity cannot mark Work");
            reopened.ApplyConfirmedTasks(new[] { employee }, new[] { Task() });
            Check(reopened.Get("E1") == "WORK", "fresh confirmed TAKE from another device marks Work during refresh");
            count = reopened.History.Count; reopened.ApplyConfirmedTasks(new[] { employee }, new[] { Task(), Task() });
            Check(reopened.History.Count == count, "repeated polling and multiple active orders do not duplicate Work events");
            reopened.ApplyConfirmedTasks(new[] { employee }, Array.Empty<PayrollOrder>());
            Check(reopened.Get("E1") == "WORK", "empty task list does not invent an automatic Ready transition");
            var broken = Path.Combine(root, "broken.json"); File.WriteAllText(broken, "original unreadable history");
            try { new LocalStatusStore(broken).MarkWorkingAfterConfirmedTake(employee, "X200"); throw new Exception("Corrupt history was overwritten"); }
            catch (InvalidOperationException) { Check(File.ReadAllText(broken) == "original unreadable history", "automatic Work cannot overwrite unreadable local history"); }
        }
        finally {
            var full = Path.GetFullPath(root);
            if (!full.StartsWith(Path.Combine(Path.GetTempPath(), "fh3-auto-work-"), StringComparison.OrdinalIgnoreCase)) throw new Exception("Unsafe test cleanup");
            Directory.Delete(full, true);
        }
    }
}
