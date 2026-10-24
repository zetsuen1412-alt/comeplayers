using CPBoostMonitor;

internal static class PendingArchiveChecks
{
    internal static void Run()
    {
        static void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }
        using var host = new Form { ClientSize = new Size(1100, 700), ShowInTaskbar = false, Opacity = 0 };
        var panel = new TakeOrderPanel(); host.Controls.Add(panel); host.Show();
        var grid = (DataGridView)panel.Controls.Find("PendingOrders", true).Single();
        var delete = (Button)panel.Controls.Find("DeletePendingOrder", true).Single();
        var search = (TextBox)panel.Controls.Find("PendingOrderSearch", true).Single();
        var orders = new List<PayrollOrder> { new() { OrderRef = "X100", CanTake = true }, new() { OrderRef = "X200", CanTake = true } };
        var workers = new List<Employee> { new() { Code = "F001", Name = "Data Contoh", Team = "FH3", Active = true } };
        panel.BindData(workers, orders, Array.Empty<PayrollOrder>()); panel.SetStale(false);
        int archiveCalls = 0, takeCalls = 0; string? archived = null;
        panel.ArchiveRequested += (_, order) => { archiveCalls++; archived = order.OrderRef; };
        panel.TakeRequested += (_, _) => takeCalls++;
        Check(!delete.Visible && !delete.Enabled, "employee never sees or enables pending-order deletion");
        panel.SetAdminAccess(true);
        Check(delete.Visible && !delete.Enabled, "admin sees Hapus Order but must explicitly select an order");
        grid.CurrentCell = grid.Rows[1].Cells[0]; grid.Rows[1].Selected = true;
        Check(panel.SelectedWorker is null, "pending-order selection does not implicitly select a worker");
        Check(delete.Enabled, "pending order deletion does not require a worker or TAKE");
        delete.PerformClick();
        Check(archiveCalls == 1 && archived == "X200" && takeCalls == 0, "delete requests only the selected order and never assigns it");
        panel.SetWorking(true); delete.PerformClick(); Check(!delete.Enabled && archiveCalls == 1, "busy deletion cannot be clicked twice");
        panel.SetWorking(false); panel.SetStale(true); Check(!delete.Enabled, "stale queue cannot enable deletion");
        panel.SetStale(false); search.Text = "X100"; Check(!delete.Enabled, "filtering away the selected order clears the delete target");
        search.Clear(); grid.CurrentCell = grid.Rows[0].Cells[0];
        panel.BindData(workers, new[] { orders[1] }, Array.Empty<PayrollOrder>());
        Check(!delete.Enabled, "refresh removes a disappearing order from the delete target");
        panel.SetAdminAccess(false); Check(!delete.Visible && !delete.Enabled, "logout or role revocation hides the delete action");

        using var dialog = new ArchiveOrderDialog(new ManagedOrder { OrderRef = "X200", Status = "Order baru" });
        dialog.Show();
        var reason = (TextBox)dialog.Controls.Find("ArchiveReason", true).Single();
        var confirm = (Button)dialog.Controls.Find("ConfirmArchive", true).Single();
        Check(!confirm.Enabled, "empty deletion reason cannot confirm");
        reason.Text = "  ab  "; Check(!confirm.Enabled, "whitespace cannot satisfy the deletion reason");
        reason.Text = "  Order duplikat  "; Check(confirm.Enabled && dialog.Reason == "Order duplikat", "valid deletion reason enables explicit confirmation");
        dialog.Close();
    }
}
