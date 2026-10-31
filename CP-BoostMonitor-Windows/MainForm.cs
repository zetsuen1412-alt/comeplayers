using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Windows.Forms;

namespace CPBoostMonitor;

public sealed class MainForm : Form
{
    private readonly PayrollApi _api;
    private readonly CompletedOrdersPanel _completedPanel;
    private readonly MonitorWorkspacePanel _managementPanel, _booksPanel;
    private readonly OrderAlerts _alerts;
    private OrderNotificationToast? _orderToast;
    private readonly LocalStatusStore _statusStore;
    private readonly bool _preview;
    private readonly System.Windows.Forms.Timer _poll = new() { Interval = 30_000 };
    private readonly System.Windows.Forms.Timer _sleepClock = new() { Interval = 1_000 };
    private readonly NotifyIcon _tray = new();
    private readonly Dictionary<string, Control> _pages = new();
    private readonly Dictionary<string, Button> _navigation = new();
    private readonly HashSet<string> _panelReads = new();
    private List<Employee> _employees = new();
    private List<PayrollOrder> _pending = new();
    private List<PayrollOrder> _tasks = new();
    private bool _busy;
    private bool _refreshBusy;
    private bool _refreshNeeded;
    private bool _refreshScheduled;
    private long _actionGeneration;
    private readonly SemaphoreSlim _snapshotGate = new(1, 1);
    private int _readFailures;
    private bool _hasSnapshot;
    private DateTimeOffset _rosterFetchedAt = DateTimeOffset.MinValue;
    private int _rosterIdentity = -1;
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
        Padding = new Padding(16, 14, 16, 0), AutoScroll = true, BackColor = Sidebar,
    };
    private readonly Label _connection = new() { AutoSize = true, ForeColor = LuxuryPalette.SidebarMuted };
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
    private readonly Button _loginButton = ActionButton("MASUK SEBAGAI ADMIN", true);
    private readonly Button _reconnectButton = ActionButton("Sambungkan ulang", false);
    private readonly Label _loginFeedback = StyledText("Gunakan akun ComePlayers dengan akses operasional.", 10);
    private readonly RichTextBox _history = new() { ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = PanelColor, ForeColor = Fore, Font = new Font("Consolas", 10.5f) };
    private readonly TakeOrderPanel _takePanel = new();
    private string _activePage = "Take Order";

    public MainForm() : this(false) { }
    internal MainForm(bool preview, PayrollApi? api = null)
    {
        _preview = preview;
        string previewPath = Path.Combine(Path.GetTempPath(), "fh3-render-" + Guid.NewGuid().ToString("N"));
        _alerts = new OrderAlerts(preview ? previewPath : null);
        _api = api ?? (preview ? new PayrollApi(new HttpClientHandler(), Path.Combine(previewPath, "session.dat")) : new PayrollApi());
        _statusStore = new LocalStatusStore(preview ? Path.Combine(previewPath, "local-status.json") : null);
        _completedPanel = new CompletedOrdersPanel(_api);
        _managementPanel = new MonitorWorkspacePanel(_api, true); _booksPanel = new MonitorWorkspacePanel(_api, false);
        Text = "EVOGAMING Monitor — FH3 | Windows";
        MinimumSize = new Size(1120, 740);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1460, 900);
        DoubleBuffered = true;
        BackColor = Background;
        ForeColor = Fore;
        Font = new Font("Segoe UI", 10);
        Icon = Fh3Branding.Icon;

        BuildLayout();
        _reconnectButton.Enabled = _api.WorkspaceAvailable;
        _navigation["Kelola Order"].Visible = false;
        Shown += (_, _) => WindowChrome.ApplyCaption(this);
        _takePanel.TakeRequested += async (_, choice) => await RunBusyAsync(() => TakeOrderAsync(choice));
        _takePanel.StatusRequested += (_, choice) => UpdateWorkerStatus(choice);
        _takePanel.ProofRequested += async (_, choice) =>
            await RunBusyAsync(() => SendProofForAsync(choice.Task, choice.Action));
        _takePanel.TakeTelegramRequested += async (_, task) =>
            await RunBusyAsync(() => CheckOrSendTakeAsync(task));
        _takePanel.ArchiveRequested += async (_, order) =>
            await RunBusyAsync(() => ArchiveOrderAsync(order));
        _takePanel.TeamRequested += async (_, order) =>
            await RunBusyAsync(() => EditOrderTeamAsync(order));
        _sleepClock.Tick += (_, _) => RefreshSleepTimers();
        if (!preview) _sleepClock.Start();
        _poll.Tick += async (_, _) => await RunBusyAsync(RefreshDataAsync, quiet: true);
        _tray.Icon = Fh3Branding.Icon;
        _tray.Text = "EVOGAMING Monitor FH3";
        _tray.Visible = !preview;
        _tray.ContextMenuStrip = new ContextMenuStrip();
        _tray.ContextMenuStrip.Items.Add("Buka EVOGAMING Monitor", null, (_, _) => RestoreWindow());
        _tray.ContextMenuStrip.Items.Add("Keluar", null, (_, _) => Close());
        _tray.DoubleClick += (_, _) => RestoreWindow();
        _tray.BalloonTipClicked += (_, _) => { RestoreWindow(); ShowPage("Take Order"); };
        Shown += async (_, _) =>
        {
            if (_preview) return;
            ShowPage("Take Order");
            await RunBusyAsync(RefreshDataAsync, quiet: true);
        };
    }

    protected override bool ShowWithoutActivation => _preview || base.ShowWithoutActivation;
    private bool _resourcesDisposed;
    protected override void Dispose(bool disposing)
    {
        if (disposing && !_resourcesDisposed) {
            _resourcesDisposed = true; _orderToast?.Dispose(); _poll.Dispose(); _sleepClock.Dispose(); _tray.Visible = false; _tray.Dispose(); _alerts.Dispose(); _api.Dispose();
        }
        base.Dispose(disposing);
    }

    private void RestoreWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    // Offline rendering uses synthetic data, isolated paths, no tray, timers or authentication.
    internal void LoadPreview(CompletedSnapshot completed, List<Employee> people, List<PayrollOrder> pending, string page, bool isAdmin = false, List<PayrollOrder>? tasks = null)
    {
        if (!_preview) throw new InvalidOperationException("Preview mode required.");
        _employees = people; _pending = pending; _tasks = tasks ?? new(); BindTables(); ShowPage(page);
        _takePanel.SetAdminAccess(isAdmin); _navigation["Kelola Order"].Visible = isAdmin;
        _completedPanel.ApplySnapshot(completed);
        _connection.Text = "●  PREVIEW / DATA CONTOH";
        _appStatus.Text = "Pratinjau desain • Data contoh • Tidak terhubung ke akun atau Telegram";
    }
    internal void LoadAdminPreview(ManagementSnapshot orders, BookSnapshot books, List<Employee> people, string page)
    {
        if(!_preview)throw new InvalidOperationException("Preview mode required.");
        _managementPanel.ApplyPreview(orders,books,people);_booksPanel.ApplyPreview(orders,books,people);
        _navigation["Kelola Order"].Visible=true;ShowPage(page);
        _connection.Text="● PREVIEW / DATA CONTOH";
        _appStatus.Text="Pratinjau desain • Data contoh • Tidak terhubung ke akun atau Telegram";
    }

    private void BuildLayout()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 252));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(layout);
        layout.Controls.Add(_nav, 0, 0);
        layout.Controls.Add(_content, 1, 0);

        _nav.Controls.Add(new BrandMark());
        foreach (var name in new[] { "Take Order", "Order Selesai", "Data Tutup Buku", "Kelola Order", "Aktivitas Lokal", "Pengaturan" })
        {
            var button = NavButton(name);
            _nav.Controls.Add(button);
            _navigation[name] = button;
            button.Click += (_, _) => ShowPage(name);
        }
        var account = StyledText("●  TELEGRAM FH3", 9, true, LuxuryPalette.SidebarText);
        account.Margin = new Padding(12, 32, 0, 4);
        _nav.Controls.Add(account);
        _connection.Text = "Mode Karyawan • Menghubungkan";
        _connection.Margin = new Padding(12, 0, 0, 0);
        _nav.Controls.Add(_connection);

        var header = new Panel { Dock = DockStyle.Top, Height = 119,
            Padding = new Padding(22, 14, 22, 4), BackColor = Background };
        var breadcrumb = StyledText("EVOGAMING  /  OPERATIONS WORKSPACE", 8.5f, true, Accent);
        breadcrumb.Location = new Point(25, 16);
        header.Controls.Add(breadcrumb);
        _headline.Text = "Take Order";
        _headline.Font = new Font("Segoe UI", 25, FontStyle.Bold);
        _headline.Location = new Point(22, 37);
        header.Controls.Add(_headline);
        _metrics.Location = new Point(26, 90);
        _metrics.Text = "Pilih karyawan + pilih order  •  klik TAKE ORDER";
        header.Controls.Add(_metrics);
        var connectionActions = new Panel { Dock = DockStyle.Right, Width = 214, Padding = new Padding(8, 17, 4, 0) };
        _reconnectButton.Name = "ReconnectMonitor";
        _reconnectButton.Dock = DockStyle.Top;
        _reconnectButton.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync, quiet: true);
        connectionActions.Controls.Add(_reconnectButton);
        header.Controls.Add(connectionActions);
        header.Paint += (_, e) => {
            using var pen = new Pen(PanelLine, 1);
            e.Graphics.DrawLine(pen, 19, header.Height - 1, header.Width - 19, header.Height - 1);
        };
        var footer = new Panel { Dock = DockStyle.Bottom, Height = 36, Padding = new Padding(18, 0, 8, 0), BackColor = PanelColor };
        _appStatus.Text = "Siap. Screenshot dikirim hanya setelah tombol START/DONE dikonfirmasi.";
        footer.Controls.Add(_appStatus);
        var area = new Panel { Dock = DockStyle.Fill, BackColor = Background };
        _content.Controls.Add(area);
        _content.Controls.Add(footer);
        _content.Controls.Add(header);

        _pages["Login"] = BuildLogin();
        _pages["Take Order"] = _takePanel;
        _pages["Order Selesai"] = _completedPanel;
        _pages["Data Tutup Buku"] = _booksPanel;
        _pages["Kelola Order"] = _managementPanel;
        _pages["Aktivitas Lokal"] = BuildHistory();
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
        form.Width = 642; form.Height = 470;
        form.Controls.Add(MakeLabel("SECURE ACCESS  /  FH3", 10, 26, 18, true, Accent));
        form.Controls.Add(MakeLabel("Login Admin", 22, 26, 49, true, Fore));
        form.Controls.Add(MakeLabel("Karyawan tidak perlu login untuk mengambil dan melaporkan order.", 10, 26, 97, false, Muted));
        _email.SetBounds(26, 149, 584, 42);
        FormatInput(_email, false);
        _email.PlaceholderText = "Username ComePlayers (email lama tetap diterima)";
        form.Controls.Add(MakeLabel("USERNAME", 9, 27, 126, true, Muted));
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
            _loginFeedback.Text = "Menghubungkan ke ComePlayers…";
            try
            {
                await _api.LoginAdminAsync(_email.Text, password);
                _password.Clear();
                ShowPage("Take Order");
                await RefreshDataAsync();
            }
            finally { _password.Clear(); }
        });
        form.Controls.Add(_loginButton);
        _loginFeedback.Location = new Point(27, 358);
        _loginFeedback.Width = 574;
        form.Controls.Add(_loginFeedback);
        var back = ActionButton("Kembali ke Order Baru", false);
        back.SetBounds(26, 409, 260, 36);
        back.Click += (_, _) => { _password.Clear(); ShowPage("Take Order"); };
        form.Controls.Add(back);
        page.Controls.Add(form);
        return page;
    }

    private Control BuildTasks()
    {
        var panel = new Panel { Padding = new Padding(20, 8, 20, 12) };
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 124, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoScroll = true };
        var start = ActionButton("▶ START + Screenshot", true);
        var done = ActionButton("✓ DONE + Screenshot", true);
        var pause = ActionButton("Ⅱ PAUSE / CONTINUE + Foto", false);
        var preflight = ActionButton("Periksa grup FH3", false);
        var refresh = ActionButton("↻ Refresh", false);
        start.Click += async (_, _) => await RunBusyAsync(() => SendProofAsync("start"));
        done.Click += async (_, _) => await RunBusyAsync(() => SendProofAsync("done"));
        pause.Click += async (_, _) => await RunBusyAsync(() => SendProofAsync(
            (_tasksGrid.CurrentRow?.DataBoundItem as PayrollOrder)?.CanContinue == true ? "continue" : "pause"));
        preflight.Click += async (_, _) => await RunBusyAsync(async () =>
        {
            var name = await _api.VerifyGroupAsync();
            MessageBox.Show($"Grup Telegram terverifikasi: {name}\nTidak ada foto dikirim.",
                "Koneksi FH3", MessageBoxButtons.OK, MessageBoxIcon.Information);
        });
        refresh.Click += async (_, _) => await RunBusyAsync(RefreshDataAsync);
        toolbar.Controls.Add(start); toolbar.Controls.Add(pause); toolbar.Controls.Add(done); toolbar.Controls.Add(preflight); toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(MakeToolbarText("Cari:", 45));
        PrepareSearch(_taskSearch, "Kode, karyawan, game, TASK...", 255);
        _taskSearch.TextChanged += (_, _) => BindFilteredTables();
        toolbar.Controls.Add(_taskSearch);
        _taskStatusFilter.DropDownStyle = ComboBoxStyle.DropDownList;
        _taskStatusFilter.BackColor = PanelColor; _taskStatusFilter.ForeColor = Fore;
        _taskStatusFilter.Width = 180;
        _taskStatusFilter.Items.AddRange(new object[] { "Semua Status", "assigned", "in_progress", "paused", "on_hold" });
        _taskStatusFilter.SelectedIndex = 0;
        _taskStatusFilter.SelectedIndexChanged += (_, _) => BindFilteredTables();
        toolbar.Controls.Add(_taskStatusFilter);
        toolbar.Controls.Add(MakeToolbarText("Win+Shift+S → Clipboard; preview foto sebelum dikirim ke Telegram.", 620));
        panel.Controls.Add(_tasksGrid);
        panel.Controls.Add(toolbar);
        AddColumn(_tasksGrid, "Kode Order", "OrderRef", 125);
        AddColumn(_tasksGrid, "Karyawan", "EmployeeName", 145);
        AddColumn(_tasksGrid, "Status", "Status", 124);
        AddColumn(_tasksGrid, "Duration", "DisplayDuration", 185);
        AddColumn(_tasksGrid, "Tindakan", "ActionLabel", 180);
        AddColumn(_tasksGrid, "Nama Order", "OrderName", 200);
        AddColumn(_tasksGrid, "Game", "Game", 125);
        AddColumn(_tasksGrid, "Discord", "DisplayDiscord", 150);
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
        card.Width = 860; card.Height = 415;
        card.Controls.Add(MakeLabel("Koneksi EVOGAMING Monitor", 18, 22, 15, true, Fore));
        card.Controls.Add(MakeLabel("Website: https://www.comeplayers.com", 12, 22, 63));
        card.Controls.Add(MakeLabel("Divisi: FH3  •  Bukti Telegram: 🔥 EVO🔥 Ilham FH3", 12, 22, 101));
        card.Controls.Add(MakeLabel("Mode karyawan langsung berjalan tanpa login atau aktivasi perangkat.", 12, 22, 139));
        card.Controls.Add(MakeLabel("Login admin untuk menghapus, memindahkan, memberi upah, dan Tutup Buku.", 11, 22, 176));
        var adminLogin = ActionButton("Login Admin", true);
        adminLogin.Name = "OpenAdminLogin"; adminLogin.SetBounds(22, 222, 252, 42);
        adminLogin.Click += (_, _) => ShowPage("Login"); card.Controls.Add(adminLogin);
        var logout = ActionButton("Keluar dari admin", false);
        logout.SetBounds(286, 222, 252, 42);
        logout.Click += (_, _) =>
        {
            if (MessageBox.Show("Keluar dari akun ComePlayers di PC ini?", "Logout",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            _orderToast?.Close(); _alerts.StopSound(); _api.Logout(); _poll.Stop(); _takePanel.SetAdminAccess(false);
            _completedPanel.Clear(); _managementPanel.Clear(); _booksPanel.Clear(); _navigation["Kelola Order"].Visible=false; _takePanel.SetStale(true);
            _employees.Clear(); _pending.Clear(); _tasks.Clear(); _hasSnapshot = false;
            _seenInitialQueue = false; _lastRefs.Clear();
            BindTables();
            ShowPage("Take Order");
            _poll.Start();
        };
        card.Controls.Add(logout);
        var sound = new CheckBox {Text="Suara order baru: musik (10 detik)",Checked=_alerts.SoundEnabled,AutoSize=true,Left=22,Top=284};
        sound.CheckedChanged+=(_,_)=>_alerts.SoundEnabled=sound.Checked;card.Controls.Add(sound);
        card.Controls.Add(MakeLabel("Notifikasi berjalan selama Monitor terbuka, termasuk ketika diminimalkan.",10,22,320));
        var testAlert = ActionButton("Tes notifikasi", false); testAlert.SetBounds(22, 356, 210, 38);
        testAlert.Click += (_, _) => ShowOrderNotification(new[] { "Contoh notifikasi order" }, demonstration: true);
        card.Controls.Add(testAlert);
        page.Controls.Add(card);
        return page;
    }

    private void ApplyLocalState(Employee employee)
    {
        employee.LocalStatus = _statusStore.Get(employee.Code);
        var sleep = _statusStore.GetSleep(employee.Code);
        employee.SleepStartedAt = sleep?.StartedAt;
    }

    private void RefreshSleepTimers()
    {
        if (IsDisposed || _activePage != "Take Order" || WindowState == FormWindowState.Minimized) return;
        _takePanel.TickSleepClock();
    }

    private void UpdateWorkerStatus(StatusRequest request)
    {
        try
        {
            var employee = _employees.FirstOrDefault(e =>
                e.Code.Equals(request.Worker.Code, StringComparison.OrdinalIgnoreCase));
            if (employee is null) throw new InvalidOperationException("Karyawan tidak lagi tersedia.");
            var description = request.Status == "SLEEP"
                ? "Tidur • waktu dihitung sejak status mulai"
                : request.Status switch
                {
                    "READY" => "Ready Boosting", "WORK" => "Sedang Bekerja",
                    "IDLE" => "Farming", "BREAK" => "Istirahat", _ => "Offline",
                };
            if (MessageBox.Show(
                $"Karyawan: {employee.Name}\nStatus baru: {description}\n\n" +
                "Status ini disimpan pada PC Windows ini saja, bukan Payroll atau Android. Lanjut?",
                "Konfirmasi Status Karyawan", MessageBoxButtons.YesNo, MessageBoxIcon.Question)
                != DialogResult.Yes) return;
            _statusStore.Set(employee, request.Status);
            foreach (var person in _employees) ApplyLocalState(person);
            BindTables();
            SetStatus($"Status {employee.Name}: {description} (lokal PC).");
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Status Karyawan",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task TakeOrderAsync(AssignmentRequest selection)
    {
        // Re-validate against the live client snapshot. Server RPC enforces atomic assignment.
        var employee = _employees.FirstOrDefault(e => e.Code == selection.Worker.Code && e.Active);
        var order = _pending.FirstOrDefault(o => o.OrderRef == selection.Order.OrderRef);
        if (employee is null || order is null || !order.TakeAllowed)
            throw new InvalidOperationException("Karyawan atau order sudah berubah. Segarkan data dan pilih lagi.");
        if (employee.LocalStatus is "SLEEP" or "BREAK" or "OFFLINE")
            throw new InvalidOperationException(
                $"Karyawan {employee.Name} masih berstatus {employee.DisplayLocalStatus}. " +
                "Ubah ke Ready Boosting terlebih dahulu sebelum TAKE ORDER.");
        List<OrderParticipant>? participants = null;
        if (_api.IsAdmin)
        {
            using var dialog = new OrderTeamDialog(order.OrderRef, _employees, employee.Code,
                new[] { new OrderParticipant { EmployeeId = employee.Id, EmployeeCode = employee.Code, EmployeeName = employee.Name, ShareBps = 10000 } }, true);
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            participants = dialog.Participants;
            foreach (var participant in participants)
            {
                var worker = _employees.SingleOrDefault(e => e.Code == participant.EmployeeCode && e.Active && e.Team == "FH3");
                if (worker is null || worker.LocalStatus is "SLEEP" or "BREAK" or "OFFLINE")
                    throw new InvalidOperationException($"Karyawan {participant.EmployeeName} belum siap. Periksa daftar dan status karyawan.");
            }
        }
        _takePanel.SetWorking(true);
        try
        {
            var assignedName = await _api.AssignAsync(order.OrderRef, employee.Code, participants);
            var statusWarning = participants is null ? MarkWorkingAfterTake(employee, order.OrderRef)
                : string.Join("", participants.Select(p => MarkWorkingAfterTake(_employees.Single(e => e.Code == p.EmployeeCode), order.OrderRef)));
            _takePanel.ClearChoices();
            _pending.RemoveAll(item => item.OrderRef == order.OrderRef);
            BindTables();
            FinishAction($"TAKE berhasil: {order.OrderRef} → {assignedName}.{statusWarning}");
        }
        catch { order.DeliveryUncertain = true; BindTables(); _refreshNeeded = true; throw; }
        finally {
            _takePanel.SetWorking(false);
        }
    }

    private async Task EditOrderTeamAsync(PayrollOrder selected)
    {
        if (!_api.IsAdmin || !selected.TeamSupported || selected.DeliveryUncertain) return;
        var snapshot = await _api.TeamAsync(selected.OrderRef);
        if (!_api.IsAdmin) return;
        using var dialog = new OrderTeamDialog(selected.OrderRef, _employees, selected.EmployeeCode, snapshot.Participants, false);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        // Keep the reviewed revision. A conflict is shown to the operator and never replayed.
        await _api.SaveTeamAsync(selected.OrderRef, snapshot.TeamVersion, selected.EmployeeCode,
            dialog.Participants, snapshot.Participants.Select(p => p.EmployeeCode));
        _refreshNeeded = true;
        FinishAction($"Tim {selected.OrderRef} diperbarui: {TeamAllocation.Summary(dialog.Participants)}.");
    }

    private async Task CheckOrSendTakeAsync(PayrollOrder task)
    {
        if (!task.CanTake)
            throw new InvalidOperationException("TAKE hanya tersedia untuk tugas yang belum START.");
        try
        {
            var caption = await _api.TakeNoticeAsync(task.OrderRef, task.EmployeeCode);
            var matches = _employees.Where(e => e.Code == task.EmployeeCode && e.Id == task.EmployeeId).ToList();
            var statusWarning = matches.Count == 1 ? MarkWorkingAfterTake(matches[0], task.OrderRef) : "";
            FinishAction("TAKE berhasil: " + caption + statusWarning);
        }
        catch
        {
            task.DeliveryUncertain = true; BindTables();
            throw;
        }
        finally { _refreshNeeded = true; }
    }

    private async Task SendProofAsync(string action)
    {
        if (_tasksGrid.CurrentRow?.DataBoundItem is not PayrollOrder order)
            throw new InvalidOperationException("Pilih tugas di tabel terlebih dahulu.");
        await SendProofForAsync(order, action);
    }

    private async Task SendProofForAsync(PayrollOrder order, string action)
    {
        if (!order.AllowsProof(action))
            throw new InvalidOperationException($"Aksi {action.ToUpperInvariant()} tidak tersedia untuk status {order.Status}. Perbarui data dahulu.");
        var image = SelectScreenshot();
        if (image is null) return;
        var (bytes, mime) = image.Value;
        if (!PayrollApi.ValidImage(bytes, mime))
            throw new InvalidOperationException("Screenshot PNG/JPEG tidak valid atau lebih besar dari 7 MB.");
        SetStatus($"Mengirim {action.ToUpperInvariant()} {order.OrderRef}…");
        // No retries. Any network timeout might mean Telegram has already accepted the photo.
        try
        {
            var result = await _api.ProgressAsync(order.OrderRef, order.EmployeeCode, action, bytes, mime, order.PauseRevision, order.StartEventId, order);
            order.CanStart = order.CanDone = order.CanPause = order.CanContinue = order.CanTake = false;
            order.ActionMessage = "Memperbarui status…";
            BindTables();
            FinishAction($"{action.ToUpperInvariant()} berhasil: {result.Caption}");
        }
        catch
        {
            order.DeliveryUncertain = true;
            BindTables();
            _refreshNeeded = true;
            throw;
        }
    }

    private (byte[] bytes, string mime)? SelectScreenshot()
    {
        if (_preview && ScreenshotForCheck is not null) return ScreenshotForCheck();
        var choice = MessageBox.Show(this,
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
            ApplyLocalState(item);
        BindTables();
        SetStatus($"Status {employee.Name}: {employee.DisplayLocalStatus} (hanya PC ini).");
        return Task.CompletedTask;
    }

    private async Task ArchiveOrderAsync(PayrollOrder selected)
    {
        if (!_api.IsAdmin) throw new UnauthorizedAccessException("Hanya admin yang dapat menghapus order.");
        _takePanel.SetWorking(true);
        try
        {
            SetStatus($"Menghapus {selected.OrderRef}…");
            var version = selected.ControlVersion;
            // Older servers do not include the version. Never assume zero for an
            // existing control: keep optimistic concurrency on both API versions.
            if (version is null)
            {
                var snapshot = await _api.ManagementAsync();
                var current = snapshot.Orders.SingleOrDefault(o => o.OrderRef == selected.OrderRef);
                if (current is null || current.MonitorArchived)
                    throw new InvalidOperationException("Order sudah dihapus atau tidak lagi tersedia. Segarkan daftar.");
                version = current.Version;
            }
            await _api.ArchiveOrderAsync(selected.OrderRef, version.Value, "Dihapus admin melalui daftar order Monitor");
            _pending.RemoveAll(item => item.OrderRef == selected.OrderRef);
            _tasks.RemoveAll(item => item.OrderRef == selected.OrderRef);
            BindTables();
            FinishAction($"Order {selected.OrderRef} dihapus. Pulihkan melalui Kelola Order → Pulihkan.");
        }
        finally { _takePanel.SetWorking(false); }
    }

    private string MarkWorkingAfterTake(Employee employee, string orderRef)
    {
        if (_employees.Count(e => e.Code.Equals(employee.Code, StringComparison.OrdinalIgnoreCase)) != 1
            || _employees.Count(e => e.Id == employee.Id) != 1) return "\nTAKE terkonfirmasi; status lokal menunggu identitas karyawan yang unik.";
        try { _statusStore.MarkWorkingAfterConfirmedTake(employee, orderRef); ApplyLocalState(employee); BindTables(); return ""; }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or InvalidOperationException)
        { return "\nTAKE sudah terkonfirmasi; status lokal belum tersimpan: " + e.Message; }
    }

    private async Task RefreshDataAsync()
    {
        if (!_api.WorkspaceAvailable) return;
        var generation = _actionGeneration;
        await _snapshotGate.WaitAsync();
        try {
        if (generation != _actionGeneration || IsDisposed) return;
        // Start recovery before the first request: a failed startup must not leave
        // an empty workspace with no timer or way to reconnect.
        _poll.Start();
        _connection.Text = "Menghubungkan ke ComePlayers…";
        if (!_hasSnapshot) _metrics.Text = "Memuat data karyawan dan order…";
        if (!_hasSnapshot) _takePanel.SetStale(true);
        // Employee names change much less often than orders. Mutations still
        // authorize the current employee and admin permissions on the server.
        var identity = _api.IdentityVersion;
        var readRoster = !_hasSnapshot || identity != _rosterIdentity
            || DateTimeOffset.UtcNow - _rosterFetchedAt >= TimeSpan.FromMinutes(2);
        var newRoster = readRoster ? await _api.RosterAsync() : _employees;
        var pendingRead = _api.CanOperate ? _api.PendingAsync() : Task.FromResult(new List<PayrollOrder>());
        var tasksRead = _api.TasksAsync();
        await Task.WhenAll(pendingRead, tasksRead);
        // A response started before a user action must never overwrite its result.
        if (generation != _actionGeneration || IsDisposed) return;
        if (readRoster) { _rosterFetchedAt = DateTimeOffset.UtcNow; _rosterIdentity = identity; }
        _navigation["Kelola Order"].Visible = _api.IsAdmin;
        _takePanel.SetAdminAccess(_api.IsAdmin);
        var freshPending = await pendingRead;
        var freshTasks = await tasksRead;
        string statusWarning = "";
        try { _statusStore.ApplyConfirmedTasks(newRoster, freshTasks); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or InvalidOperationException)
        { statusWarning = " Status otomatis belum tersimpan: " + e.Message; }
        foreach (var employee in newRoster) ApplyLocalState(employee);
        _employees = newRoster;
        _tasks = freshTasks;
        var newRefs = freshPending.Select(order => order.OrderRef).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var additions = _seenInitialQueue
            ? newRefs.Except(_lastRefs, StringComparer.OrdinalIgnoreCase).ToList()
            : new List<string>();
        _lastRefs = newRefs;
        _seenInitialQueue = true;
        _pending = freshPending;
        _hasSnapshot = true;
        BindTables();
        _takePanel.SetStale(false);
        _connection.Text = _api.PublicMode ? "●  Mode Karyawan • FH3" : $"●  {_api.Username} • Admin";
        _connection.ForeColor = LuxuryPalette.SidebarText;
        _poll.Start();
        _readFailures = 0; _poll.Interval = 30_000;
        SetStatus($"Terhubung {DateTime.Now:HH:mm:ss} • {_pending.Count} order baru • {_tasks.Count} tugas aktif.{statusWarning}");
        var unseen = _alerts.Observe(_api.AccountId, newRefs);
        if (unseen.Count > 0)
        {
            ShowOrderNotification(unseen);
            SetStatus($"ORDER BARU: {string.Join(", ",unseen.Take(6))}");
        }
        if (_activePage == "Order Selesai") await _completedPanel.RefreshAsync();
        } finally { _snapshotGate.Release(); }
    }

    private void FinishAction(string success)
    {
        SetStatus(success);
        _refreshNeeded = true;
    }

    private void ShowOrderNotification(IReadOnlyList<string> refs, bool demonstration = false)
    {
        _orderToast?.Close();
        try {
            _orderToast = new OrderNotificationToast(refs, () => {
                if (_api.WorkspaceAvailable) { RestoreWindow(); ShowPage("Take Order"); }
            }, demonstration: demonstration);
            _orderToast.Dismissed += (_, _) => _alerts.StopSound();
            _orderToast.Show(); // No owner: the popup stays visible while Monitor is minimized.
        } catch (Exception e) when (e is InvalidOperationException or System.ComponentModel.Win32Exception) {
            _orderToast?.Dispose(); _orderToast = null;
            try {
                _tray.BalloonTipTitle = demonstration ? "EVOGAMING • Tes notifikasi" : "Order FH3 baru";
                _tray.BalloonTipText = string.Join(", ", refs.Take(4)); _tray.ShowBalloonTip(7000);
            } catch { /* Notification presentation must not fail a successful queue refresh. */ }
        }
        _alerts.PlaySound();
    }

    private void BindTables()
    {
        _takePanel.BindData(_employees, _pending, _tasks);
        BindFilteredTables();
        var history = _statusStore.History;
        _history.Text = history.Count == 0 ? "Belum ada perubahan status karyawan pada PC ini."
            : string.Join(Environment.NewLine, history.Select(x =>
                $"{x.ChangedAt:dd/MM/yyyy HH:mm:ss}    {x.EmployeeName}: {x.From} → {x.To}  •  {x.Note}"));
        _metrics.Text = $"{_pending.Count} order baru   •   {_tasks.Count} tugas aktif   •   {_employees.Count} karyawan FH3";
        if (_navigation.TryGetValue("Take Order", out var item))
            item.Text = $"Take Order   /   {_pending.Count}";
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
        if (IsDisposed || (quiet && (_refreshBusy || _busy))) return;
        if (!quiet && _busy) { SetStatus("Tindakan sebelumnya sedang dikirim…"); return; }
        var generation = _actionGeneration;
        if (quiet) _refreshBusy = true;
        else { _busy = true; ++_actionGeneration; _takePanel.SetWorking(true); }
        _reconnectButton.Enabled = false;
        UseWaitCursor = !quiet;
        try { await action(); }
        catch (Exception error)
        {
            if (quiet && generation != _actionGeneration) return;
            var message = error switch
            {
                OperationCanceledException => "Koneksi melewati batas waktu. Perbarui daftar untuk memeriksa hasil tindakan sebelum melanjutkan.",
                HttpRequestException when error is not MonitorReadException => "Koneksi ke ComePlayers terputus. Perbarui daftar untuk memeriksa hasil tindakan sebelum melanjutkan.",
                _ => error.Message,
            };
            if (!_api.PublicMode && ! _api.LoggedIn)
            {
                _api.EnterPublicMode(); _takePanel.SetStale(true); _takePanel.SetAdminAccess(false);
                _navigation["Kelola Order"].Visible = false;
                _managementPanel.Clear();
                _connection.Text = "Mode Karyawan • sesi admin berakhir";
                if (_activePage != "Login") ShowPage("Take Order");
            }
            else if (error is HttpRequestException or OperationCanceledException)
            {
                _connection.Text = "Koneksi terputus • mencoba lagi";
                if (!_hasSnapshot) _metrics.Text = "Data belum berhasil dimuat • mencoba lagi otomatis";
            }
            if (_activePage == "Login") _loginFeedback.Text = message;
            SetStatus(message);
            _poll.Interval = Math.Min(120_000, 30_000 << Math.Min(++_readFailures, 2));
            if (!_preview) _poll.Start();
            if (!quiet && !IsDisposed)
                MessageBox.Show(this, message, "EVOGAMING Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally {
            if (quiet) _refreshBusy = false;
            else { _busy = false; _takePanel.SetWorking(false); UseWaitCursor = false; }
            _reconnectButton.Enabled = _api.WorkspaceAvailable && !_busy && !_refreshBusy;
            if (_refreshNeeded && !_refreshScheduled && !_busy && !_refreshBusy && !IsDisposed && IsHandleCreated) {
                _refreshScheduled = true;
                BeginInvoke(async () => {
                    _refreshScheduled = false;
                    if (_busy || _refreshBusy || IsDisposed) return;
                    _refreshNeeded = false;
                    await RunBusyAsync(RefreshDataAsync, quiet: true);
                });
            }
        }
    }

    internal Task ReconnectForCheckAsync() { ShowPage("Take Order"); return RunBusyAsync(RefreshDataAsync, quiet: true); }
    internal Func<(byte[] bytes, string mime)?>? ScreenshotForCheck { get; set; }
    internal bool RecoveryPolling => _poll.Enabled;

    private void SetStatus(string message) { _appStatus.Text = message; }

    private void ShowPage(string name)
    {
        if (name == "Kelola Order" && !_api.IsAdmin && !_preview) name = "Take Order";
        _activePage = name;
        foreach (var entry in _pages)
            entry.Value.Visible = entry.Key == name;
        if (_pages.TryGetValue(name, out var active)) active.BringToFront();
        foreach (var entry in _navigation)
        {
            entry.Value.BackColor = entry.Key == name ? PanelColor : Sidebar;
            entry.Value.ForeColor = Fore;
        }
        _headline.Text = name == "Login" ? "Login Admin" : name;
        if(name=="Kelola Order") _metrics.Text="Penugasan, status order, upah bersih, dan Tutup Buku";
        if(name=="Data Tutup Buku") _metrics.Text="Penghasilan tersimpan beserta daftar order di setiap Tutup Buku";
        if (name == "Aktivitas Lokal") BindTables();
        if (name == "Order Selesai") _ = _completedPanel.RefreshAsync();
        if (name == "Kelola Order") _ = RefreshPanelAsync(name, _managementPanel.RefreshAsync);
        if (name == "Data Tutup Buku") _ = RefreshPanelAsync(name, _booksPanel.RefreshAsync);
    }

    private async Task RefreshPanelAsync(string page, Func<Task> read)
    {
        if (!_panelReads.Add(page)) return;
        try { await read(); }
        catch (Exception error) { if (!IsDisposed && _activePage == page) SetStatus(error.Message); }
        finally { _panelReads.Remove(page); }
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
        var csv = new StringBuilder("Tanggal,Kode,Nama,Dari,Ke,Catatan\r\n");
        foreach (var entry in records)
            csv.AppendLine(string.Join(",", new[]
            {
                Quote(entry.ChangedAt.ToString("yyyy-MM-dd HH:mm:ss")),
                Quote(entry.EmployeeCode), Quote(entry.EmployeeName),
                Quote(entry.From), Quote(entry.To), Quote(entry.Note),
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
        Navigation = true, Text = title, Width = 216, Height = 55,
        Margin = new Padding(0, 2, 0, 8),
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
        grid.AlternatingRowsDefaultCellStyle.BackColor = LuxuryPalette.SurfaceRaised;
        grid.AlternatingRowsDefaultCellStyle.ForeColor = Fore;
        grid.DefaultCellStyle.BackColor = PanelColor;
        grid.DefaultCellStyle.ForeColor = Fore;
        grid.DefaultCellStyle.SelectionBackColor = LuxuryPalette.Selection;
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
            e.CellStyle!.ForeColor = status.Contains("progress") || status.Contains("bekerja") ||
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

