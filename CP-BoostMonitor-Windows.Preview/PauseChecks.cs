using CPBoostMonitor;
using System.Drawing.Imaging;

internal static class PauseChecks
{
    internal static void Run(string output)
    {
        static void Check(bool value,string label){if(!value)throw new Exception(label);Console.WriteLine("PASS: "+label);}
        using var host=new Form{ClientSize=new Size(1100,700),ShowInTaskbar=false,Opacity=0};
        var panel=new TakeOrderPanel();host.Controls.Add(panel);host.Show();
        var grid=(DataGridView)panel.Controls.Find("ActiveTasks",true).Single();
        var pause=(Button)panel.Controls.Find("PauseContinueOrder",true).Single();
        var done=(Button)panel.Controls.Find("DoneOrderProof",true).Single();
        var tasks=new[]{new PayrollOrder{OrderRef="X800",EmployeeName="Adit",Status="in_progress",CanPause=true,CanDone=true},
            new PayrollOrder{OrderRef="X900",EmployeeName="Budi",Status="paused",CanContinue=true}};
        panel.BindData(Array.Empty<Employee>(),Array.Empty<PayrollOrder>(),tasks);panel.SetStale(false);
        var actions=new List<string>();panel.ProofRequested+=(_,proof)=>actions.Add(proof.Action+":"+proof.Task.OrderRef);
        Check(!pause.Enabled,"PAUSE requires deliberate task selection");
        grid.CurrentCell=grid.Rows[0].Cells[0];
        Check(pause.Enabled && done.Enabled && pause.Text=="PAUSE + Foto","running task offers PAUSE alongside DONE");
        pause.PerformClick();Check(actions.SequenceEqual(new[]{"pause:X800"}),"PAUSE targets the selected task exactly once");
        grid.CurrentCell=grid.Rows[1].Cells[0];
        Check(pause.Enabled && !done.Enabled && pause.Text=="CONTINUE","paused task offers CONTINUE and blocks DONE");
        pause.PerformClick();Check(actions.Last()=="continue:X900" && actions.Count==2,"CONTINUE preserves its selected task");
        host.PerformLayout();using(var image=new Bitmap(host.Width,host.Height)){
            host.DrawToBitmap(image,new Rectangle(Point.Empty,host.Size));image.Save(Path.Combine(output,"monitor-pause-continue.png"),ImageFormat.Png);
        }
        panel.SetWorking(true);Check(!pause.Enabled,"busy state blocks repeated PAUSE/CONTINUE");
        panel.SetWorking(false);panel.SetStale(true);Check(!pause.Enabled,"stale task data blocks PAUSE/CONTINUE");
        panel.SetStale(false);tasks[1].DeliveryUncertain=true;panel.BindData(Array.Empty<Employee>(),Array.Empty<PayrollOrder>(),tasks);
        Check(!pause.Enabled && !done.Enabled,"uncertain Telegram state cannot resume or finish work");
    }
}
