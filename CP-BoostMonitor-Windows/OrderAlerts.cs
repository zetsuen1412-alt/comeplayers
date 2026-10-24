using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CPBoostMonitor;

internal sealed class OrderAlerts : IDisposable
{
    private string _file="";
    private string _account="";
    private NewOrderTracker _tracker=new();
    private object? _speech;
    public bool SoundEnabled { get; set; } = true;
    public List<string> Observe(string account,IEnumerable<string> refs)
    {
        if(_account!=account) {
            _account=account;
            var key=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(account)))[..24];
            _file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ComePlayers","CPBoostMonitor","alerts-"+key+".json");
            try { _tracker=File.Exists(_file)?new NewOrderTracker(JsonSerializer.Deserialize<string[]>(File.ReadAllText(_file))):new(); }
            catch { _tracker=new(); }
        }
        var added=_tracker.Observe(refs);
        try { Directory.CreateDirectory(Path.GetDirectoryName(_file)!);File.WriteAllText(_file+".tmp",JsonSerializer.Serialize(_tracker.Snapshot()));File.Move(_file+".tmp",_file,true); }
        catch(IOException) { } catch(UnauthorizedAccessException) { }
        return added;
    }
    public void Speak()
    {
        if(!SoundEnabled)return;
        try {
            var type=Type.GetTypeFromProgID("SAPI.SpVoice"); if(type is null)throw new InvalidOperationException();
            _speech ??= Activator.CreateInstance(type); dynamic voice=_speech!;
            dynamic voices=voice.GetVoices("Language=421");if(voices.Count>0)voice.Voice=voices.Item(0);
            voice.Rate=1; voice.Volume=100; voice.Speak("SAYA AKAN LAWAN!!",3);
        } catch { System.Media.SystemSounds.Exclamation.Play(); }
    }
    public void Dispose() { if(_speech is not null && System.Runtime.InteropServices.Marshal.IsComObject(_speech)) System.Runtime.InteropServices.Marshal.FinalReleaseComObject(_speech);_speech=null; }
}
