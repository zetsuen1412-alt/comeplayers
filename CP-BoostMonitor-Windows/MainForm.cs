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

    private static readonly Color Background = Color.FromArgb(15, 23, 42);
    private static readonly Color Sidebar = Color.FromArgb(20, 31, 51);
    private static readonly Color PanelColor = Color.FromArgb(30, 43, 65);
    private static readonly Color PanelLine = Color.FromArgb(58, 73, 99);
    private static readonly Color Fore = Color.FromArgb(245, 248, 252);
    private static readonly Color Muted = Color.FromArgb(165, 182, 204);
    private static readonly Color Accent = Color.FromArgb(249, 184, 61);
    private static readonly Color Success = Color.FromArgb(88, 217, 159);

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
    private readonly DataGridView _pendingGrid = Grid();
    private readonly DataGridView _tasksGrid = Grid();
    private readonly DataGridView _rosterGrid = Grid();
    private readonly ComboBox _workerPicker = new();
    private readonly ComboBox _statusPicker = new();
    private readonly Label _pendingCount = StyledText("Order belum ditugaskan: 0", 13, true);
    private readonly Label _taskCount = StyledText("Tugas aktif: 0", 13, true);
    private readonly Label _employeeCount = StyledText("Karyawan FH3: 0", 13, true);
    private readonly TextBox _email = new();
    private readonly TextBox _password = new();
    private readonly Button _loginButton = ActionButton("LOGIN PAYROLL", true);
    private readonly Label _loginFeedback = StyledText("Gunakan akun admin Payroll ComePlayers.", 10);
    private readonly RichTextBox _history = new() { ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = PanelColor, ForeColor = Fore, Font = new Font("Consolas", 10.5f) };
    private string _activePage = "Dashboard";

    public MainForm()
    {
        Text = "CP Boost Monitor — FH3 | Windows";
        MinimumSize = new Size(1000, 680);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1240, 800);
        BackColor = Background;
        ForeColor = Fore;
        Font = new Font("Segoe UI", 10);
        Icon = SystemIcons.Application;

        BuildLayout();
        _poll.Tick += async (_, _) => await RunBusyAsync(RefreshDataAsync, quiet: true);
        _tray.Icon = SystemIcons.Application;
        _tray.Text = "CP Boost Monitor FH3";
        _tray.Visible = true;
        _tray.ContextMenuStrip = new ContextMenuStrip();
        _tray.ContextMenuStrip.Items.Add("Buka CP Boost Monitor", null, (_, _) => RestoreWindow());
        _tray.ContextMenuStrip.Items.Add("Keluar", null, (_, _) => Close());
        _tray.DoubleClick += (_, _) => RestoreWindow();
        FormClosed += (_, _) => { _poll.Stop(); _tray.Visible = false; _tray.Dispose(); _api.Dispose(); };
        Shown += async (_, _) =>
        {
            if (_api.LoggedIn)
            {
                ShowPage("Dashboard");
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
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 232));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(layout);
        layout.Controls.Add(_nav, 0, 0);
        layout.Controls.Add(_content, 1, 0);

        var logo = StyledText("⚡ CP BOOST", 19, true, Accent);
        logo.Margin = new Padding(12, 4, 0, 2);
        _nav.Controls.Add(logo);
        var division = StyledText("MONITOR  •  FH3", 10, true, Muted);
        division.Margin = new Padding(12, 0, 0, 28);
        _nav.Controls.Add(division);
        foreach (var name in new[] { "Dashboard", "Order Baru", "Tugas Aktif", "Karyawan", "Riwayat", "Pengaturan" })
        {
            var button = NavButton(name);
            _nav.Controls.Add(button);
            _navigation[name] = button;
            button.Click += (_, _) => ShowPage(name);
        }
        var account = StyledText("●  Payroll Website", 10, false, Success);
        account.Margin = new Padding(12, 34, 0, 3);
        _nav.Controls.Add(account);
        _connection.Text = "Login belum aktif";
        _connection.Margin = new Padding(12, 0, 0, 0);
        _nav.Controls.Add(_connection);

        var header = new Panel { Dock = DockStyle.Top, Height = 108, Padding = new Padding(26, 17, 26, 6), BackColor = Background };
        _headline.Text = "Dashboard FH3";
        _headline.Location = new Point(27, 15);
        header.Controls.Add(_headline);
        _metrics.Location = new Point(29, 60);
        _metrics.Text = "Order langsung dari Payroll Website  •  Telegram: EVO Ilham FH3";
        header.Controls.Add(_metrics);
        var footer = new Panel { Dock = DockStyle.Bottom, Height = 36, Padding = new Padding(18, 0, 8, 0), BackColor = Sidebar };
        _appStatus.Text = "Siap. Screenshot dikirim hanya setelah tombol START/DONE dikonfirmasi.";
        footer.Controls.Add(_appStatus);
        var area = new Panel { Dock = DockStyle.Fill, BackColor = Background };
        _content.Controls.Add(area);
        _content.Controls.Add(footer);
        _content.Controls.Add(header);

        _pages["Login"] = BuildLogin();
        _pages["Dashboard"] = BuildDashboard();
        _pages["Order Baru"] = BuildOrders();
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
        form.Width = 610; form.Height = 365;
        form.Controls.Add(MakeLabel("Hubungkan akun Payroll", 22, 24, 20, true, Fore));
        form.Controls.Add(MakeLabel("Email dan password dipakai untuk masuk, tidak disimpan di PC.", 12, 24, 62, false, Muted));
        _email.SetBounds(24, 108, 548, 38);
        FormatInput(_email, false);
        _email.PlaceholderText = "Email admin Payroll";
        form.Controls.Add(_email);
        _password.SetBounds(24, 160, 548, 38);
        FormatInput(_password, true);
        _password.PlaceholderText = "Password";
        form.Controls.Add(_password);
        _loginButton.SetBounds(24, 215, 548, 43);
        _loginButton.Click += async (_, _) => await RunBusyAsync(async () =>
        {
            var password = _password.Text;
            _loginFeedback.Text = "Menghubungkan ke website...";
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
        _loginFeedback.Location = new Point(24, 278);
        _loginFeedback.Width = 550;
        form.Controls.Add(_loginFeedback);
        page.Controls.Add(form);
        return page;
    }

    private Control BuildDashboard()
    {
        var page = ScrollingPage();
        var summary = Card();
        summary.Width = 860; summary.Height = 224;
        summary.Controls.Add(MakeLabel("OPERASIONAL HARI INI", 11, 22, 18, true, Accent));
        _pendingCount.SetBounds(23, 66, 780, 36);
        _taskCount.SetBounds(23, 108, 780, 36);
        _employeeCount.SetBounds(23, 150, 780, 36);
        summary.Controls.Add(_pendingCount);
        summary.Controls.Add(_taskCount);
        summary.Controls.Add(_employeeCount);
        page.Controls.Add(summary);

        var panel = Card();
        panel.Width = 860; panel.Height = 250;
        panel.Controls.Add(MakeLabel("Alur kerja langsung", 16, 22, 17, true, Fore));
        panel.Controls.Add(MakeLabel("1   Website Payroll menerima order → muncul di Order Baru.", 12, 22, 67));
        panel.Controls.Add(MakeLabel("2   Pilih karyawan FH3 → penugasan tersimpan di website.", 12, 22, 103));
        panel.Controls.Add(MakeLabel("3   START + Screenshot → foto ke Telegram, order menjadi in_progress.", 12, 22, 139));
        panel.Controls.Add(MakeLabel("4   DONE + Screenshot → foto ke Telegram, order menjadi completed.", 12, 22, 175));
        page.Controls.Add(panel);

        var refresh = ActionButton("⟳ Segarkan seluruh data", true);
        refresh.Width = 250; refresh.Height = 43;
        refresh.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync);
        page.Controls.Add(refresh);
        return page;
    }

    private Control BuildOrders()
    {
        var panel = new Panel { Padding = new Padding(20, 8, 20, 12) };
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 116, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoScroll = true };
        toolbar.Controls.Add(MakeToolbarText("Karyawan:", 98));
        _workerPicker.DropDownStyle = ComboBoxStyle.DropDownList;
        _workerPicker.Width = 290; _workerPicker.Height = 33;
        _workerPicker.BackColor = PanelColor; _workerPicker.ForeColor = Fore;
        toolbar.Controls.Add(_workerPicker);
        var assign = ActionButton("Tugaskan karyawan", true);
        assign.Click += async (_, _) => await RunBusyAsync(AssignSelectedAsync);
        toolbar.Controls.Add(assign);
        var refresh = ActionButton("↻ Refresh", false);
        refresh.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync);
        toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(MakeToolbarText("Pilih order pada tabel. Hanya admin Payroll yang dapat menugaskan.", 610));
        panel.Controls.Add(_pendingGrid);
        panel.Controls.Add(toolbar);
        AddColumn(_pendingGrid, "Kode Order", "OrderRef", 130);
        AddColumn(_pendingGrid, "Jenis", "OrderType", 92);
        AddColumn(_pendingGrid, "Nama Order", "OrderName", 230);
        AddColumn(_pendingGrid, "Game", "Game", 130);
        AddColumn(_pendingGrid, "Buyer", "Buyer", 120);
        AddColumn(_pendingGrid, "TASK", "Task", 255);
        return panel;
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
        toolbar.Controls.Add(MakeToolbarText("Ambil screenshot dengan Win+Shift+S, lalu pilih Clipboard saat START/DONE.", 740));
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
        card.Controls.Add(MakeLabel("Koneksi CP Boost Monitor", 18, 22, 15, true, Fore));
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

    private async Task AssignSelectedAsync()
    {
        if (_pendingGrid.CurrentRow?.DataBoundItem is not PayrollOrder order)
            throw new InvalidOperationException("Pilih order di tabel terlebih dahulu.");
        if (_workerPicker.SelectedItem is not Employee employee)
            throw new InvalidOperationException("Pilih karyawan FH3.");
        var accepted = MessageBox.Show(
            $"Order: {order.OrderRef}\nNama: {order.OrderName}\nKaryawan: {employee.Name} ({employee.Code})\n\nSimpan penugasan langsung ke Payroll Website?",
            "Konfirmasi penugasan", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (accepted != DialogResult.Yes) return;
        await _api.AssignAsync(order.OrderRef, employee.Code);
        await RefreshDataAsync();
        if (MessageBox.Show($"Order {order.OrderRef} berhasil ditugaskan ke {employee.Name}.\n\nKirim foto START sekarang?",
            "Penugasan berhasil", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            await SendProofForAsync(new PayrollOrder
            {
                OrderRef = order.OrderRef, EmployeeCode = employee.Code,
                EmployeeName = employee.Name, Status = "assigned",
            }, "start");
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
        string caption = $"{order.OrderRef.ToLowerInvariant()}/{order.EmployeeName}/{action}";
        var confirm = MessageBox.Show(
            $"Order: {order.OrderRef}\nKaryawan: {order.EmployeeName}\nAksi: {action.ToUpperInvariant()}\nBukti: {Math.Round(bytes.Length / 1024d)} KB\n\nFoto akan dikirim ke grup Telegram EVO Ilham FH3 dan mengubah status order di website setelah berhasil. Lanjut?",
            "Konfirmasi bukti foto", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (confirm != DialogResult.Yes) return;
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
            _tray.BalloonTipTitle = $"CP Boost Monitor — {additions.Count} order FH3 baru";
            _tray.BalloonTipText = string.Join(", ", additions.Take(4));
            _tray.ShowBalloonTip(7000);
        }
    }

    private void BindTables()
    {
        Rebind(_pendingGrid, _pending);
        Rebind(_tasksGrid, _tasks);
        Rebind(_rosterGrid, _employees);
        _workerPicker.DataSource = null;
        _workerPicker.DataSource = _employees.OrderBy(e => e.Name).ToList();
        _pendingCount.Text = $"📦  {_pending.Count} order baru menunggu karyawan";
        _taskCount.Text = $"▶  {_tasks.Count} tugas aktif di website";
        _employeeCount.Text = $"♟  {_employees.Count} karyawan FH3 aktif";
        var history = _statusStore.History;
        _history.Text = history.Count == 0 ? "Belum ada perubahan status boosting pada PC ini."
            : string.Join(Environment.NewLine, history.Select(x =>
                $"{x.ChangedAt:dd/MM/yyyy HH:mm:ss}    {x.EmployeeName} ({x.EmployeeCode}): {x.From} → {x.To}"));
        _metrics.Text = $"{_pending.Count} order baru  •  {_tasks.Count} tugas aktif  •  {_employees.Count} karyawan FH3";
        if (_navigation.TryGetValue("Order Baru", out var orders))
            orders.Text = $"  📦   Order Baru  ({_pending.Count})";
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
                MessageBox.Show(error.Message, "CP Boost Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
            entry.Value.ForeColor = entry.Key == name ? Accent : Fore;
        }
        _headline.Text = name == "Login" ? "CP Boost Monitor • Login" : name + " FH3";
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
        MessageBox.Show("Riwayat lokal berhasil diekspor.", "CP Boost Monitor");
    }

    private static FlowLayoutPanel ScrollingPage() => new()
    {
        Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(22, 14, 22, 22),
        FlowDirection = FlowDirection.TopDown, WrapContents = false, BackColor = Background,
    };

    private static Panel Card() => new()
    {
        BackColor = PanelColor, Margin = new Padding(0, 0, 0, 22),
        Padding = new Padding(12), BorderStyle = BorderStyle.FixedSingle,
    };

    private static Label StyledText(string content, float fontSize, bool bold = false, Color? color = null) => new()
    {
        Text = content, AutoSize = true, ForeColor = color ?? Fore,
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

    private static Button NavButton(string title) => new()
    {
        Text = "  ▸  " + title, Width = 195, Height = 47,
        Margin = new Padding(5, 2, 4, 5),
        FlatStyle = FlatStyle.Flat, FlatAppearance = { BorderSize = 0 },
        TextAlign = ContentAlignment.MiddleLeft, BackColor = Sidebar,
        ForeColor = Fore, Cursor = Cursors.Hand, Font = new Font("Segoe UI", 10, FontStyle.Bold),
    };

    private static Button ActionButton(string label, bool primary)
    {
        var btn = new Button
        {
            Text = label, AutoSize = false, Height = 39,
            Width = Math.Max(144, label.Length * 8 + 26),
            FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
            BackColor = primary ? Accent : PanelColor, ForeColor = primary ? Background : Fore,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), Margin = new Padding(5, 4, 9, 4),
        };
        btn.FlatAppearance.BorderColor = primary ? Accent : PanelLine;
        return btn;
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
        grid.DefaultCellStyle.BackColor = PanelColor;
        grid.DefaultCellStyle.ForeColor = Fore;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(65, 89, 120);
        grid.DefaultCellStyle.SelectionForeColor = Fore;
        grid.DefaultCellStyle.Font = new Font("Segoe UI", 10);
        grid.DefaultCellStyle.Padding = new Padding(6, 3, 4, 3);
        grid.ColumnHeadersDefaultCellStyle.BackColor = Sidebar;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Accent;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        grid.RowTemplate.Height = 42;
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
