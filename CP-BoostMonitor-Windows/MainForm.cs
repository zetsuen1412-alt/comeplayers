using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Windows.Forms;

namespace CPBoostMonitor;

public sealed class MainForm : Form
{
    private readonly PayrollApi _api = new();
    private readonly LocalStatusStore _statusStore = new();
    private readonly System.Windows.Forms.Timer _poll = new() { Interval = 30_000 };
    private readonly NotifyIcon _tray = new();
    private readonly Dictionary<string, Control> _pages = new();
    private readonly Dictionary<string, Button> _navigation = new();
    private List<Employee> _employees = new();
    private List<PayrollOrder> _pending = new();
    private List<PayrollOrder> _tasks = new();
    private bool _busy;
    private bool _seenInitialQueue;
    private HashSet<string> _lastRefs = new(StringComparer.OrdinalIgnoreCase);

    private static readonly Color Background = LuxuryPalette.Background;
    private static readonly Color Sidebar = LuxuryPalette.Sidebar;
    private static readonly Color PanelColor = LuxuryPalette.Surface;
    private static readonly Color PanelLine = LuxuryPalette.Border;
    private static readonly Color Fore = LuxuryPalette.Text;
    private static readonly Color Muted = LuxuryPalette.Muted;
    private static readonly Color Accent = LuxuryPalette.Gold;
    private static readonly Color Success = LuxuryPalette.Success;

