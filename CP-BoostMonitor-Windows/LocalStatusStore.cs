using System.Text.Json;

namespace CPBoostMonitor;

/// <summary>
/// PC-only employee status and elapsed sleep clock. Does not modify Payroll/Android.
/// Legacy local-status.json snapshots containing Status/Events are read unchanged.
/// </summary>
public sealed class LocalStatusStore
{
    private sealed class Snapshot
    {
        public Dictionary<string, string> Status { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SleepSchedule> Sleep { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public List<StatusEvent> Events { get; set; } = new();
    }

    public sealed class SleepSchedule
    {
        public DateTimeOffset StartedAt { get; set; }
        // Retained for old snapshots only. Deadlines never change employee status.
        public DateTimeOffset Until { get; set; }
        public int DurationMinutes { get; set; }
        public bool AutoReady { get; set; }
    }

    public sealed class StatusEvent
    {
        public DateTimeOffset ChangedAt { get; set; }
        public string EmployeeCode { get; set; } = "";
        public string EmployeeName { get; set; } = "";
        public string From { get; set; } = "";
        public string To { get; set; } = "";
        public string Note { get; set; } = "";
    }

    private readonly string _file;
    private Snapshot _data = new();
    private bool _unreadable;

    public LocalStatusStore(string? storagePath = null)
    {
        _file = storagePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ComePlayers", "CPBoostMonitor", "local-status.json");
        try
        {
            if (File.Exists(_file))
                _data = JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(_file)) ?? new();
            _data.Status ??= new(StringComparer.OrdinalIgnoreCase);
            _data.Sleep ??= new(StringComparer.OrdinalIgnoreCase);
            _data.Events ??= new();
            _data.Status = new(_data.Status, StringComparer.OrdinalIgnoreCase);
            _data.Sleep = new(_data.Sleep, StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Keep original file on disk if corrupted: never destroy employee history.
            _data = new();
            _unreadable = true;
        }
    }

    public string Get(string code)
    {
        if (!_data.Status.TryGetValue(code, out var value)) return "READY";
        return value is "READY" or "IDLE" or "SLEEP" or "WORK" or "BREAK" or "OFFLINE"
            ? value : "READY";
    }

    public SleepSchedule? GetSleep(string code)
    {
        if (Get(code) != "SLEEP") return null;
        if (_data.Sleep.TryGetValue(code, out var value) && value.StartedAt != default) return value;
        // Older snapshots without schedules may still have a reliable status event.
        var last = _data.Events.LastOrDefault(e => e.EmployeeCode.Equals(code, StringComparison.OrdinalIgnoreCase));
        return last is { To: "SLEEP" } && last.ChangedAt != default
            ? new SleepSchedule { StartedAt = last.ChangedAt } : null;
    }

    public static string SleepElapsed(DateTimeOffset? startedAt, DateTimeOffset now)
    {
        if (!startedAt.HasValue) return "waktu mulai tidak tercatat";
        var elapsed = now > startedAt.Value ? now - startedAt.Value : TimeSpan.Zero;
        return $"{(long)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";
    }

    public string Display(string code, DateTimeOffset now)
    {
        var value = Get(code);
        if (value != "SLEEP") return value switch
        {
            "IDLE" => "Farming", "WORK" => "Sedang Bekerja",
            "BREAK" => "Istirahat", "OFFLINE" => "Offline",
            _ => "Ready Boosting",
        };
        return "Tidur • " + SleepElapsed(GetSleep(code)?.StartedAt, now);
    }

    public IReadOnlyList<StatusEvent> History =>
        _data.Events.AsEnumerable().Reverse().Take(400).ToList();

    public bool MarkWorkingAfterConfirmedTake(Employee employee, string orderRef, DateTimeOffset? now = null)
    {
        if (!employee.Active || employee.Team != "FH3" || string.IsNullOrWhiteSpace(employee.Id) || string.IsNullOrWhiteSpace(employee.Code)
            || string.IsNullOrEmpty(orderRef) || !System.Text.RegularExpressions.Regex.IsMatch(orderRef, @"^X[0-9]{2,12}$")) return false;
        if (Get(employee.Code) is not ("READY" or "IDLE")) return false;
        Set(employee, "WORK", now, $"Otomatis setelah TAKE {orderRef} terkonfirmasi (lokal PC)");
        return true;
    }

    public void ApplyConfirmedTasks(IEnumerable<Employee> employees, IEnumerable<PayrollOrder> tasks)
    {
        var roster = employees.Where(e => e.Active && e.Team == "FH3").ToList();
        foreach (var task in tasks.Where(t => t.TakeStatus == "sent" && !t.DeliveryUncertain
            && (t.Status is "assigned" or "in_progress") && (t.CanStart || t.CanDone)))
        {
            var matches = roster.Where(e => e.Code.Equals(task.EmployeeCode, StringComparison.OrdinalIgnoreCase)).ToList();
            if (matches.Count != 1 || string.IsNullOrWhiteSpace(task.EmployeeId) || matches[0].Id != task.EmployeeId
                || roster.Count(e => e.Id == task.EmployeeId) != 1) continue;
            MarkWorkingAfterConfirmedTake(matches[0], task.OrderRef);
        }
    }

    public void Set(Employee employee, string status, DateTimeOffset? now = null, string? note = null)
    {
        if (status is not ("READY" or "IDLE" or "SLEEP" or "WORK" or "BREAK" or "OFFLINE"))
            throw new InvalidOperationException("Status karyawan tidak valid.");
        if (_unreadable)
            throw new InvalidOperationException("Riwayat status lokal belum dapat dibaca. Simpan cadangan dan periksa file local-status.json sebelum mengubah status.");

        var current = Get(employee.Code);
        if (current == status) return; // Repeated SLEEP must not reset the clock.
        var timestamp = now ?? DateTimeOffset.UtcNow;
        var sleepStarted = GetSleep(employee.Code)?.StartedAt;
        _data.Status[employee.Code] = status;
        if (status == "SLEEP")
        {
            _data.Sleep[employee.Code] = new SleepSchedule
            {
                StartedAt = timestamp,
            };
        }
        else _data.Sleep.Remove(employee.Code);

        _data.Events.Add(new StatusEvent
        {
            ChangedAt = timestamp, EmployeeCode = employee.Code, EmployeeName = employee.Name,
            From = current, To = status,
            Note = note ?? (status == "SLEEP" ? "Mulai tidur (lokal PC)"
                : current == "SLEEP" ? "Selesai tidur • " + SleepElapsed(sleepStarted, timestamp) + " (lokal PC)"
                : "Diubah operator (lokal PC)"),
        });
        Save();
    }

    private void Save()
    {
        if (_data.Events.Count > 3000)
            _data.Events.RemoveRange(0, _data.Events.Count - 3000);
        Directory.CreateDirectory(Path.GetDirectoryName(_file)!);
        var tmp = _file + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(_data, new JsonSerializerOptions
        {
            WriteIndented = true,
        }));
        File.Move(tmp, _file, true);
    }
}
