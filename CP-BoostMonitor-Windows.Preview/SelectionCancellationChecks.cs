using CPBoostMonitor;

internal static class SelectionCancellationChecks
{
    internal static void Run()
    {
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS: " + message); }
        static bool Empty(DataGridView grid) => grid.CurrentCell is null && grid.SelectedRows.Count == 0;
        using var host = new Form {ClientSize=new Size(1100,700),ShowInTaskbar=false,Opacity=0};
        var panel = new TakeOrderPanel(); host.Controls.Add(panel); host.Show();
        T Find<T>(string name) where T : Control => (T)panel.Controls.Find(name, true).Single();
        var workers = Find<DataGridView>("WorkerList"); var orders = Find<DataGridView>("PendingOrders"); var tasks = Find<DataGridView>("ActiveTasks");
        var clearWorker = Find<Button>("ClearSelectedWorker"); var clearOrder = Find<Button>("ClearSelectedOrder"); var clearTask = Find<Button>("ClearActiveTaskSelection");
        var take = Find<Button>("TakeSelectedOrder"); var status = Find<Button>("SaveWorkerStatus"); var done = Find<Button>("DoneOrderProof");
        var people = new[] { new Employee {Id="a",Code="F1",Name="Adit",Active=true,Team="FH3"}, new Employee {Id="b",Code="F2",Name="Budi",Active=true,Team="FH3"} };
        var pending = new[] { new PayrollOrder {OrderRef="X800",CanTake=true}, new PayrollOrder {OrderRef="X900",CanTake=true} };
        var active = new[] { new PayrollOrder {OrderRef="X700",EmployeeCode="F1",EmployeeName="Adit",TeamSupported=true,Status="in_progress",CanDone=true,CanPause=true} };
        int mutations = 0;
        panel.TakeRequested += (_, _) => mutations++; panel.StatusRequested += (_, _) => mutations++;
        panel.ProofRequested += (_, _) => mutations++; panel.TakeTelegramRequested += (_, _) => mutations++;
        panel.TeamRequested += (_, _) => mutations++; panel.ArchiveRequested += (_, _) => mutations++;
        void Refresh() => panel.BindData(people, pending, active);
        panel.SetAdminAccess(true); Refresh(); panel.SetStale(false);
        workers.CurrentCell = workers.Rows[0].Cells[0]; orders.CurrentCell = orders.Rows[0].Cells[0];
        Check(take.Enabled && status.Enabled && clearWorker.Enabled && clearOrder.Enabled, "explicit worker and order choices enable independent cancellation");
        clearWorker.PerformClick();
        Check(panel.SelectedWorker is null && Empty(workers) && !status.Enabled && !take.Enabled, "worker cancellation clears key, current cell and highlight and disables worker actions");
        Check(orders.CurrentRow?.DataBoundItem is PayrollOrder {OrderRef:"X800"} && clearOrder.Enabled, "worker cancellation preserves selected order");
        Find<TextBox>("WorkerSearch").Focus(); workers.Focus(); Application.DoEvents();
        Check(Empty(workers) && panel.SelectedWorker is null, "focus cannot resurrect cancelled worker");
        Refresh(); Find<TextBox>("WorkerSearch").Text = "Budi"; Find<TextBox>("WorkerSearch").Clear();
        Find<ComboBox>("WorkerStatusFilter").SelectedIndex = 1; Find<ComboBox>("WorkerStatusFilter").SelectedIndex = 0;
        Check(Empty(workers) && panel.SelectedWorker is null && !take.Enabled, "refresh and worker filtering cannot resurrect cancelled worker");
        workers.CurrentCell = workers.Rows[0].Cells[0];
        Check(panel.SelectedWorker?.Code == "F1" && take.Enabled, "same worker can be deliberately selected again");
        clearOrder.PerformClick();
        Check(Empty(orders) && !take.Enabled && !clearOrder.Enabled && panel.SelectedWorker?.Code == "F1" && status.Enabled,
            "order cancellation preserves worker while disabling TAKE");
        Find<TextBox>("PendingOrderSearch").Focus(); orders.Focus(); Application.DoEvents();
        Refresh(); Find<TextBox>("PendingOrderSearch").Text = "X900"; Find<TextBox>("PendingOrderSearch").Clear();
        Check(Empty(orders) && !take.Enabled && !clearOrder.Enabled, "focus, refresh and order filtering cannot resurrect cancelled order");
        orders.CurrentCell = orders.Rows[0].Cells[0];
        Check(take.Enabled && clearOrder.Enabled, "same order can be deliberately selected again");
        tasks.CurrentCell = tasks.Rows[0].Cells[0];
        Check(done.Enabled && clearTask.Enabled, "active task selection has a separate cancellation control");
        clearTask.PerformClick();
        Check(Empty(tasks) && !done.Enabled && !Find<Button>("PauseContinueOrder").Enabled && !Find<Button>("EditOrderTeam").Enabled && take.Enabled,
            "active cancellation disables report actions without altering pending choices");
        tasks.Focus(); Application.DoEvents(); Refresh();
        Check(Empty(tasks) && !done.Enabled && !clearTask.Enabled, "active selection stays empty after focus and refresh");
        tasks.CurrentCell = tasks.Rows[0].Cells[0]; panel.SetWorking(true);
        Check(!clearWorker.Enabled && !clearOrder.Enabled && !clearTask.Enabled, "sending state blocks cancellation of reviewed choices");
        clearWorker.PerformClick(); clearOrder.PerformClick(); clearTask.PerformClick(); panel.SetWorking(false);
        Check(panel.SelectedWorker?.Code == "F1" && take.Enabled && done.Enabled, "blocked cancellation preserves all choices during a send");
        panel.SetStale(true); clearOrder.PerformClick();
        Check(Empty(orders) && panel.SelectedWorker?.Code == "F1", "stale snapshots still allow local cancellation");
        Check(mutations == 0, "cancellation never dispatches TAKE, status, archive, team or proof operations");
        Check(clearWorker.AccessibleName == "Batalkan pilihan karyawan" && clearOrder.AccessibleName == "Batalkan pilihan order baru",
            "separate cancellation controls expose their purpose to assistive technology");
    }
}
