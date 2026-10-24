using System.Windows.Forms;

namespace CPBoostMonitor;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        System.Globalization.CultureInfo.DefaultThreadCurrentCulture = System.Globalization.CultureInfo.GetCultureInfo("id-ID");
        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        if (args.SequenceEqual(new[] { "--verify-package" }))
        {
            // Smoke-test the published single-file runtime without user sessions,
            // storage writes, a visible window, timers or network requests.
            try { using var form = new MainForm(preview: true); form.CreateControl(); return 0; }
            catch { return 1; }
        }
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            MessageBox.Show("Terjadi kesalahan aplikasi: " + e.Exception.Message,
                "CP Boost Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Application.Run(new MainForm());
        return 0;
    }
}
