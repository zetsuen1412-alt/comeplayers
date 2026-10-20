using System.Text.Json;

namespace CPBoostMonitor;

/// <summary>
/// PC-only employee status and optional sleep timer. Does not modify Payroll/Android.
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
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Keep original file on disk if corrupted: never destroy employee history.
            _data = new();
        }
        // Restore expired auto-return schedules after restarting the app.
        ApplyExpired(DateTimeOffset.UtcNow);
    }

    public string Get(string code)
    {
        if (!_data.Status.TryGetValue(code, out var value)) return "READY";
        return value is "READY" or "IDLE" or "SLEEP" or "WORK" or "BREAK" or "OFFLINE"
            ? value : "READY";
    }

    public SleepSchedule? GetSleep(string code) =>
        Get(code) == "SLEEP" && _data.Sleep.TryGetValue(code, out var value) ? value : null;

    public string Display(string code, DateTimeOffset now)
    {
        var value = Get(code);
        if (value != "SLEEP") return value switch
        {
            "IDLE" => "Farming", "WORK" => "Sedang Bekerja",
            "BREAK" => "Istirahat", "OFFLINE" => "Offline",
            _ => "Ready Boosting",
        };
        var sleep = GetSleep(code);
        if (sleep == null) return "Tidur • manual";
        var remaining = sleep.Until - now;
        if (remaining <= TimeSpan.Zero)
            return sleep.AutoReady ? "Tidur • auto Ready tertunda" : "Tidur • durasi habis";
        int mins = (int)Math.Ceiling(remaining.TotalMinutes);
        return "Tidur • " + (mins >= 60 ? $"{mins / 60}j {mins % 60}m" : $"{mins}m") + " lagi";
    }

    public IReadOnlyList<StatusEvent> History =>
        _data.Events.AsEnumerable().Reverse().Take(400).ToList();

    /// <summary>For wake-up countdown. Returns true if persisted status changed.</summary>
    public bool ApplyExpired(DateTimeOffset now)
    {
        var due = _data.Sleep
            .Where(kv => kv.Value.AutoReady && kv.Value.Until <= now &&
                         Get(kv.Key) == "SLEEP")
            .Select(kv => kv.Key).ToList();
        if (due.Count == 0) return false;
        foreach (var code in due)
        {
            _data.Status[code] = "READY";
            _data.Sleep.Remove(code);
            _data.Events.Add(new StatusEvent
            {
                ChangedAt = now, EmployeeCode = code, EmployeeName = code,
                From = "SLEEP", To = "READY",
                Note = "Otomatis setelah waktu tidur habis (lokal PC)",
            });
        }
        Save();
        return true;
    }

    /// <param name="minutes">Required for SLEEP, 1 to 1440.</param>
    public void Set(Employee employee, string status, int? minutes = null, bool autoReady = true,
        DateTimeOffset? now = null)
    {
        if (status is not ("READY" or "IDLE" or "SLEEP" or "WORK" or "BREAK" or "OFFLINE"))
            throw new InvalidOperationException("Status karyawan tidak valid.");
        if (status == "SLEEP" && (minutes is null or < 1 or > 1440))
            throw new InvalidOperationException("Masukkan durasi tidur antara 1 dan 1440 menit.");

        var current = Get(employee.Code);
        var hasNewSleep = status == "SLEEP" && (current != "SLEEP"
            || GetSleep(employee.Code)?.DurationMinutes != minutes
            || GetSleep(employee.Code)?.AutoReady != autoReady);
        if (current == status && !hasNewSleep) return;
        var timestamp = now ?? DateTimeOffset.UtcNow;
        _data.Status[employee.Code] = status;
        if (status == "SLEEP")
        {
            _data.Sleep[employee.Code] = new SleepSchedule
            {
                StartedAt = timestamp, Until = timestamp.AddMinutes(minutes!.Value),
                DurationMinutes = minutes.Value, AutoReady = autoReady,
            };
        }
        else _data.Sleep.Remove(employee.Code);

        _data.Events.Add(new StatusEvent
        {
            ChangedAt = timestamp, EmployeeCode = employee.Code, EmployeeName = employee.Name,
            From = current, To = status,
            Note = status == "SLEEP" ?
                $"Tidur {minutes} menit sampai {timestamp.AddMinutes(minutes!.Value).ToLocalTime():HH:mm}; " +
                (autoReady ? "auto Ready" : "kembali manual") : "Diubah operator (lokal PC)",
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
