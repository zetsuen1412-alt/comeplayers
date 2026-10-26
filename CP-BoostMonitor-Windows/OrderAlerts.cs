using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Media;

namespace CPBoostMonitor;

internal sealed class OrderAlerts : IDisposable
{
    private string _file="";
    private string _account="";
    private NewOrderTracker _tracker=new();
    private readonly string _root;
    private SoundPlayer? _player;
    private Stream? _audio;
    private bool _soundEnabled = true;
    internal const string AudioResource = "CPBoostMonitor.Assets.NewOrder.wav";
    public OrderAlerts(string? root = null)
    {
        _root = root ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ComePlayers", "CPBoostMonitor");
        try {
            var settings = Path.Combine(_root, "notification-settings.json");
            if (File.Exists(settings)) _soundEnabled = JsonSerializer.Deserialize<bool>(File.ReadAllText(settings));
        } catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { }
    }
    public bool SoundEnabled {
        get => _soundEnabled;
        set {
            _soundEnabled = value;
            if (!value) StopSound();
            try {
                Directory.CreateDirectory(_root);
                var path = Path.Combine(_root, "notification-settings.json");
                File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(value)); File.Move(path + ".tmp", path, true);
            } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
    }
    public List<string> Observe(string account,IEnumerable<string> refs)
    {
        if (string.IsNullOrWhiteSpace(account)) return new();
        if(_account!=account) {
            StopSound();
            _account=account;
            var key=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(account)))[..24];
            _file=Path.Combine(_root,"alerts-"+key+".json");
            try { _tracker=File.Exists(_file)?new NewOrderTracker(JsonSerializer.Deserialize<string[]>(File.ReadAllText(_file))):new(); }
            catch { _tracker=new(); }
        }
        var added=_tracker.Observe(refs);
        try { Directory.CreateDirectory(Path.GetDirectoryName(_file)!);File.WriteAllText(_file+".tmp",JsonSerializer.Serialize(_tracker.Snapshot()));File.Move(_file+".tmp",_file,true); }
        catch(IOException) { } catch(UnauthorizedAccessException) { }
        return added;
    }
    public void PlaySound()
    {
        if(!SoundEnabled)return;
        try {
            if (_player is null) {
                _audio = typeof(OrderAlerts).Assembly.GetManifestResourceStream(AudioResource)
                    ?? throw new InvalidOperationException("Suara notifikasi belum tersedia.");
                _player = new SoundPlayer(_audio); _player.Load();
            }
            _player.Stop(); _player.Play();
        } catch { try { SystemSounds.Exclamation.Play(); } catch { /* A missing audio device must not block orders. */ } }
    }
    public void StopSound() { _player?.Stop(); }
    public void Dispose() { StopSound(); _player?.Dispose(); _audio?.Dispose(); _player=null; _audio=null; }
}
