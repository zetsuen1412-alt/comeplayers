using System.Text.Json;

namespace CPBoostMonitor;

/// <summary>PC-only employee boosting states. Does not write to Payroll and does not sync Android SQLite.</summary>
public sealed class LocalStatusStore
{
    private sealed class Snapshot
    {
        public Dictionary<string, string> Status { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public List<StatusEvent> Events { get; set; } = new();
    }
    public sealed class StatusEvent
    {
        public DateTimeOffset ChangedAt { get; set; }
        public string EmployeeCode { get; set; } = "";
        public string EmployeeName { get; set; } = "";
        public string From { get; set; } = "";
        public string To { get; set; } = "";
    }

    private readonly string _file = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ComePlayers", "CPBoostMonitor", "local-status.json");
    private Snapshot _data = new();

    public LocalStatusStore()
    {
        try
        {
            if (File.Exists(_file))
                _data = JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(_file)) ?? new();
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Preserve corrupted file on disk for possible manual recovery.
            _data = new();
        }
    }

    public string Get(string code)
    {
        if (!_data.Status.TryGetValue(code, out var value)) return "READY";
        return value is "READY" or "IDLE" or "SLEEP" or "WORK" ? value : "READY";
    }
    public IReadOnlyList<StatusEvent> History => _data.Events.AsEnumerable().Reverse().Take(400).ToList();
    public void Set(Employee employee, string status)
    {
        if (status is not ("READY" or "IDLE" or "SLEEP" or "WORK"))
            throw new InvalidOperationException("Status boosting tidak valid.");
        var before = Get(employee.Code);
        if (before == status) return;
        _data.Status[employee.Code] = status;
        _data.Events.Add(new StatusEvent
        {
            ChangedAt = DateTimeOffset.Now, EmployeeCode = employee.Code,
            EmployeeName = employee.Name, From = before, To = status,
        });
        if (_data.Events.Count > 3000) _data.Events.RemoveRange(0, _data.Events.Count - 3000);
        Directory.CreateDirectory(Path.GetDirectoryName(_file)!);
        var tmp = _file + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(_data, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tmp, _file, true);
    }
}
