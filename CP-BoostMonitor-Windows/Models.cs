namespace CPBoostMonitor;

public sealed class Employee
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Team { get; set; } = "";
    public string WorkforceStatus { get; set; } = "";
    public bool Active { get; set; }
    public string LocalStatus { get; set; } = "READY";
    public DateTimeOffset? SleepStartedAt { get; set; }
    public string DisplayLocalStatus
    {
        get
        {
            if (LocalStatus != "SLEEP") return LocalStatus switch
            {
                "IDLE" => "Farming", "WORK" => "Sedang Bekerja",
                "BREAK" => "Istirahat", "OFFLINE" => "Offline",
                _ => "Ready Boosting",
            };
            return "Tidur • " + LocalStatusStore.SleepElapsed(SleepStartedAt, DateTimeOffset.UtcNow);
        }
    }
    public override string ToString() => $"{Name} • {DisplayLocalStatus}";
}
public sealed class PayrollOrder
{
    public string OrderRef { get; set; } = "";
    public string OrderType { get; set; } = "";
    public string OrderName { get; set; } = "";
    public string Game { get; set; } = "";
    public string Discord { get; set; } = "";
    public string DisplayDiscord => string.IsNullOrWhiteSpace(Discord) ? "—" : Discord;
    public string Buyer { get; set; } = "";
    public string Task { get; set; } = "";
    public string EmployeeCode { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public string Status { get; set; } = "";
    public bool CanTake { get; set; }
    public bool UnlinkedPayroll { get; set; }
    public bool CanTakeWithoutPayroll { get; set; }
    public bool TakeAllowed => CanTake && (!UnlinkedPayroll || CanTakeWithoutPayroll) && !DeliveryUncertain;
    public bool CanStart { get; set; }
    public bool CanDone { get; set; }
    public bool DeliveryUncertain { get; set; }
    public string TakeStatus { get; set; } = "";
    public string StartStatus { get; set; } = "";
    public string ActionMessage { get; set; } = "";
    public string ActionLabel => CanTake ? "TAKE" : CanStart ? "START + Screenshot"
        : CanDone ? "DONE + Screenshot" : "Periksa status";
}
public sealed class ProofResult
{
    public string Caption { get; set; } = "";
    public string Status { get; set; } = "";
    public string ChatTitle { get; set; } = "";
    public bool AlreadySent { get; set; }
}

public sealed class CompletedSnapshot
{
    public int Schema { get; set; }
    public string Scope { get; set; } = "";
    public string SourceOfTruth { get; set; } = "";
    public string CompletionRule { get; set; } = "";
    public bool Complete { get; set; }
    public long Revision { get; set; }
    [System.Text.Json.Serialization.JsonRequired]
    public List<EmployeeCompletion> Employees { get; set; } = new();
    public string? SelectedEmployeeCode { get; set; }
    [System.Text.Json.Serialization.JsonRequired]
    public List<CompletedOrder> Work { get; set; } = new();
    [System.Text.Json.Serialization.JsonRequired]
    public CompletionTotals Totals { get; set; } = new();
    public int WorkTotal { get; set; }
    public int? NextOffset { get; set; }
    public string Notice { get; set; } = "";
}
public sealed class EmployeeCompletion
{
    public string EmployeeCode { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public int CompletedCount { get; set; }
    public string? LastCompletedAt { get; set; }
}
public sealed class CompletionTotals
{
    public int CompletedCount { get; set; }
    public int EmployeeCount { get; set; }
    public int Contributors { get; set; }
    public string? LastCompletedAt { get; set; }
}
public sealed class CompletedOrder
{
    public string EmployeeId { get; set; } = "";
    public string EmployeeCode { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public string OrderRef { get; set; } = "";
    public string Game { get; set; } = "";
    public string Discord { get; set; } = "";
    public string DisplayDiscord => string.IsNullOrWhiteSpace(Discord) ? "—" : Discord;
    public string Duration { get; set; } = "";
    public string Task { get; set; } = "";
    public string CompletedAt { get; set; } = "";
    public string CompletedDisplay => DateTimeOffset.TryParse(CompletedAt, out var stamp) ? stamp.ToLocalTime().ToString("dd MMM yyyy · HH:mm") : "—";
    public string? TelegramMessageUrl { get; set; }
    public bool Archived { get; set; }
    public string AdminState { get; set; } = "normal";
    public long? WageRupiah { get; set; }
    public string WageDisplay => WageRupiah is long wage ? $"Rp {wage:N0}" : "Belum dihargai";
    public bool Closed { get; set; }
    public string BookStatus => Closed ? "Dibukukan" : AdminState switch {"refund"=>"Refund","problem"=>"Bermasalah",_=>"Belum Tutup Buku"};
}

public sealed class ManagedOrder
{
    public string OrderRef { get; set; } = "";
    public string Game { get; set; } = "";
    public string Discord { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public string Status { get; set; } = "";
    public string AdminState { get; set; } = "normal";
    public bool MonitorArchived { get; set; }
    public long Version { get; set; }
    public long? WageRupiah { get; set; }
    public bool CanPrice { get; set; }
    public bool Closed { get; set; }
    public string WageDisplay => WageRupiah is long wage ? $"Rp {wage:N0}" : "Belum dihargai";
    public string StateDisplay => MonitorArchived ? "Dihapus (arsip)" : AdminState switch { "refund" => "Refund", "problem" => "Bermasalah", _ => Status };
}
public sealed class ClosingExpected { public string OrderRef { get; set; } = ""; public long Version { get; set; } public long WageRupiah { get; set; } }
public sealed class ManagementSnapshot
{
    public List<ManagedOrder> Orders { get; set; } = new();
    public List<ClosingExpected> Eligible { get; set; } = new();
    public long TotalRupiah { get; set; }
}
public sealed class MonitorBook
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string CreatedAt { get; set; } = "";
    public long TotalRupiah { get; set; }
    public int OrderCount { get; set; }
    public List<CompletedOrder> Work { get; set; } = new();
    public List<EmployeeBookTotal> Employees { get; set; } = new();
    public string TotalDisplay => $"Rp {TotalRupiah:N0}";
    public string DateDisplay => DateTimeOffset.TryParse(CreatedAt, out var t) ? t.ToLocalTime().ToString("dd MMM yyyy HH:mm") : "—";
}
public sealed class EmployeeBookTotal
{
    public string EmployeeId { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public int OrderCount { get; set; }
    public long TotalRupiah { get; set; }
    public string Display => $"{EmployeeName} • Rp {TotalRupiah:N0}";
}
public sealed class BookSnapshot
{
    public List<CompletedOrder> Open { get; set; } = new();
    public List<MonitorBook> Closings { get; set; } = new();
    public string Notice { get; set; } = "";
}
