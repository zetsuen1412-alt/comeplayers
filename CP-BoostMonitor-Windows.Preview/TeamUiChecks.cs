using CPBoostMonitor;

internal static class TeamUiChecks
{
    internal static void Run()
    {
        static void Check(bool value, string message) { if (!value) throw new Exception(message); Console.WriteLine("PASS: " + message); }
        using var host = new Form {ClientSize=new Size(1100,700),ShowInTaskbar=false,Opacity=0};
        var panel = new TakeOrderPanel(); host.Controls.Add(panel); host.Show();
        var grid = (DataGridView)panel.Controls.Find("ActiveTasks", true).Single();
        var edit = (Button)panel.Controls.Find("EditOrderTeam", true).Single();
        var done = (Button)panel.Controls.Find("DoneOrderProof", true).Single();
        var task = new PayrollOrder {OrderRef="X800",EmployeeCode="F1",EmployeeName="Adit",TeamSupported=true,Status="in_progress",CanDone=true,
            Participants=new(){new(){EmployeeCode="F1",EmployeeName="Adit",ShareBps=6000},new(){EmployeeCode="F2",EmployeeName="Budi",ShareBps=4000}}};
        panel.BindData(Array.Empty<Employee>(), Array.Empty<PayrollOrder>(), new[]{task}); panel.SetStale(false);
        grid.CurrentCell = grid.Rows[0].Cells[0];
        Check(!edit.Visible, "worker mode hides allocation editing");
        panel.SetAdminAccess(true);
        Check(edit.Visible && edit.Enabled && done.Enabled, "admin can edit team without resetting an in-progress order");
        string? selected = null; int proofs = 0;
        panel.TeamRequested += (_, order) => selected = order.OrderRef;
        panel.ProofRequested += (_, _) => proofs++;
        edit.PerformClick(); Check(selected == "X800" && proofs == 0, "opening team editor never sends a progress proof");
        Check(grid.Rows.Count == 1 && task.DisplayParticipants.Contains("60%") && task.DisplayParticipants.Contains("40%"), "team remains one lifecycle row with exact share summary");
        panel.SetStale(true); Check(!edit.Enabled, "stale data cannot open allocation editing");
        panel.SetStale(false); task.DeliveryUncertain = true; panel.BindData(Array.Empty<Employee>(), Array.Empty<PayrollOrder>(), new[]{task});
        Check(!edit.Enabled, "uncertain proof delivery blocks team changes");
        task.DeliveryUncertain = false; task.TeamSupported = false; panel.BindData(Array.Empty<Employee>(), Array.Empty<PayrollOrder>(), new[]{task});
        Check(!edit.Enabled, "unmigrated server cannot enable team changes");
        var roster = new[] {
            new Employee {Code="F2",Name="Budi",Team="FH3",Active=true},
            new Employee {Code="F1",Name="Adit",Team="FH3",Active=true},
            new Employee {Code="F3",Name="Citra",Team="FH3",Active=true},
        };
        using var dialog = new OrderTeamDialog("X800", roster, "F1", task.Participants, false) {ShowInTaskbar=false,Opacity=0};
        dialog.Show(); dialog.PerformLayout();
        var workers = dialog.Controls.Find("TeamWorker", true).Cast<ComboBox>().ToList();
        var save = (Button)dialog.Controls.Find("TeamSave", true).Single();
        Check(workers.Select(w => (w.SelectedItem as Employee)?.Code).SequenceEqual(new[]{"F1","F2"}) && workers.All(w => !w.Enabled),
            "team dialog preserves distinct existing workers after binding and layout");
        Check(save.Enabled, "reviewed 60/40 team can be saved");
        ((Button)dialog.Controls.Find("TeamAdd", true).Single()).PerformClick();
        workers = dialog.Controls.Find("TeamWorker", true).Cast<ComboBox>().ToList();
        Check(workers.Count == 3 && workers.Last().SelectedItem is null && !save.Enabled, "new participant requires explicit employee and positive share");
    }
}
