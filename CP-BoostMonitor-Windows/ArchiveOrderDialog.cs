namespace CPBoostMonitor;

internal sealed class ArchiveOrderDialog : Form
{
    private readonly TextBox _reason = new() { Name = "ArchiveReason", Dock = DockStyle.Fill, Multiline = true, MaxLength = 500,
        PlaceholderText = "Alasan menghapus order (minimal 3 karakter)", BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text };
    public string Reason => _reason.Text.Trim();

    public ArchiveOrderDialog(ManagedOrder order)
    {
        Text = $"Hapus Order {order.OrderRef}";
        ClientSize = new Size(520, 415); MinimumSize = new Size(440, 450);
        StartPosition = FormStartPosition.CenterParent; MinimizeBox = MaximizeBox = false;
        BackColor = LuxuryPalette.Background; ForeColor = LuxuryPalette.Text; Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 6 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 48, 60, 80, 26 }) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        layout.Controls.Add(new Label { Text = $"Hapus {order.OrderRef}?", Dock = DockStyle.Fill,
            Font = new Font(Font, FontStyle.Bold), AutoEllipsis = true }, 0, 0);
        layout.Controls.Add(new Label { Text = $"Game: {order.Game} • Discord: {order.Discord}\nStatus: {order.StateDisplay} • Karyawan: {order.EmployeeName}",
            Dock = DockStyle.Fill, AutoEllipsis = true }, 0, 1);
        layout.Controls.Add(new Label { Text = "Order disembunyikan dari daftar. Riwayat dan Data Tutup Buku tetap disimpan. Arsip dapat dipulihkan dari Kelola Order.", Dock = DockStyle.Fill }, 0, 2);
        layout.Controls.Add(new Label { Text = "Alasan penghapusan (3–500 karakter)", Dock = DockStyle.Fill }, 0, 3);
        layout.Controls.Add(_reason, 0, 4);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0) };
        var delete = new LuxuryButton { Name = "ConfirmArchive", Text = "Hapus Order", Width = 145, Height = 36, Primary = true, Enabled = false };
        var cancel = new LuxuryButton { Text = "Batal", Width = 100, Height = 36, DialogResult = DialogResult.Cancel };
        _reason.TextChanged += (_, _) => delete.Enabled = Reason.Length >= 3;
        delete.Click += (_, _) => { if (Reason.Length >= 3) { DialogResult = DialogResult.OK; Close(); } };
        actions.Controls.Add(delete); actions.Controls.Add(cancel); layout.Controls.Add(actions, 0, 5);
        Controls.Add(layout); CancelButton = cancel;
        Shown += (_, _) => _reason.Focus();
    }
}

