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
    public DateTimeOffset? SleepUntil { get; set; }
    public bool SleepAutoReady { get; set; }
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
            if (!SleepUntil.HasValue) return "Tidur • manual";
            var remaining = SleepUntil.Value - DateTimeOffset.UtcNow;
            if (remaining <= TimeSpan.Zero) return SleepAutoReady ?
                "Tidur • menunggu auto Ready" : "Tidur • waktu habis";
            var minutes = (int)Math.Ceiling(remaining.TotalMinutes);
            return minutes >= 60 ? $"Tidur • {minutes / 60}j {minutes % 60}m lagi" :
                $"Tidur • {minutes}m lagi";
        }
    }
    public override string ToString() => $"{Name} • {Code} • {DisplayLocalStatus}";
}
public sealed class PayrollOrder
{
    public string OrderRef { get; set; } = "";
    public string OrderType { get; set; } = "";
    public string OrderName { get; set; } = "";
    public string Game { get; set; } = "";
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

public sealed class EarningsSnapshot
{
    public int Schema { get; set; }
    public string Scope { get; set; } = "";
    public string Currency { get; set; } = "";
    public long Revision { get; set; }
    public List<EmployeeEarnings> Employees { get; set; } = new();
    public string? SelectedEmployeeCode { get; set; }
    public List<WorkRecord> Work { get; set; } = new();
    public int WorkTotal { get; set; }
    public int? NextOffset { get; set; }
    public string Notice { get; set; } = "";
}
public sealed class EmployeeEarnings
{
    public string EmployeeCode { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public string Division { get; set; } = "";
    public string WorkforceStatus { get; set; } = "";
    public decimal SharePercent { get; set; }
    public long EarningMinor { get; set; }
    public long OperationalMinor { get; set; }
    public long PenaltyMinor { get; set; }
    public long BonusTipsMinor { get; set; }
    public long KasbonMinor { get; set; }
    public long NetMinor { get; set; }
    public long ClosedNetMinor { get; set; }
    public int ActiveOrderCount { get; set; }
    public int AwaitingVerificationCount { get; set; }
    public int VerifiedWorkCount { get; set; }
    public int UnvaluedOrderCount { get; set; }
}
public sealed class WorkRecord
{
    public string Id { get; set; } = "";
    public string OrderRef { get; set; } = "";
    public string Game { get; set; } = "";
    public string Date { get; set; } = "";
    public string Status { get; set; } = "";
    public string Schedule { get; set; } = "";
    public bool Archived { get; set; }
    public bool Closed { get; set; }
}
