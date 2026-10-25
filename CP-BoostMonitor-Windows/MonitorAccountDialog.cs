namespace CPBoostMonitor;

internal sealed record MonitorAccountSettings(string Username, string AccessScope, string? EmployeeCode,
    bool Active, bool Create, string Email, string Password);

internal sealed class MonitorAccountDialog : Form
{
    private readonly TextBox _username = new() { Width = 500, PlaceholderText = "Username" };
    private readonly CheckBox _shared = new() { Width = 500, Height = 40, Text = "Akun bersama — semua karyawan FH3 / beberapa komputer" };
    private readonly ComboBox _employee = new() { Width = 500, DropDownStyle = ComboBoxStyle.DropDownList, DisplayMember = "Name" };
    private readonly CheckBox _create = new() { Text = "Buat akun baru (email + password)", AutoSize = true };
    private readonly TextBox _email = new() { Width = 500, PlaceholderText = "Email pemilik akun baru", Enabled = false };
    private readonly TextBox _password = new() { Width = 500, PlaceholderText = "Password minimal 12 karakter", UseSystemPasswordChar = true, Enabled = false };
    private readonly CheckBox _active = new() { Text = "Akun aktif", Checked = true, AutoSize = true };
    private readonly Label _note = new() { Width = 500, Height = 90 };
    internal bool Shared { get => _shared.Checked; set => _shared.Checked = value; }
    internal bool EmployeePickerEnabled => _employee.Enabled;
    internal MonitorAccountSettings Settings => new(_username.Text.Trim(), Shared ? "shared" : "employee",
        Shared ? null : (_employee.SelectedItem as Employee)?.Code, _active.Checked, _create.Checked, _email.Text.Trim(), _password.Text);

    internal MonitorAccountDialog(List<Employee> workers, Func<MonitorAccountSettings, Task> saveAccount)
    {
        Text = "Akun Karyawan"; ClientSize = new Size(550, 600); StartPosition = FormStartPosition.CenterParent;
        BackColor = LuxuryPalette.Background; AutoScaleMode = AutoScaleMode.Dpi;
        var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
            Padding = new Padding(20), WrapContents = false, AutoScroll = true };
        Controls.Add(panel);
        panel.Controls.Add(new Label { Text = "Pilih akun pribadi untuk satu karyawan atau akun bersama untuk seluruh komputer FH3.", Width = 500, Height = 44 });
        _employee.DataSource = workers;
        panel.Controls.Add(new Label { Text = "Username", AutoSize = true });
        panel.Controls.AddRange(new Control[] { _username, _shared, _employee, _create });
        panel.Controls.Add(new Label { Text = "Email akun baru", AutoSize = true }); panel.Controls.Add(_email);
        panel.Controls.Add(new Label { Text = "Password akun baru", AutoSize = true }); panel.Controls.Add(_password); panel.Controls.Add(_active);
        _shared.CheckedChanged += (_, _) => { _employee.Enabled = _employee.Visible = !Shared; ShowScopeNote(); };
        _create.CheckedChanged += (_, _) => { _email.Enabled = _password.Enabled = _create.Checked; };
        var save = new LuxuryButton { Text = "Simpan akun", Width = 500, Height = 42 };
        panel.Controls.Add(save); panel.Controls.Add(_note); ShowScopeNote();
        save.Click += async (_, _) => {
            save.Enabled = false;
            try {
                var settings = Settings;
                await saveAccount(settings);
                _note.Text = settings.AccessScope == "shared"
                    ? "Akun bersama tersimpan. Login di komputer karyawan, lalu pilih nama pekerja sebelum TAKE."
                    : "Akun pribadi tersimpan. Karyawan dapat login dengan username.";
            } catch (Exception e) { _note.Text = e.Message; }
            finally { _password.Clear(); save.Enabled = true; }
        };
        FormClosed += (_, _) => _password.Clear();
    }
    private void ShowScopeNote() => _note.Text = Shared
        ? "Akun bersama dapat memilih semua karyawan FH3 untuk TAKE/START/DONE dan login di beberapa komputer sekaligus. Hak admin tetap terpisah. Untuk mencabut akses, pilih jenis akun yang sama dan hilangkan Akun aktif."
        : "Akun pribadi hanya mengerjakan order satu karyawan. Untuk mencabut akses, isi username dan karyawan yang sama, lalu hilangkan Akun aktif.";
}
