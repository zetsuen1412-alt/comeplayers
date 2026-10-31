using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>Human verification before the irreversible Telegram photo transmission.</summary>
public static class ProofPreviewDialog
{
    public static bool Confirm(IWin32Window owner, byte[] bytes, string mime,
        PayrollOrder order, string action)
    {
        // Image content is user-supplied. Limit decoded size in addition to upload bytes.
        if (!PayrollApi.ValidImage(bytes, mime))
            throw new InvalidOperationException("Gambar bukan PNG/JPEG valid atau lebih dari 7 MB.");
        using var stream = new MemoryStream(bytes, false);
        using var loaded = Image.FromStream(stream, false, true);
        if (loaded.Width <= 0 || loaded.Height <= 0 ||
            (long)loaded.Width * loaded.Height > 48_000_000L)
            throw new InvalidOperationException("Resolusi screenshot terlalu besar (maksimal 48 megapiksel).");
        using var previewImage = new Bitmap(loaded);

        using var dialog = new Form
        {
            Text = "Review Bukti " + action.ToUpperInvariant() + "  |  EVOGAMING Monitor",
            Size = new Size(810, 660),
            MinimumSize = new Size(650, 520),
            StartPosition = FormStartPosition.CenterParent,
            BackColor = LuxuryPalette.Background,
            ForeColor = LuxuryPalette.Text,
            Font = new Font("Segoe UI", 10),
            MaximizeBox = false, MinimizeBox = false,
            ShowInTaskbar = false,
        };
        var toolbar = new Panel { Dock = DockStyle.Bottom, Height = 82, BackColor = LuxuryPalette.Sidebar };
        var warning = new Label
        {
            Dock = DockStyle.Top, Height = 56, TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 0, 10, 0),
            ForeColor = LuxuryPalette.GoldBright,
            Text = "●  TARGET TELEGRAM: 🔥 EVO🔥 Ilham FH3  •  Pastikan screenshot benar sebelum dikirim.",
        };
        var cancel = new LuxuryButton
        {
            Text = "Batal", Width = 125, Height = 44,
            Location = new Point(14, 21), DialogResult = DialogResult.Cancel,
            BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
            FlatStyle = FlatStyle.Flat, Anchor = AnchorStyles.Left | AnchorStyles.Bottom,
        };
        var send = new LuxuryButton
        {
            Primary = true,
            Text = "Kirim Bukti " + action.ToUpperInvariant(), Width = 190, Height = 44,
            Location = new Point(585, 21), DialogResult = DialogResult.OK,
            BackColor = LuxuryPalette.Accent, ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat, Anchor = AnchorStyles.Right | AnchorStyles.Bottom,
        };
        toolbar.Controls.Add(cancel);
        toolbar.Controls.Add(send);
        toolbar.Resize += (_, _) => send.Left = toolbar.ClientSize.Width - send.Width - 16;
        dialog.AcceptButton = send;
        dialog.CancelButton = cancel;

        var title = new Label
        {
            Dock = DockStyle.Top, Height = 82, Padding = new Padding(16, 12, 8, 0),
            Font = new Font("Segoe UI", 12, FontStyle.Bold),
            Text = $"{order.OrderRef} / {order.EmployeeName} / {(order.Daily ? $"day{order.DayNumber}/" : "")}{action.ToUpperInvariant()}\n" +
                   $"Duration: {order.DisplayDuration} • {(bytes.Length / 1024d):F0} KB",
        };
        var picture = new PictureBox
        {
            Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = LuxuryPalette.Surface,
            Image = previewImage,
        };
        dialog.Controls.Add(picture);
        dialog.Controls.Add(warning);
        dialog.Controls.Add(title);
        dialog.Controls.Add(toolbar);
        return dialog.ShowDialog(owner) == DialogResult.OK;
    }
}

