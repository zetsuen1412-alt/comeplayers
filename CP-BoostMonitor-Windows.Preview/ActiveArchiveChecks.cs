using CPBoostMonitor;

internal static class ActiveArchiveChecks
{
    internal static void Run()
    {
        static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        using var host = new Form { ClientSize = new Size(1100, 700), ShowInTaskbar = false, Opacity = 0 };
        var panel = new TakeOrderPanel(); host.Controls.Add(panel); host.Show();
        var active = (DataGridView)panel.Controls.Find("ActiveTasks", true).Single();
        var pending = (DataGridView)panel.Controls.Find("PendingOrders", true).Single();
        var delete = (Button)panel.Controls.Find("DeleteActiveOrder", true).Single();
        var tasks = new List<PayrollOrder> {
            new() { OrderRef = "X300", EmployeeName = "Contoh A", Status = "assigned", CanTake = true },
            new() { OrderRef = "X400", EmployeeName = "Contoh B", Status = "in_progress", CanDone = true }
        };
        var newOrders = new[] { new PayrollOrder { OrderRef = "X200", CanTake = true } };
        panel.BindData(Array.Empty<Employee>(), newOrders, tasks); panel.SetStale(false);
        int archiveCalls = 0, sideEffects = 0; string? target = null;
        panel.ArchiveRequested += (_, order) => { archiveCalls++; target = order.OrderRef; };
        panel.TakeRequested += (_, _) => sideEffects++;
        panel.TakeTelegramRequested += (_, _) => sideEffects++;
        panel.ProofRequested += (_, _) => sideEffects++;
        Check(!delete.Visible && !delete.Enabled, "employee cannot see or enable active-order deletion");
        panel.SetAdminAccess(true);
        Check(delete.Visible && !delete.Enabled, "active delete requires an explicit task selection");
        pending.CurrentCell = pending.Rows[0].Cells[0];
        Check(!delete.Enabled, "pending selection never enables the active-task delete button");
        active.CurrentCell = active.Rows[1].Cells[0];
        Check(delete.Enabled && panel.SelectedWorker is null, "in-progress order can be archived without selecting a worker or sending DONE");
        delete.PerformClick();
        Check(archiveCalls == 1 && target == "X400" && sideEffects == 0, "active delete targets its own selected row and never sends TAKE/START/DONE");
        active.CurrentCell = active.Rows[0].Cells[0]; delete.PerformClick();
        Check(archiveCalls == 2 && target == "X300", "moving the current active row updates the archive target");
        panel.SetWorking(true); delete.PerformClick(); Check(!delete.Enabled && archiveCalls == 2, "busy active deletion cannot be repeated");
        panel.SetWorking(false); panel.SetStale(true); Check(!delete.Enabled, "stale active tasks cannot be deleted");
        panel.SetStale(false); tasks[0].DeliveryUncertain = true; panel.BindData(Array.Empty<Employee>(), newOrders, tasks);
        Check(!delete.Enabled, "uncertain Telegram delivery blocks active deletion");
        tasks[0].DeliveryUncertain = false; panel.BindData(Array.Empty<Employee>(), newOrders, tasks);
        Check(delete.Enabled, "resolved Telegram state restores the explicit active selection");
        panel.BindData(Array.Empty<Employee>(), newOrders, new[] { tasks[1] });
        Check(!delete.Enabled, "an active task removed during refresh cannot remain a delete target");
        panel.SetAdminAccess(false);
        Check(!delete.Visible && !delete.Enabled, "revoking admin access hides active deletion");
    }
}
