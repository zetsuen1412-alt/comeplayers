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
    public string DisplayLocalStatus => LocalStatus switch
    {
        "IDLE" => "Farming",
        "SLEEP" => "Tidur",
        "WORK" => "Sedang Bekerja",
        _ => "Ready Boosting",
    };
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
