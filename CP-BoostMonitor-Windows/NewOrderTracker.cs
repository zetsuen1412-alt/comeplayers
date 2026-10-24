namespace CPBoostMonitor;

/// <summary>Per-account, persistent deduplication. First use silently establishes a baseline.</summary>
public sealed class NewOrderTracker
{
    private readonly HashSet<string> _seen = new(StringComparer.OrdinalIgnoreCase);
    private bool _initialized;
    public NewOrderTracker(IEnumerable<string>? saved = null) { if(saved is not null) { _seen.UnionWith(saved); _initialized=true; } }
    public List<string> Observe(IEnumerable<string> refs)
    {
        var current=refs.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var added=current.Where(r=>!_seen.Contains(r)).ToList(); _seen.UnionWith(current);
        if(!_initialized) { _initialized=true;return new(); }
        return added;
    }
    public string[] Snapshot()=>_seen.ToArray();
}
