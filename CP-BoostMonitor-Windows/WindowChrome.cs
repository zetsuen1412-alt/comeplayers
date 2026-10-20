using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>Use a soft dark navy Windows 11 caption instead of the user's system accent when supported.
/// Older Windows versions silently keep their system-managed title bar.</summary>
internal static class WindowChrome
{
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);

    public static void ApplyDarkCaption(Form form)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) return;
        try
        {
            const int CaptionColor = 35, TextColor = 36, UseDarkMode = 20;
            int darkMode = 1;
            _ = DwmSetWindowAttribute(form.Handle, UseDarkMode, ref darkMode, sizeof(int));
            int navy = ColorTranslator.ToWin32(Color.FromArgb(15, 23, 42));
            int white = ColorTranslator.ToWin32(Color.FromArgb(229, 238, 248));
            _ = DwmSetWindowAttribute(form.Handle, CaptionColor, ref navy, sizeof(int));
            _ = DwmSetWindowAttribute(form.Handle, TextColor, ref white, sizeof(int));
        }
        catch (Exception exception) when (
            exception is DllNotFoundException or EntryPointNotFoundException)
        {
            // Not supported on this Windows build; keep normal native title bar.
        }
    }
}