    private readonly Panel _content = new() { Dock = DockStyle.Fill, BackColor = Background };
    private readonly FlowLayoutPanel _nav = new()
    {
        Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false,
        Padding = new Padding(12, 20, 12, 0), AutoScroll = true, BackColor = Sidebar,
    };
    private readonly Label _connection = new() { AutoSize = true, ForeColor = Muted };
    private readonly Label _headline = new() { AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold), ForeColor = Fore };
    private readonly Label _metrics = new() { AutoSize = true, ForeColor = Muted };
    private readonly Label _appStatus = new() { AutoSize = false, Dock = DockStyle.Fill, ForeColor = Muted, TextAlign = ContentAlignment.MiddleLeft };
    private readonly DataGridView _tasksGrid = Grid();
    private readonly DataGridView _rosterGrid = Grid();
    private readonly ComboBox _statusPicker = new();
    private readonly TextBox _taskSearch = new();
    private readonly TextBox _rosterSearch = new();
    private readonly ComboBox _taskStatusFilter = new();
    private readonly TextBox _email = new();
    private readonly TextBox _password = new();
    private readonly Button _loginButton = ActionButton("LOGIN PAYROLL", true);
    private readonly Label _loginFeedback = StyledText("Gunakan akun admin Payroll ComePlayers.", 10);
    private readonly RichTextBox _history = new() { ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = PanelColor, ForeColor = Fore, Font = new Font("Consolas", 10.5f) };
    private readonly TakeOrderPanel _takePanel = new();
    private string _activePage = "Take Order";

    public MainForm()
    {
        Text = "EVOGAMING Monitor — FH3 | Windows";
        MinimumSize = new Size(1030, 660);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1240, 800);
        BackColor = Background;
        ForeColor = Fore;
        Font = new Font("Segoe UI", 10);
        Icon = SystemIcons.Application;

        BuildLayout();
        Shown += (_, _) => WindowChrome.ApplyDarkCaption(this);
        _takePanel.TakeRequested += async (_, choice) => await RunBusyAsync(() => TakeOrderAsync(choice));
        _poll.Tick += async (_, _) => await RunBusyAsync(RefreshDataAsync, quiet: true);
        _tray.Icon = SystemIcons.Application;
        _tray.Text = "EVOGAMING Monitor FH3";
        _tray.Visible = true;
        _tray.ContextMenuStrip = new ContextMenuStrip();
        _tray.ContextMenuStrip.Items.Add("Buka EVOGAMING Monitor", null, (_, _) => RestoreWindow());
        _tray.ContextMenuStrip.Items.Add("Keluar", null, (_, _) => Close());
        _tray.DoubleClick += (_, _) => RestoreWindow();
        FormClosed += (_, _) => { _poll.Stop(); _tray.Visible = false; _tray.Dispose(); _api.Dispose(); };
        Shown += async (_, _) =>
        {
            if (_api.LoggedIn)
            {
                ShowPage("Take Order");
                await RunBusyAsync(RefreshDataAsync);
            }
            else ShowPage("Login");
        };
    }

    private void RestoreWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void BuildLayout()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(layout);
        layout.Controls.Add(_nav, 0, 0);
        layout.Controls.Add(_content, 1, 0);

        var logo = StyledText("◈  EVOGAMING", 16, true, Accent);
        logo.Margin = new Padding(12, 12, 0, 5);
        _nav.Controls.Add(logo);
        var division = StyledText("MONITOR   /   FH3", 9, true, Muted);
        division.Margin = new Padding(12, 0, 0, 28);
        _nav.Controls.Add(division);
        foreach (var name in new[] { "Take Order", "Tugas Aktif", "Karyawan", "Riwayat", "Pengaturan" })
        {
            var button = NavButton(name);
            _nav.Controls.Add(button);
            _navigation[name] = button;
            button.Click += (_, _) => ShowPage(name);
        }
        var account = StyledText("●  PAYROLL  /  FH3", 10, true, Success);
        account.Margin = new Padding(12, 32, 0, 4);
        _nav.Controls.Add(account);
        _connection.Text = "Login belum aktif";
        _connection.Margin = new Padding(12, 0, 0, 0);
        _nav.Controls.Add(_connection);

        var header = new Panel { Dock = DockStyle.Top, Height = 101,
            Padding = new Padding(20, 9, 20, 4), BackColor = Background };
        var breadcrumb = StyledText("EVOGAMING   /   FH3 OPERATIONS", 9, true, Accent);
        breadcrumb.Location = new Point(19, 9);
        header.Controls.Add(breadcrumb);
        _headline.Text = "Take Order";
        _headline.Font = new Font("Segoe UI", 20, FontStyle.Bold);
        _headline.Location = new Point(19, 29);
        header.Controls.Add(_headline);
        _metrics.Location = new Point(21, 73);
        _metrics.Text = "Pilih karyawan + pilih order  •  klik TAKE ORDER";
        header.Controls.Add(_metrics);
        header.Paint += (_, e) => {
            using var pen = new Pen(PanelLine, 1);
            e.Graphics.DrawLine(pen, 19, header.Height - 1, header.Width - 19, header.Height - 1);
        };
        var footer = new Panel { Dock = DockStyle.Bottom, Height = 36, Padding = new Padding(18, 0, 8, 0), BackColor = Sidebar };
        _appStatus.Text = "Siap. Screenshot dikirim hanya setelah tombol START/DONE dikonfirmasi.";
        footer.Controls.Add(_appStatus);
        var area = new Panel { Dock = DockStyle.Fill, BackColor = Background };
        _content.Controls.Add(area);
        _content.Controls.Add(footer);
        _content.Controls.Add(header);

        _pages["Login"] = BuildLogin();
        _pages["Take Order"] = _takePanel;
        _pages["Tugas Aktif"] = BuildTasks();
        _pages["Karyawan"] = BuildEmployees();
        _pages["Riwayat"] = BuildHistory();
        _pages["Pengaturan"] = BuildSettings();

        foreach (var page in _pages.Values)
        {
            page.Dock = DockStyle.Fill;
            page.Visible = false;
            area.Controls.Add(page);
        }
    }

    private Control BuildLogin()
    {
        var page = ScrollingPage();
        var form = Card();
        form.Width = 642; form.Height = 420;
        form.Controls.Add(MakeLabel("SECURE ACCESS  /  FH3", 10, 26, 18, true, Accent));
        form.Controls.Add(MakeLabel("Hubungkan akun Payroll", 22, 26, 49, true, Fore));
        form.Controls.Add(MakeLabel("Akses aman ke sistem operasional EVOGAMING", 11, 26, 97, false, Muted));
        _email.SetBounds(26, 149, 584, 42);
        FormatInput(_email, false);
        _email.PlaceholderText = "Email admin Payroll";
        form.Controls.Add(MakeLabel("EMAIL ADMIN PAYROLL", 9, 27, 126, true, Muted));
        form.Controls.Add(_email);
        _password.SetBounds(26, 216, 584, 42);
        FormatInput(_password, true);
        _password.PlaceholderText = "Password";
        form.Controls.Add(MakeLabel("PASSWORD", 9, 27, 193, true, Muted));
        form.Controls.Add(_password);
        _loginButton.SetBounds(26, 292, 584, 47);
        _loginButton.Click += async (_, _) => await RunBusyAsync(async () =>
        {
            var password = _password.Text;
            _loginFeedback.Text = "Menghubungkan ke Payroll Website...";
            try
            {
                await _api.LoginAsync(_email.Text, password);
                _password.Clear();
                ShowPage("Dashboard");
                await RefreshDataAsync();
            }
            finally { _password.Clear(); }
        });
        form.Controls.Add(_loginButton);
        _loginFeedback.Location = new Point(27, 358);
        _loginFeedback.Width = 574;
        form.Controls.Add(_loginFeedback);
        page.Controls.Add(form);
        return page;
    }

    private Control BuildTasks()
    {
        var panel = new Panel { Padding = new Padding(20, 8, 20, 12) };
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 124, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoScroll = true };
        var start = ActionButton("▶ START + Screenshot", true);
        var done = ActionButton("✓ DONE + Screenshot", true);
        var preflight = ActionButton("Periksa grup FH3", false);
        var refresh = ActionButton("↻ Refresh", false);
        start.Click += async (_, _) => await RunBusyAsync(() => SendProofAsync("start"));
        done.Click += async (_, _) => await RunBusyAsync(() => SendProofAsync("done"));
        preflight.Click += async (_, _) => await RunBusyAsync(async () =>
        {
            var name = await _api.VerifyGroupAsync();
            MessageBox.Show($"Grup Telegram terverifikasi: {name}\nTidak ada foto dikirim.",
                "Koneksi FH3", MessageBoxButtons.OK, MessageBoxIcon.Information);
        });
        refresh.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync);
        toolbar.Controls.Add(start); toolbar.Controls.Add(done); toolbar.Controls.Add(preflight); toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(MakeToolbarText("Cari:", 45));
        PrepareSearch(_taskSearch, "Kode, karyawan, game, TASK...", 255);
        _taskSearch.TextChanged += (_, _) => BindFilteredTables();
        toolbar.Controls.Add(_taskSearch);
        _taskStatusFilter.DropDownStyle = ComboBoxStyle.DropDownList;
        _taskStatusFilter.BackColor = PanelColor; _taskStatusFilter.ForeColor = Fore;
        _taskStatusFilter.Width = 180;
        _taskStatusFilter.Items.AddRange(new object[] { "Semua Status", "assigned", "in_progress", "on_hold" });
        _taskStatusFilter.SelectedIndex = 0;
        _taskStatusFilter.SelectedIndexChanged += (_, _) => BindFilteredTables();
        toolbar.Controls.Add(_taskStatusFilter);
        toolbar.Controls.Add(MakeToolbarText("Win+Shift+S → Clipboard; preview foto sebelum dikirim ke Telegram.", 620));
        panel.Controls.Add(_tasksGrid);
        panel.Controls.Add(toolbar);
        AddColumn(_tasksGrid, "Kode Order", "OrderRef", 125);
        AddColumn(_tasksGrid, "Karyawan", "EmployeeName", 145);
        AddColumn(_tasksGrid, "Status", "Status", 124);
        AddColumn(_tasksGrid, "Tindakan", "ActionLabel", 180);
        AddColumn(_tasksGrid, "Nama Order", "OrderName", 200);
        AddColumn(_tasksGrid, "Game", "Game", 125);
        AddColumn(_tasksGrid, "TASK", "Task", 225);
        return panel;
    }

    private Control BuildEmployees()
    {
        var panel = new Panel { Padding = new Padding(20, 8, 20, 12) };
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 123, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoScroll = true };
        _statusPicker.DropDownStyle = ComboBoxStyle.DropDownList;
        _statusPicker.Items.AddRange(new object[] { "Ready Boosting", "Farming", "Tidur", "Sedang Bekerja" });
        _statusPicker.SelectedIndex = 0;
        _statusPicker.Width = 180; _statusPicker.BackColor = PanelColor; _statusPicker.ForeColor = Fore;
        var save = ActionButton("Simpan status lokal", true);
        save.Click += async (_, _) => await RunBusyAsync(SaveLocalStatusAsync);
        var refresh = ActionButton("↻ Refresh roster", false);
        refresh.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync);
        toolbar.Controls.Add(MakeToolbarText("Status:", 66));
        toolbar.Controls.Add(_statusPicker); toolbar.Controls.Add(save); toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(MakeToolbarText("Cari:", 45));
        PrepareSearch(_rosterSearch, "Nama, kode atau status...", 255);
        _rosterSearch.TextChanged += (_, _) => BindFilteredTables();
        toolbar.Controls.Add(_rosterSearch);
        toolbar.Controls.Add(MakeToolbarText("Status boosting hanya tersimpan pada PC ini; tidak mengubah website dan Android.", 780));
        _rosterGrid.SelectionChanged += (_, _) =>
        {
            if (_rosterGrid.CurrentRow?.DataBoundItem is not Employee selected) return;
            _statusPicker.SelectedIndex = selected.LocalStatus switch
            {
                "IDLE" => 1, "SLEEP" => 2, "WORK" => 3, _ => 0,
            };
        };
        panel.Controls.Add(_rosterGrid);
        panel.Controls.Add(toolbar);
        AddColumn(_rosterGrid, "Kode", "Code", 128);
        AddColumn(_rosterGrid, "Nama Karyawan", "Name", 230);
        AddColumn(_rosterGrid, "Bagian", "Team", 90);
        AddColumn(_rosterGrid, "Status di PC", "DisplayLocalStatus", 240);
        AddColumn(_rosterGrid, "Status roster", "WorkforceStatus", 145);
        return panel;
    }

    private Control BuildHistory()
    {
        var panel = new Panel { Padding = new Padding(20) };
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 62 };
        var export = ActionButton("Ekspor riwayat status CSV", false);
        export.Click += (_, _) => ExportHistory();
        toolbar.Controls.Add(export);
        toolbar.Controls.Add(MakeToolbarText("Riwayat status lokal (bukan riwayat Payroll Website).", 480));
        panel.Controls.Add(_history);
        _history.Dock = DockStyle.Fill;
        panel.Controls.Add(toolbar);
        return panel;
    }

    private Control BuildSettings()
    {
        var page = ScrollingPage();
        var card = Card();
        card.Width = 860; card.Height = 310;
        card.Controls.Add(MakeLabel("Koneksi EVOGAMING Monitor", 18, 22, 15, true, Fore));
        card.Controls.Add(MakeLabel("Website: https://www.comeplayers.com", 12, 22, 63));
        card.Controls.Add(MakeLabel("Divisi: FH3  •  Bukti Telegram: 🔥 EVO🔥 Ilham FH3", 12, 22, 101));
        card.Controls.Add(MakeLabel("Sesi login dienkripsi menggunakan Windows DPAPI (CurrentUser).", 12, 22, 139));
        card.Controls.Add(MakeLabel("Token bot Telegram dan kunci Supabase TIDAK ada di aplikasi.", 12, 22, 176));
        var logout = ActionButton("Logout dari Payroll", false);
        logout.SetBounds(22, 222, 252, 42);
        logout.Click += (_, _) =>
        {
            if (MessageBox.Show("Keluar dari akun Payroll di PC ini?", "Logout",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            _api.Logout(); _poll.Stop();
            _employees.Clear(); _pending.Clear(); _tasks.Clear();
            _seenInitialQueue = false; _lastRefs.Clear();
            BindTables();
            ShowPage("Login");
        };
        card.Controls.Add(logout);
        page.Controls.Add(card);
        return page;
    }

    private async Task TakeOrderAsync(AssignmentRequest selection)
    {
        // Re-validate against the live client snapshot. Server RPC enforces atomic assignment.
        var employee = _employees.FirstOrDefault(e => e.Code == selection.Worker.Code && e.Active);
        var order = _pending.FirstOrDefault(o => o.OrderRef == selection.Order.OrderRef);
        if (employee is null || order is null)
            throw new InvalidOperationException("Karyawan atau order sudah berubah. Segarkan data dan pilih lagi.");
        var answer = MessageBox.Show(
            $"Karyawan: {employee.Name} ({employee.Code})\n" +
            $"Order: {order.OrderRef}\nGame: {order.Game}\nTASK: {order.Task}\n\n" +
            "Tetapkan order ini ke karyawan tersebut di Payroll Website?",
            "Konfirmasi TAKE ORDER", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (answer != DialogResult.Yes) return;
        _takePanel.SetWorking(true);
        try
        {
            var assignedName = await _api.AssignAsync(order.OrderRef, employee.Code);
            _takePanel.ClearChoices();
            await RefreshDataAsync();
            SetStatus($"TAKE ORDER berhasil: {order.OrderRef} → {assignedName}.");
            if (MessageBox.Show(
                $"Order {order.OrderRef} berhasil ditugaskan ke {assignedName}.\n\n" +
                "Buka Tugas Aktif untuk mengirim screenshot START?",
                "TAKE ORDER berhasil", MessageBoxButtons.YesNo, MessageBoxIcon.Information)
                == DialogResult.Yes)
                ShowPage("Tugas Aktif");
        }
        finally { _takePanel.SetWorking(false); }
    }

    private async Task SendProofAsync(string action)
    {
        if (_tasksGrid.CurrentRow?.DataBoundItem is not PayrollOrder order)
            throw new InvalidOperationException("Pilih tugas di tabel terlebih dahulu.");
        await SendProofForAsync(order, action);
    }

    private async Task SendProofForAsync(PayrollOrder order, string action)
    {
        var expected = action == "start" ? "assigned" : "in_progress";
        if (order.Status != expected)
            throw new InvalidOperationException($"Aksi {action.ToUpperInvariant()} tidak tersedia untuk status {order.Status}. Perbarui data dahulu.");
        var image = SelectScreenshot();
        if (image is null) return;
        var (bytes, mime) = image.Value;
        if (!PayrollApi.ValidImage(bytes, mime))
            throw new InvalidOperationException("Screenshot PNG/JPEG tidak valid atau lebih besar dari 7 MB.");
        // Show the exact selected screenshot at full preview before any network request.
        // Backend constructs the canonical caption from its FH3 roster.
        if (!ProofPreviewDialog.Confirm(this, bytes, mime, order, action)) return;
        // No retries. Any network timeout might mean Telegram has already accepted the photo.
        try
        {
            var result = await _api.ProgressAsync(order.OrderRef, order.EmployeeCode, action, bytes, mime);
            MessageBox.Show($"Bukti dikonfirmasi Telegram.\n{result.Caption}\nGrup: {result.ChatTitle}\nStatus website: {result.Status}",
                "Bukti berhasil", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await RefreshDataAsync();
        }
        catch
        {
            MessageBox.Show("Pengiriman belum terkonfirmasi. Periksa grup Telegram EVO Ilham FH3 dan status order di website sebelum mencoba lagi. Jangan kirim bukti berulang.",
                "Periksa grup sebelum mengulang", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            throw;
        }
    }

    private (byte[] bytes, string mime)? SelectScreenshot()
    {
        var choice = MessageBox.Show(
            "Ambil screenshot Windows dengan Win+Shift+S lalu pilih NO untuk menempel dari clipboard.\n\nYES: pilih file PNG/JPG\nNO: tempel screenshot dari clipboard\nCANCEL: batalkan",
            "Pilih bukti screenshot", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (choice == DialogResult.Cancel) return null;
        if (choice == DialogResult.No)
        {
            if (!Clipboard.ContainsImage())
                throw new InvalidOperationException("Clipboard tidak berisi gambar. Tekan Win+Shift+S lalu coba lagi.");
            using var bitmap = Clipboard.GetImage();
            if (bitmap == null) throw new InvalidOperationException("Gambar clipboard tidak dapat dibaca.");
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            return (stream.ToArray(), "image/png");
        }
        using var dialog = new OpenFileDialog
        {
            Title = "Pilih screenshot bukti order",
            Filter = "Gambar PNG/JPEG|*.png;*.jpg;*.jpeg",
            CheckFileExists = true, Multiselect = false,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return null;
        var info = new FileInfo(dialog.FileName);
        if (info.Length <= 0 || info.Length > 7 * 1024 * 1024)
            throw new InvalidOperationException("Ukuran gambar harus 1 byte sampai 7 MB.");
        var mime = info.Extension.Equals(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
        return (File.ReadAllBytes(info.FullName), mime);
    }

    private Task SaveLocalStatusAsync()
    {
        if (_rosterGrid.CurrentRow?.DataBoundItem is not Employee employee)
            throw new InvalidOperationException("Pilih karyawan yang ingin diperbarui.");
        var value = _statusPicker.SelectedIndex switch
        {
            1 => "IDLE", 2 => "SLEEP", 3 => "WORK", _ => "READY",
        };
        _statusStore.Set(employee, value);
        foreach (var item in _employees.Where(e => e.Code.Equals(employee.Code, StringComparison.OrdinalIgnoreCase)))
            item.LocalStatus = value;
        BindTables();
        SetStatus($"Status {employee.Name}: {employee.DisplayLocalStatus} (hanya PC ini).");
        return Task.CompletedTask;
    }

    private async Task RefreshDataAsync()
    {
        if (!_api.LoggedIn) return;
        var newRoster = await _api.RosterAsync();
        var freshPending = await _api.PendingAsync();
        var freshTasks = await _api.TasksAsync();
        foreach (var employee in newRoster) employee.LocalStatus = _statusStore.Get(employee.Code);
        _employees = newRoster;
        _tasks = freshTasks;
        var newRefs = freshPending.Select(order => order.OrderRef).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var additions = _seenInitialQueue
            ? newRefs.Except(_lastRefs, StringComparer.OrdinalIgnoreCase).ToList()
            : new List<string>();
        _lastRefs = newRefs;
        _seenInitialQueue = true;
        _pending = freshPending;
        BindTables();
        _connection.Text = "●  FH3 • Online";
        _connection.ForeColor = Success;
        _poll.Start();
        SetStatus($"Payroll tersinkron {DateTime.Now:HH:mm:ss} • {_pending.Count} order baru • {_tasks.Count} tugas aktif.");
        if (additions.Count > 0)
        {
            _tray.BalloonTipTitle = $"EVOGAMING Monitor — {additions.Count} order FH3 baru";
            _tray.BalloonTipText = string.Join(", ", additions.Take(4));
            _tray.ShowBalloonTip(7000);
        }
    }

    private void BindTables()
    {
        _takePanel.BindData(_employees, _pending);
        BindFilteredTables();
        var history = _statusStore.History;
        _history.Text = history.Count == 0 ? "Belum ada perubahan status karyawan pada PC ini."
            : string.Join(Environment.NewLine, history.Select(x =>
                $"{x.ChangedAt:dd/MM/yyyy HH:mm:ss}    {x.EmployeeName} ({x.EmployeeCode}): {x.From} → {x.To}"));
        _metrics.Text = $"{_pending.Count} order baru   •   {_tasks.Count} tugas aktif   •   {_employees.Count} karyawan FH3";
        if (_navigation.TryGetValue("Take Order", out var item))
            item.Text = $"    ▸  Take Order  ({_pending.Count})";
    }

    private void BindFilteredTables()
    {
        Rebind(_tasksGrid, OrderFilters.Active(_tasks, _taskSearch.Text,
            _taskStatusFilter.SelectedItem as string ?? "Semua Status").ToList());
        Rebind(_rosterGrid, OrderFilters.Employees(_employees, _rosterSearch.Text).ToList());
    }

    private static void PrepareSearch(TextBox control, string placeholder, int width)
    {
        control.Width = width;
        control.Height = 32;
        control.Font = new Font("Segoe UI", 10);
        control.BackColor = PanelColor;
        control.ForeColor = Fore;
        control.BorderStyle = BorderStyle.FixedSingle;
        control.PlaceholderText = placeholder;
    }

    private async Task RunBusyAsync(Func<Task> action, bool quiet = false)
    {
        if (_busy || IsDisposed) return;
        _busy = true;
        UseWaitCursor = !quiet;
        try { await action(); }
        catch (Exception error)
        {
            if (_activePage == "Login") _loginFeedback.Text = error.Message;
            SetStatus(error.Message);
            if (!quiet && !IsDisposed)
                MessageBox.Show(error.Message, "EVOGAMING Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { _busy = false; UseWaitCursor = false; }
    }

    private void SetStatus(string message) { _appStatus.Text = message; }

    private void ShowPage(string name)
    {
        if (name != "Login" && !_api.LoggedIn) name = "Login";
        _activePage = name;
        foreach (var entry in _pages)
            entry.Value.Visible = entry.Key == name;
        if (_pages.TryGetValue(name, out var active)) active.BringToFront();
        foreach (var entry in _navigation)
        {
            entry.Value.BackColor = entry.Key == name ? PanelColor : Sidebar;
            entry.Value.ForeColor = Fore;
        }
        _headline.Text = name == "Login" ? "Masuk ke EVOGAMING Monitor" : name;
        if (name == "Riwayat") BindTables();
    }

    private void ExportHistory()
    {
        using var dialog = new SaveFileDialog
        {
            FileName = "cp-boost-monitor-status-" + DateTime.Now.ToString("yyyyMMdd") + ".csv",
            Filter = "CSV (*.csv)|*.csv",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        static string Quote(string s) => "\"" + s.Replace("\"", "\"\"") + "\"";
        var records = _statusStore.History;
        var csv = new StringBuilder("Tanggal,Kode,Nama,Dari,Ke\r\n");
        foreach (var entry in records)
            csv.AppendLine(string.Join(",", new[]
            {
                Quote(entry.ChangedAt.ToString("yyyy-MM-dd HH:mm:ss")),
                Quote(entry.EmployeeCode), Quote(entry.EmployeeName),
                Quote(entry.From), Quote(entry.To),
            }));
        File.WriteAllText(dialog.FileName, csv.ToString(), new UTF8Encoding(true));
        MessageBox.Show("Riwayat lokal berhasil diekspor.", "EVOGAMING Monitor");
    }

    private static FlowLayoutPanel ScrollingPage() => new()
    {
        Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(22, 14, 22, 22),
        FlowDirection = FlowDirection.TopDown, WrapContents = false, BackColor = Background,
    };

    private static Panel Card() => new LuxuryCard
    {
        BackColor = PanelColor, Margin = new Padding(0, 0, 0, 22),
        Padding = new Padding(16),
    };

    private static Label StyledText(string content, float fontSize, bool bold = false, Color? color = null) => new()
    {
        Text = content, AutoSize = true, BackColor = Color.Transparent, ForeColor = color ?? Fore,
        Font = new Font("Segoe UI", fontSize, bold ? FontStyle.Bold : FontStyle.Regular),
        Padding = new Padding(0, 3, 0, 4),
    };

    private static Label MakeLabel(string content, float fontSize, int x, int y, bool bold = false, Color? color = null)
    {
        var label = StyledText(content, fontSize, bold, color);
        label.Location = new Point(x, y);
        return label;
    }

    private static Label MakeToolbarText(string content, int width)
    {
        var label = StyledText(content, 10, false, Muted);
        label.Width = width; label.AutoSize = false;
        label.Height = 40; label.TextAlign = ContentAlignment.MiddleLeft;
        return label;
    }

    private static Button NavButton(string title) => new LuxuryButton
    {
        Navigation = true, Text = "    ▸  " + title, Width = 158, Height = 49,
        Margin = new Padding(4, 2, 4, 5),
        BackColor = Sidebar, ForeColor = Fore,
        TextAlign = ContentAlignment.MiddleLeft,
    };

    private static Button ActionButton(string label, bool primary)
    {
        return new LuxuryButton
        {
            Primary = primary, Text = label, Height = 43,
            Width = Math.Max(152, label.Length * 8 + 28),
            BackColor = primary ? Accent : LuxuryPalette.SurfaceRaised,
            ForeColor = primary ? Background : Fore,
            Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold),
            Margin = new Padding(5, 4, 9, 4),
        };
    }

    private static void FormatInput(TextBox input, bool password)
    {
        input.BorderStyle = BorderStyle.FixedSingle;
        input.BackColor = PanelColor; input.ForeColor = Fore;
        input.Font = new Font("Segoe UI", 12);
        input.UseSystemPasswordChar = password;
    }

    private static DataGridView Grid()
    {
        var grid = new DataGridView
        {
            Dock = DockStyle.Fill, AutoGenerateColumns = false,
            ReadOnly = true, MultiSelect = false, AllowUserToAddRows = false,
            AllowUserToDeleteRows = false, RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            BackgroundColor = Background, GridColor = PanelLine,
            BorderStyle = BorderStyle.None, EnableHeadersVisualStyles = false,
            ColumnHeadersHeight = 48, RowTemplate = { Height = 42 },
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        };
        grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(36, 50, 71);
        grid.AlternatingRowsDefaultCellStyle.ForeColor = Fore;
        grid.DefaultCellStyle.BackColor = PanelColor;
        grid.DefaultCellStyle.ForeColor = Fore;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(44, 75, 112);
        grid.DefaultCellStyle.SelectionForeColor = Fore;
        grid.DefaultCellStyle.Font = new Font("Segoe UI", 10);
        grid.DefaultCellStyle.Padding = new Padding(6, 3, 4, 3);
        grid.ColumnHeadersDefaultCellStyle.BackColor = Sidebar;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Muted;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        grid.RowTemplate.Height = 47;
        grid.CellFormatting += (_, e) => {
            if (e.RowIndex < 0 || e.ColumnIndex < 0) return;
            var column = grid.Columns[e.ColumnIndex].DataPropertyName;
            if (column != "Status" && column != "DisplayLocalStatus") return;
            var status = e.Value?.ToString()?.ToLowerInvariant() ?? "";
            e.CellStyle.ForeColor = status.Contains("progress") || status.Contains("bekerja") ||
                status.Contains("ready") ? Success : Accent;
            e.CellStyle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        };
        return grid;
    }

    private static void AddColumn(DataGridView grid, string title, string property, int width)
    {
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = title, DataPropertyName = property,
            MinimumWidth = 75, FillWeight = width,
            SortMode = DataGridViewColumnSortMode.Automatic,
        });
    }

    private static void Rebind<T>(DataGridView grid, List<T> items)
    {
        var selectedCode = (grid.CurrentRow?.DataBoundItem as PayrollOrder)?.OrderRef
            ?? (grid.CurrentRow?.DataBoundItem as Employee)?.Code;
        grid.DataSource = null;
        grid.DataSource = items.ToList();
        if (selectedCode is null) return;
        foreach (DataGridViewRow row in grid.Rows)
        {
            var code = (row.DataBoundItem as PayrollOrder)?.OrderRef
                ?? (row.DataBoundItem as Employee)?.Code;
            if (!string.Equals(code, selectedCode, StringComparison.OrdinalIgnoreCase)) continue;
            row.Selected = true;
            grid.CurrentCell = row.Cells[0];
            break;
        }
    }
}
