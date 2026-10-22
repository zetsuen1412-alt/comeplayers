using System.Drawing;
using System.Windows.Forms;

namespace CPBoostMonitor;

internal sealed record SleepChoice(int Minutes, bool AutoReady);

internal static class SleepSettingsDialog
{
    /// <summary>Sleep is a local-PC status. We always require a bounded duration.</summary>
    public static SleepChoice? Show(IWin32Window owner, Employee worker)
    {
        using var dialog = new Form
        {
            Text = "Durasi Tidur • " + worker.Name,
            Width = 480, Height = 346,
            MinimumSize = new Size(440, 325),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false,
            ShowInTaskbar = false,
            BackColor = LuxuryPalette.Background,
            ForeColor = LuxuryPalette.Text,
            Font = new Font("Segoe UI", 10),
        };
        var content = new Panel
        {
            Dock = DockStyle.Fill, Padding = new Padding(22),
            BackColor = LuxuryPalette.Background,
        };
        dialog.Controls.Add(content);

        var title = new Label
        {
            Text = "Atur durasi tidur", Font = new Font("Segoe UI", 17, FontStyle.Bold),
            AutoSize = true, ForeColor = LuxuryPalette.Text,
            Location = new Point(22, 14),
        };
        var detail = new Label
        {
            Text = worker.Name + "  •  " + worker.Code + "\nStatus ini hanya berlaku pada PC ini.",
            AutoSize = false, Width = 404, Height = 48,
            Location = new Point(23, 52), ForeColor = LuxuryPalette.Muted,
        };
        var selectLabel = new Label
        {
            Text = "PILIH DURASI", Location = new Point(23, 103), Width = 170,
            ForeColor = LuxuryPalette.Accent, Font = new Font("Segoe UI", 9, FontStyle.Bold),
        };
        var durations = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            BackColor = LuxuryPalette.SurfaceRaised,
            ForeColor = LuxuryPalette.Text,
            FlatStyle = FlatStyle.Flat,
            Location = new Point(23, 126), Width = 248,
        };
        durations.Items.AddRange(new object[]
        {
            "30 menit", "1 jam", "2 jam", "4 jam", "Custom",
        });
        durations.SelectedIndex = 1;
        var custom = new NumericUpDown
        {
            Minimum = 1, Maximum = 1440, Value = 90,
            Location = new Point(280, 126), Width = 135,
            BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
            Visible = false,
        };
        var auto = new CheckBox
        {
            Text = "Otomatis kembali ke Ready Boosting",
            Location = new Point(23, 170), Size = new Size(390, 27),
            Checked = true, ForeColor = LuxuryPalette.Text,
        };
        var until = new Label
        {
            Location = new Point(23, 206), Width = 405, Height = 31,
            ForeColor = LuxuryPalette.Muted,
        };
        int minutes()
        {
            return durations.SelectedIndex switch
            {
                0 => 30, 1 => 60, 2 => 120, 3 => 240,
                4 => (int)custom.Value, _ => 60,
            };
        }
        void update()
        {
            custom.Visible = durations.SelectedIndex == 4;
            until.Text = "Sampai " +
                DateTimeOffset.Now.AddMinutes(minutes()).ToString("dd/MM/yyyy HH:mm") +
                (auto.Checked ? "  •  auto Ready" : "  •  tetap Tidur");
        }
        durations.SelectedIndexChanged += (_, _) => update();
        custom.ValueChanged += (_, _) => update();
        auto.CheckedChanged += (_, _) => update();
        update();

        var save = new LuxuryButton
        {
            Text = "Simpan Status Tidur", Primary = true,
            Location = new Point(214, 253), Size = new Size(205, 42),
        };
        var cancel = new LuxuryButton
        {
            Text = "Batal", BackColor = LuxuryPalette.SurfaceRaised,
            Location = new Point(23, 253), Size = new Size(120, 42),
            DialogResult = DialogResult.Cancel,
        };
        SleepChoice? selected = null;
        save.Click += (_, _) =>
        {
            selected = new SleepChoice(minutes(), auto.Checked);
            dialog.DialogResult = DialogResult.OK;
            dialog.Close();
        };
        content.Controls.Add(title);
        content.Controls.Add(detail);
        content.Controls.Add(selectLabel);
        content.Controls.Add(durations);
        content.Controls.Add(custom);
        content.Controls.Add(auto);
        content.Controls.Add(until);
        content.Controls.Add(save);
        content.Controls.Add(cancel);
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;
        return dialog.ShowDialog(owner) == DialogResult.OK ? selected : null;
    }
}
