using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace CPBoostMonitor;

/// <summary>A corner notification independent of the minimized main window.
/// Opening it only navigates to Take Order; it never assigns or reports work.</summary>
internal sealed class OrderNotificationToast : Form
{
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr window, int index);
    private readonly System.Windows.Forms.Timer _dismiss = new() { Interval = 10_000 };
    private readonly Action _openOrders;
    private readonly bool _preview;
    private bool _opened;
    private readonly Button _close = new() { Name = "DismissOrderNotification", Text = "×", FlatStyle = FlatStyle.Flat,
        BackColor = Color.White, ForeColor = LuxuryPalette.Muted, Font = new Font("Segoe UI", 17), TabStop = false };
    private readonly Label _title = new() { Text = "EVOGAMING • FH3", ForeColor = LuxuryPalette.Text,
        Font = new Font("Segoe UI Semibold", 10), AutoEllipsis = true, BackColor = Color.White };
    private readonly Label _orders = new() { Name = "OrderNotificationRefs", ForeColor = LuxuryPalette.Accent,
        Font = new Font("Segoe UI Semibold", 11), AutoEllipsis = true, BackColor = Color.White };
    private readonly Label _hint = new() { Text = "Order baru masuk • Klik untuk membuka Take Order", ForeColor = LuxuryPalette.Muted,
        Font = new Font("Segoe UI", 9), AutoEllipsis = true, BackColor = Color.White };
    internal event EventHandler? Dismissed;
    internal bool DoesNotActivate => ShowWithoutActivation;
    internal bool IsAlwaysOnTop => IsHandleCreated && (GetWindowLong(Handle, -20) & 0x00000008) != 0;
    internal Rectangle NotificationBounds => Bounds;

    internal OrderNotificationToast(IReadOnlyList<string> orderRefs, Action openOrders, bool preview = false, bool demonstration = false)
    {
        _openOrders = openOrders; _preview = preview;
        SetStyle(ControlStyles.Selectable, false);
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual; BackColor = Color.White; DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.Dpi; ClientSize = new Size(430, 126);
        _orders.Text = string.Join(", ", orderRefs.Take(4)) + (orderRefs.Count > 4 ? $"  +{orderRefs.Count - 4}" : "");
        if (orderRefs.Count > 1) _title.Text += $"  •  {orderRefs.Count} order baru";
        if (demonstration) { _title.Text = "EVOGAMING • TES NOTIFIKASI"; _hint.Text = "Tes suara dan popup • Klik untuk membuka aplikasi"; }
        _close.FlatAppearance.BorderSize = 0; _close.AccessibleName = "Tutup notifikasi order";
        _close.Click += (_, _) => Close(); Controls.AddRange(new Control[] { _title, _orders, _hint, _close });
        foreach (var control in new Control[] { this, _title, _orders, _hint }) {
            control.Cursor = Cursors.Hand; control.Click += (_, _) => OpenOrders();
        }
        _dismiss.Tick += (_, _) => Close();
        Shown += (_, _) => {
            PlaceInWorkingArea(Screen.FromPoint(Cursor.Position).WorkingArea);
            if (!_preview) _dismiss.Start();
        };
        FormClosed += (_, _) => { _dismiss.Stop(); Dismissed?.Invoke(this, EventArgs.Empty); };
    }
    protected override bool ShowWithoutActivation => true;
    protected override void Select(bool directed, bool forward) { /* Notifications never request keyboard focus. */ }
    protected override CreateParams CreateParams {
        // Form.TopMost=true makes WinForms SetVisibleCore explicitly focus the
        // form even with ShowWithoutActivation. Set the native topmost style
        // instead, and retain SWP_NOACTIVATE during placement.
        get { var value = base.CreateParams; value.ExStyle |= 0x08000000 | 0x00000080 | 0x00000008; value.ClassStyle |= 0x00020000; return value; }
    }
    internal void OpenOrders() { if (_opened || IsDisposed) return; _opened = true; Close(); _openOrders(); }
    internal void DismissNotification() => _close.PerformClick();
    internal void PlaceInWorkingArea(Rectangle workArea)
    {
        int margin = Math.Max(8, 12 * DeviceDpi / 96);
        int width = Math.Min(430 * DeviceDpi / 96, Math.Max(1, workArea.Width - margin * 2));
        int height = Math.Min(126 * DeviceDpi / 96, Math.Max(1, workArea.Height - margin * 2));
        var bounds = new Rectangle(workArea.Right - width - margin, workArea.Bottom - height - margin, width, height);
        if (IsHandleCreated) {
            if (!SetWindowPos(Handle, new IntPtr(-1), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0010 | 0x0200))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        } else Bounds = bounds;
    }
    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0021) { message.Result = new IntPtr(3); return; } // WM_MOUSEACTIVATE / MA_NOACTIVATE
        base.WndProc(ref message);
    }
    protected override void OnLayout(LayoutEventArgs e)
    {
        base.OnLayout(e);
        if (_close is null) return;
        int scale(int value) => value * DeviceDpi / 96;
        int left = scale(80), right = scale(45);
        _close.SetBounds(Width - scale(38), scale(4), scale(32), scale(32));
        _title.SetBounds(left, scale(17), Math.Max(60, Width - left - right), scale(24));
        _orders.SetBounds(left, scale(45), Math.Max(60, Width - left - scale(18)), scale(26));
        _hint.SetBounds(left, scale(78), Math.Max(60, Width - left - scale(18)), scale(34));
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var border = new Pen(LuxuryPalette.Border); e.Graphics.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
        int scale(int value) => value * DeviceDpi / 96;
        var badge = new Rectangle(scale(17), scale(30), scale(48), scale(48));
        Fh3Branding.Draw(e.Graphics, badge);
    }
    protected override void Dispose(bool disposing) { if (disposing) _dismiss.Dispose(); base.Dispose(disposing); }
}
