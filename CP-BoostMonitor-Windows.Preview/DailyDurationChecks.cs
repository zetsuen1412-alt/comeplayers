using CPBoostMonitor;
using System.Drawing.Imaging;

internal static class DailyDurationChecks
{
    internal static void Run(string output)
    {
        static void Check(bool value,string label){if(!value)throw new Exception(label);Console.WriteLine("PASS: "+label);}
        using var host=new Form{ClientSize=new Size(1440,820),ShowInTaskbar=false,Opacity=0};
        var panel=new TakeOrderPanel();host.Controls.Add(panel);host.Show();
        var grid=(DataGridView)panel.Controls.Find("ActiveTasks",true).Single();
        var start=(Button)panel.Controls.Find("StartOrderProof",true).Single();
        var done=(Button)panel.Controls.Find("DoneOrderProof",true).Single();
        var task=new PayrollOrder{OrderRef="X5207",EmployeeName="ADIT3",EmployeeCode="E1",Status="assigned",CanStart=true,
            Daily=true,Duration="8hours x7",DurationDisplay="8 jam × 7 hari",DayNumber=2,CompletedDays=1,TotalDays=7,DailyRevision=2,
            DailyCycleId="00000000-0000-4000-8000-000000000001",Discord="Discord Demo",ActionMessage="Day 2/7 · 1 hari selesai. Unggah START untuk hari ini."};
        var pending=new[]{new PayrollOrder{OrderRef="X5210",Game="AION2",Duration="1 month",DurationDisplay="30 hari",CanTake=true}};
        var people=new[]{new Employee{Id="e1",Code="E1",Name="ADIT3",Team="FH3",Active=true,LocalStatus="WORK"}};
        panel.BindData(people,pending,new[]{task});panel.SetStale(false);
        grid.CurrentCell=grid.Rows[0].Cells[0];
        Check(grid.Columns.Cast<DataGridViewColumn>().Any(c=>c.HeaderText=="DURATION"&&c.DataPropertyName=="DisplayDuration"),"active grid exposes Duration column");
        Check(start.Enabled&&!done.Enabled&&start.Text=="START Day 2","next day requires START and shows its reviewed day");
        var actions=new List<string>();panel.ProofRequested+=(_,p)=>actions.Add(p.Action+":"+p.Task.DayNumber);
        start.PerformClick();Check(actions.SequenceEqual(new[]{"start:2"}),"daily click retains day number for the photo confirmation");
        task.Status="in_progress";task.CanStart=false;task.CanDone=true;panel.BindData(people,pending,new[]{task});grid.CurrentCell=grid.Rows[0].Cells[0];
        Check(done.Enabled&&done.Text=="DONE Day 2","running daily task labels DONE with its day");
        host.PerformLayout();
        Check(grid.Rows[0].Height>=grid.Rows[0].GetPreferredHeight(0,DataGridViewAutoSizeRowMode.AllCells,true),"Duration and day progress fit their row without clipping");
        using(var image=new Bitmap(host.Width,host.Height)){
            host.DrawToBitmap(image,new Rectangle(Point.Empty,host.Size));image.Save(Path.Combine(output,"monitor-daily-duration.png"),ImageFormat.Png);
        }
        task.DeliveryUncertain=true;panel.BindData(people,pending,new[]{task});grid.CurrentCell=grid.Rows[0].Cells[0];
        Check(!start.Enabled&&!done.Enabled,"uncertain daily reports cannot advance the day");
    }
}
