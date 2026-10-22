using System.Drawing;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>
/// Daily FH3 dispatch view. A worker and an order must each be selected explicitly;
/// filtering, refresh, and automatic grid binding must never dispatch an assignment.
/// </summary>
internal sealed class TakeOrderPanel : UserControl
{
    private readonly TextBox _workerSearch = SearchBox("Cari nama karyawan...");
    private readonly TextBox _orderSearch = SearchBox("Cari order, game, Discord, atau TASK...");
    private readonly ComboBox _workerFilter = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList, Width = 146, Height = 36,
        BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
        FlatStyle = FlatStyle.Flat,
    };
    private readonly DataGridView _workers = MakeGrid();
    private readonly DataGridView _orders = MakeGrid();
    private readonly DataGridView _tasks = MakeGrid();
    private readonly ComboBox _statusEditor = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList, Width = 146,
        BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
        FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9f),
    };
    private readonly Button _statusSave = new LuxuryButton
    {
        Text = "Ubah Status", Primary = false, BackColor = LuxuryPalette.SurfaceRaised,
        MinimumSize = new Size(113, 39),
    };
    private readonly Button _takeTelegram = new LuxuryButton
    {
        Text = "Kirim/Cek TAKE", Primary = false, BackColor = LuxuryPalette.SurfaceRaised,
        Height = 36, Dock = DockStyle.Fill,
    };
    private readonly Button _start = new LuxuryButton
    {
        Text = "START + Foto", Primary = false, BackColor = LuxuryPalette.SurfaceRaised,
        Height = 36, Dock = DockStyle.Fill,
    };
    private readonly Button _done = new LuxuryButton
    {
        Text = "DONE + Foto", Primary = false, BackColor = LuxuryPalette.SurfaceRaised,
        Height = 36, Dock = DockStyle.Fill,
    };
    private readonly Label _taskCount = Label("0 tugas", 10, LuxuryPalette.Muted);
    private string? _taskRef;
    private readonly Label _workerCount = Label("0 karyawan", 10, LuxuryPalette.Muted);
    private readonly Label _orderCount = Label("0 order", 10, LuxuryPalette.Muted);
    private readonly Label _workerChoice = Label("Belum memilih karyawan", 11, LuxuryPalette.Text);
    private readonly Label _orderChoice = Label("Belum memilih order", 11, LuxuryPalette.Text);
    private readonly Button _take = new LuxuryButton
    {
        Text = "TAKE ORDER  →", Primary = true,
        Dock = DockStyle.Fill, MinimumSize = new Size(170, 48),
        BackColor = LuxuryPalette.Accent, ForeColor = LuxuryPalette.Text,
    };

    private List<Employee> _roster = new();
    private List<PayrollOrder> _pending = new();
    private List<PayrollOrder> _activeTasks = new();
    private string? _employeeCode, _orderRef;
    private bool _binding, _working, _stale = true;

    public event EventHandler<AssignmentRequest>? TakeRequested;
    public event EventHandler<StatusRequest>? StatusRequested;
    public event EventHandler<ProofRequest>? ProofRequested;
    public event EventHandler<PayrollOrder>? TakeTelegramRequested;

    public TakeOrderPanel()
    {
        DoubleBuffered = true;
        BackColor = LuxuryPalette.Background;
        Dock = DockStyle.Fill;

        _workerFilter.Items.AddRange(new object[]
        {
            "Semua Status", "Ready Boosting", "Farming", "Tidur", "Sedang Bekerja",
            "Istirahat", "Offline",
        });
        _workerFilter.SelectedIndex = 0;
        _statusEditor.Items.AddRange(new object[]
        {
            "Ready Boosting", "Sedang Bekerja", "Tidur", "Farming", "Istirahat", "Offline",
        });
        _statusEditor.SelectedIndex = 0;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1,
            BackColor = LuxuryPalette.Background, Padding = new Padding(15, 8, 15, 12),
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 107));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(layout);

        var columns = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1,
            BackColor = LuxuryPalette.Background,
        };
        columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        layout.Controls.Add(columns, 0, 0);
        columns.Controls.Add(BuildColumn("Karyawan FH3", _workerSearch, _workerFilter,
            _workers, _workerCount, true), 0, 0);
        var right = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Background,
            ColumnCount = 1, RowCount = 2,
        };
        right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 53));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 47));
        right.Controls.Add(BuildColumn("Order Baru", _orderSearch, null,
            _orders, _orderCount, false), 0, 0);
        right.Controls.Add(BuildTasksColumn(), 0, 1);
        columns.Controls.Add(right, 1, 0);

        AddColumn(_workers, "KARYAWAN", "Name", 135);
        AddColumn(_workers, "STATUS", "DisplayLocalStatus", 210);
        _workers.Columns[1].ToolTipText = "Status dan lama tidur dalam jam:menit:detik";
        AddColumn(_orders, "ORDER", "OrderRef", 105);
        AddColumn(_orders, "GAME", "Game", 125);
        AddColumn(_orders, "DISCORD", "DisplayDiscord", 180);
        AddColumn(_orders, "TASK", "Task", 260);
        AddColumn(_tasks, "ORDER", "OrderRef", 115);
        AddColumn(_tasks, "KARYAWAN", "EmployeeName", 165);
        AddColumn(_tasks, "STATUS", "Status", 145);
        AddColumn(_tasks, "DISCORD", "DisplayDiscord", 145);
        AddColumn(_tasks, "LANGKAH BERIKUTNYA", "ActionMessage", 300);
        foreach (var grid in new[] { _orders, _tasks }) grid.CellToolTipTextNeeded += (_, e) => {
            if (e.RowIndex >= 0 && grid.Rows[e.RowIndex].DataBoundItem is PayrollOrder order)
                e.ToolTipText = $"{order.OrderRef} • {order.Game} • {order.OrderName}\nDiscord: {order.DisplayDiscord}\n{order.Task}";
        };

        _workers.SelectionChanged += (_, _) =>
        {
            if (_binding) return;
            _employeeCode = (_workers.CurrentRow?.DataBoundItem as Employee)?.Code;
            var selected = SelectedWorker;
            if (selected != null)
                _statusEditor.SelectedIndex = selected.LocalStatus switch
                {
                    "WORK" => 1, "SLEEP" => 2, "IDLE" => 3,
                    "BREAK" => 4, "OFFLINE" => 5, _ => 0,
                };
            UpdateSelection();
        };
        _orders.SelectionChanged += (_, _) =>
        {
            if (_binding) return;
            _orderRef = (_orders.CurrentRow?.DataBoundItem as PayrollOrder)?.OrderRef;
            UpdateSelection();
        };
        _tasks.SelectionChanged += (_, _) =>
        {
            if (_binding) return;
            _taskRef = (_tasks.CurrentRow?.DataBoundItem as PayrollOrder)?.OrderRef;
            UpdateSelection();
        };
        _takeTelegram.Click += (_, _) =>
        {
            if (SelectedTask is { CanTake: true } task)
                TakeTelegramRequested?.Invoke(this, task);
        };
        _start.Click += (_, _) =>
        {
            if (SelectedTask is { CanStart: true } task)
                ProofRequested?.Invoke(this, new ProofRequest(task, "start"));
        };
        _done.Click += (_, _) =>
        {
            if (SelectedTask is { CanDone: true } task)
                ProofRequested?.Invoke(this, new ProofRequest(task, "done"));
        };
        _statusSave.Click += (_, _) =>
        {
            if (SelectedWorker is not { } employee) return;
            var code = _statusEditor.SelectedIndex switch
            {
                1 => "WORK", 2 => "SLEEP", 3 => "IDLE",
                4 => "BREAK", 5 => "OFFLINE", _ => "READY",
            };
            StatusRequested?.Invoke(this, new StatusRequest(employee, code));
        };
        _workers.CellDoubleClick += (_, _) => _orders.Focus();
        _workerSearch.TextChanged += (_, _) => RenderLists();
        _orderSearch.TextChanged += (_, _) => RenderLists();
        _workerFilter.SelectedIndexChanged += (_, _) => RenderLists();

        var footer = new LuxuryCard
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            Margin = new Padding(7, 6, 7, 0), Padding = new Padding(17, 14, 18, 12),
        };
        var footerGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 2,
            BackColor = LuxuryPalette.Surface,
        };
        footerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        footerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        footerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        footerGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 25));
        footerGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        footerGrid.Controls.Add(Label("KARYAWAN TERPILIH", 9, LuxuryPalette.Accent), 0, 0);
        footerGrid.Controls.Add(Label("ORDER TERPILIH", 9, LuxuryPalette.Accent), 1, 0);
        footerGrid.Controls.Add(_workerChoice, 0, 1);
        footerGrid.Controls.Add(_orderChoice, 1, 1);
        footerGrid.Controls.Add(_take, 2, 0);
        footerGrid.SetRowSpan(_take, 2);
        footer.Controls.Add(footerGrid);
        layout.Controls.Add(footer, 0, 1);

        _take.Click += (_, _) =>
        {
            if (_working || _stale || _employeeCode is null || _orderRef is null) return;
            var worker = _roster.FirstOrDefault(e =>
                e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase));
            var order = _pending.FirstOrDefault(o =>
                o.OrderRef.Equals(_orderRef, StringComparison.OrdinalIgnoreCase));
            if (worker is null || order is null || !order.TakeAllowed) return;
            TakeRequested?.Invoke(this, new AssignmentRequest(worker, order));
        };
        UpdateSelection();
    }

    public void BindData(IEnumerable<Employee> employees, IEnumerable<PayrollOrder> orders,
        IEnumerable<PayrollOrder> tasks)
    {
        _roster = employees.Where(e => e.Active && e.Team == "FH3")
            .OrderBy(e => e.LocalStatus == "READY" ? 0 : 1)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToList();
        _pending = orders.ToList();
        _activeTasks = tasks.ToList();
        if (!_activeTasks.Any(t => t.OrderRef.Equals(_taskRef, StringComparison.OrdinalIgnoreCase)))
            _taskRef = null;
        // A selection cannot survive when a worker or order disappears from the live Payroll snapshot.
        if (!_roster.Any(e => e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase)))
            _employeeCode = null;
        if (!_pending.Any(o => o.OrderRef.Equals(_orderRef, StringComparison.OrdinalIgnoreCase)))
            _orderRef = null;
        RenderLists();
    }

    public void ClearChoices()
    {
        _employeeCode = null;
        _orderRef = null;
        RenderLists();
    }

    public void SetWorking(bool working)
    {
        _working = working;
        UpdateSelection();
    }

    public void SetStale(bool stale) { _stale = stale; UpdateSelection(); }

    public Employee? SelectedWorker => _roster.FirstOrDefault(e =>
        e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase));
    private PayrollOrder? SelectedTask => _activeTasks.FirstOrDefault(o =>
        o.OrderRef.Equals(_taskRef, StringComparison.OrdinalIgnoreCase));

    public void TickSleepClock()
    {
        // Dynamic property labels update without replacing the selected rows.
        _workers.InvalidateColumn(1);
    }

    private Control BuildTasksColumn()
    {
        var card = new LuxuryCard
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            Margin = new Padding(7), Padding = new Padding(13, 8, 13, 9),
        };
        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1,
            BackColor = LuxuryPalette.Surface,
        };
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 43));
        body.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var title = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 2,
            BackColor = LuxuryPalette.Surface,
        };
        title.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        title.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        title.Controls.Add(Label("Tugas Aktif", 13, LuxuryPalette.Text, true), 0, 0);
        _taskCount.TextAlign = ContentAlignment.MiddleRight;
        title.Controls.Add(_taskCount, 1, 0);
        body.Controls.Add(title, 0, 0);
        body.Controls.Add(_tasks, 0, 1);
        var actions = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            ColumnCount = 3, RowCount = 1, Padding = new Padding(0, 5, 0, 0),
        };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33));
        actions.Controls.Add(_takeTelegram, 0, 0);
        actions.Controls.Add(_start, 1, 0);
        actions.Controls.Add(_done, 2, 0);
        body.Controls.Add(actions, 0, 2);
        card.Controls.Add(body);
        return card;
    }

    private Control BuildColumn(string title, TextBox search,
        ComboBox? filter, DataGridView grid, Label counter, bool isOrder)
    {
        var card = new LuxuryCard
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            Margin = new Padding(7), Padding = new Padding(14, 10, 14, 12),
        };
        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = isOrder ? 4 : 3, ColumnCount = 1,
            BackColor = LuxuryPalette.Surface,
        };
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        body.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        if (isOrder) body.RowStyles.Add(new RowStyle(SizeType.Absolute, 65));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        card.Controls.Add(body);
        var titlebar = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            ColumnCount = 2, Padding = new Padding(3, 5, 3, 0),
        };
        titlebar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        titlebar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        titlebar.Controls.Add(Label(title, 13, LuxuryPalette.Text, true), 0, 0);
        counter.TextAlign = ContentAlignment.MiddleRight;
        titlebar.Controls.Add(counter, 1, 0);
        body.Controls.Add(titlebar, 0, 0);

        var toolbar = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            RowCount = 1, ColumnCount = filter is null ? 1 : 2,
            Padding = new Padding(2, 3, 2, 6),
        };
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        if (filter != null) toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 152));
        search.Dock = DockStyle.Fill;
        toolbar.Controls.Add(search, 0, 0);
        if (filter != null)
        {
            filter.Dock = DockStyle.Fill;
            filter.Margin = new Padding(8, 2, 0, 1);
            toolbar.Controls.Add(filter, 1, 0);
        }
        body.Controls.Add(toolbar, 0, 1);
        body.Controls.Add(grid, 0, 2);
        if (isOrder)
        {
            var editor = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2,
                BackColor = LuxuryPalette.Surface, Padding = new Padding(0, 6, 0, 0),
            };
            editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));
            editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
            editor.RowStyles.Add(new RowStyle(SizeType.Absolute, 19));
            editor.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            editor.Controls.Add(Label("UBAH STATUS KARYAWAN", 9, LuxuryPalette.Muted), 0, 0);
            editor.SetColumnSpan(editor.Controls[0], 2);
            _statusEditor.Dock = DockStyle.Fill;
            _statusSave.Dock = DockStyle.Fill;
            editor.Controls.Add(_statusEditor, 0, 1);
            editor.Controls.Add(_statusSave, 1, 1);
            body.Controls.Add(editor, 0, 3);
        }
        return card;
    }

    private void RenderLists()
    {
        if (IsDisposed) return;
        var filter = _workerFilter.SelectedIndex;
        IEnumerable<Employee> employees = _roster;
        if (filter > 0)
        {
            var code = filter switch
            {
                1 => "READY", 2 => "IDLE", 3 => "SLEEP",
                4 => "WORK", 5 => "BREAK", 6 => "OFFLINE", _ => "",
            };
            employees = employees.Where(e => e.LocalStatus == code);
        }
        var people = OrderFilters.Employees(employees, _workerSearch.Text).ToList();
        var orders = OrderFilters.Pending(_pending, _orderSearch.Text).ToList();
        _workerCount.Text = people.Count.ToString();
        _orderCount.Text = orders.Count + " order";
        _taskCount.Text = _activeTasks.Count + " tugas";
        _binding = true;
        try
        {
            RebindGrid(_workers, people, _employeeCode, obj => ((Employee)obj).Code);
            RebindGrid(_orders, orders, _orderRef, obj => ((PayrollOrder)obj).OrderRef);
            RebindGrid(_tasks, _activeTasks, _taskRef, obj => ((PayrollOrder)obj).OrderRef);
        }
        finally { _binding = false; }
        // Hidden selections are cleared to avoid dispatching a worker/order that user cannot see.
        if (!people.Any(e => e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase)))
            _employeeCode = null;
        if (!orders.Any(o => o.OrderRef.Equals(_orderRef, StringComparison.OrdinalIgnoreCase)))
            _orderRef = null;
        UpdateSelection();
    }

    private static void RebindGrid<T>(DataGridView grid, List<T> items, string? selected,
        Func<object, string> getKey)
    {
        grid.DataSource = null;
        grid.DataSource = items;
        grid.ClearSelection();
        grid.CurrentCell = null;
        if (selected is null) return;
        foreach (DataGridViewRow row in grid.Rows)
        {
            if (row.DataBoundItem is null ||
                !string.Equals(getKey(row.DataBoundItem), selected, StringComparison.OrdinalIgnoreCase))
                continue;
            grid.CurrentCell = row.Cells[0];
            row.Selected = true;
            break;
        }
    }

    private void UpdateSelection()
    {
        var worker = _roster.FirstOrDefault(e => e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase));
        var order = _pending.FirstOrDefault(o => o.OrderRef.Equals(_orderRef, StringComparison.OrdinalIgnoreCase));
        _workerChoice.Text = worker == null ? "Pilih karyawan di sebelah kiri"
            : worker.Name;
        _orderChoice.Text = order == null ? "Pilih order di sebelah kanan"
            : order.OrderRef + "  •  " + (string.IsNullOrWhiteSpace(order.Game) ? order.OrderName : order.Game);
        _workerChoice.ForeColor = worker == null ? LuxuryPalette.Muted : LuxuryPalette.Text;
        _orderChoice.ForeColor = order == null ? LuxuryPalette.Muted : LuxuryPalette.Text;
        var blocked = _working || _stale;
        _take.Enabled = !blocked && worker != null && order?.TakeAllowed == true;
        _statusSave.Enabled = !_working && worker != null;
        var task = SelectedTask;
        _takeTelegram.Enabled = !blocked && task?.CanTake == true;
        _start.Enabled = !blocked && task?.CanStart == true;
        _done.Enabled = !blocked && task?.CanDone == true;
        _take.Text = _working ? "MENGIRIM..." : "TAKE ORDER  →";
    }

    private static TextBox SearchBox(string placeholder) => new()
    {
        PlaceholderText = placeholder, BorderStyle = BorderStyle.FixedSingle,
        BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
        Font = new Font("Segoe UI", 10), Margin = new Padding(2, 2, 4, 1),
    };

    private static Label Label(string label, float size, Color color, bool bold = false) => new()
    {
        Text = label, AutoSize = false, Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft, ForeColor = color,
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
    };

    private static DataGridView MakeGrid()
    {
        var grid = new LuxuryGrid
        {
            Dock = DockStyle.Fill, ReadOnly = true, MultiSelect = false,
            AllowUserToAddRows = false, AllowUserToDeleteRows = false,
            RowHeadersVisible = false, AutoGenerateColumns = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            BackgroundColor = LuxuryPalette.Surface, GridColor = LuxuryPalette.Border,
            BorderStyle = BorderStyle.None, EnableHeadersVisualStyles = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            ColumnHeadersHeight = 45, RowTemplate = { Height = 49 },
        };
        grid.ColumnHeadersDefaultCellStyle.BackColor = LuxuryPalette.SurfaceRaised;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = LuxuryPalette.Muted;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        grid.DefaultCellStyle.BackColor = LuxuryPalette.Surface;
        grid.DefaultCellStyle.ForeColor = LuxuryPalette.Text;
        grid.DefaultCellStyle.SelectionBackColor = LuxuryPalette.Selection;
        grid.DefaultCellStyle.SelectionForeColor = LuxuryPalette.Text;
        grid.AlternatingRowsDefaultCellStyle.BackColor = LuxuryPalette.SurfaceRaised;
        grid.AlternatingRowsDefaultCellStyle.ForeColor = LuxuryPalette.Text;
        grid.DefaultCellStyle.Font = new Font("Segoe UI", 10);
        grid.DefaultCellStyle.Padding = new Padding(7, 3, 4, 3);
        grid.CellFormatting += (_, args) =>
        {
            if (args.RowIndex < 0 || args.ColumnIndex < 0) return;
            if (grid.Columns[args.ColumnIndex].DataPropertyName != "DisplayLocalStatus") return;
            var status = args.Value?.ToString() ?? "";
            args.CellStyle!.ForeColor = status == "Ready Boosting"
                ? LuxuryPalette.Success : status == "Sedang Bekerja" ? LuxuryPalette.Accent : LuxuryPalette.Muted;
        };
        return grid;
    }

    private static void AddColumn(DataGridView grid, string heading, string property, float weight)
    {
        grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            HeaderText = heading, DataPropertyName = property,
            MinimumWidth = 64, FillWeight = weight,
            SortMode = DataGridViewColumnSortMode.NotSortable,
        });
    }
}

internal sealed record AssignmentRequest(Employee Worker, PayrollOrder Order);
internal sealed record StatusRequest(Employee Worker, string Status);
internal sealed record ProofRequest(PayrollOrder Task, string Action);
