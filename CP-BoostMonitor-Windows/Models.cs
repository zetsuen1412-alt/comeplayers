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
    public string ActionLabel => Status switch
    {
        "assigned" => "START + Screenshot",
        "in_progress" => "DONE + Screenshot",
        _ => "Belum bisa kirim",
    };
}
public sealed class ProofResult
{
    public string Caption { get; set; } = "";
    public string Status { get; set; } = "";
    public string ChatTitle { get; set; } = "";
    public bool AlreadySent { get; set; }
}
