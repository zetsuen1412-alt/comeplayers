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
            Text = "Konfirmasi Bukti " + action.ToUpperInvariant() + " — CP Boost Monitor",
            Size = new Size(810, 660),
            MinimumSize = new Size(650, 520),
            StartPosition = FormStartPosition.CenterParent,
            BackColor = Color.FromArgb(15, 23, 42),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10),
            MaximizeBox = false, MinimizeBox = false,
            ShowInTaskbar = false,
        };
        var toolbar = new Panel { Dock = DockStyle.Bottom, Height = 82, BackColor = Color.FromArgb(22, 34, 55) };
        var warning = new Label
        {
            Dock = DockStyle.Top, Height = 56, TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 0, 10, 0),
            ForeColor = Color.FromArgb(255, 202, 108),
            Text = "Foto akan dikirim ke 🔥 EVO🔥 Ilham FH3. Setelah dikirim, pesan Telegram tidak bisa dibatalkan dari aplikasi.",
        };
        var cancel = new Button
        {
            Text = "Batal", Width = 125, Height = 40,
            Location = new Point(14, 21), DialogResult = DialogResult.Cancel,
            BackColor = Color.FromArgb(45, 60, 82), ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat, Anchor = AnchorStyles.Left | AnchorStyles.Bottom,
        };
        var send = new Button
        {
            Text = "Kirim Foto " + action.ToUpperInvariant(), Width = 190, Height = 40,
            Location = new Point(585, 21), DialogResult = DialogResult.OK,
            BackColor = Color.FromArgb(249, 184, 61), ForeColor = Color.FromArgb(15, 23, 42),
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
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            Text = $"{order.OrderRef} / {order.EmployeeName} / {action.ToUpperInvariant()}\n" +
                   $"{order.OrderName} • {(bytes.Length / 1024d):F0} KB",
        };
        var picture = new PictureBox
        {
            Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.FromArgb(30, 43, 65),
            Image = previewImage,
        };
        dialog.Controls.Add(picture);
        dialog.Controls.Add(warning);
        dialog.Controls.Add(title);
        dialog.Controls.Add(toolbar);
        return dialog.ShowDialog(owner) == DialogResult.OK;
    }
}
