using System.Drawing;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>
/// Daily FH3 dispatch view. A worker and an order must each be selected explicitly;
/// filtering, refresh, and automatic grid binding must never dispatch an assignment.
/// </summary>
internal sealed class TakeOrderPanel : UserControl
{
    private readonly TextBox _workerSearch = SearchBox("Cari nama atau kode karyawan...");
    private readonly TextBox _orderSearch = SearchBox("Cari kode, game, buyer, atau TASK...");
    private readonly ComboBox _workerFilter = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList, Width = 146, Height = 36,
        BackColor = LuxuryPalette.SurfaceRaised, ForeColor = LuxuryPalette.Text,
        FlatStyle = FlatStyle.Flat,
    };
    private readonly DataGridView _workers = MakeGrid();
    private readonly DataGridView _orders = MakeGrid();
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
    private string? _employeeCode, _orderRef;
    private bool _binding, _working;

    public event EventHandler<AssignmentRequest>? TakeRequested;

    public TakeOrderPanel()
    {
        DoubleBuffered = true;
        BackColor = LuxuryPalette.Background;
        Dock = DockStyle.Fill;

        _workerFilter.Items.AddRange(new object[]
        {
            "Semua Status", "Ready Boosting", "Farming", "Tidur", "Sedang Bekerja",
        });
        _workerFilter.SelectedIndex = 0;

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
        columns.Controls.Add(BuildColumn("01", "Karyawan FH3", _workerSearch, _workerFilter,
            _workers, _workerCount, false), 0, 0);
        columns.Controls.Add(BuildColumn("02", "Order Baru", _orderSearch, null,
            _orders, _orderCount, true), 1, 0);

        AddColumn(_workers, "NAMA KARYAWAN", "Name", 180);
        AddColumn(_workers, "KODE", "Code", 85);
        AddColumn(_workers, "STATUS", "DisplayLocalStatus", 155);
        AddColumn(_orders, "ORDER", "OrderRef", 105);
        AddColumn(_orders, "GAME", "Game", 125);
        AddColumn(_orders, "NAMA ORDER", "OrderName", 180);
        AddColumn(_orders, "TASK", "Task", 260);

        _workers.SelectionChanged += (_, _) =>
        {
            if (_binding) return;
            _employeeCode = (_workers.CurrentRow?.DataBoundItem as Employee)?.Code;
            UpdateSelection();
        };
        _orders.SelectionChanged += (_, _) =>
        {
            if (_binding) return;
            _orderRef = (_orders.CurrentRow?.DataBoundItem as PayrollOrder)?.OrderRef;
            UpdateSelection();
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
            if (_working || _employeeCode is null || _orderRef is null) return;
            var worker = _roster.FirstOrDefault(e =>
                e.Code.Equals(_employeeCode, StringComparison.OrdinalIgnoreCase));
            var order = _pending.FirstOrDefault(o =>
                o.OrderRef.Equals(_orderRef, StringComparison.OrdinalIgnoreCase));
            if (worker is null || order is null) return;
            TakeRequested?.Invoke(this, new AssignmentRequest(worker, order));
        };
        UpdateSelection();
    }

    public void BindData(IEnumerable<Employee> employees, IEnumerable<PayrollOrder> orders)
    {
        _roster = employees.Where(e => e.Active && e.Team == "FH3")
            .OrderBy(e => e.LocalStatus == "READY" ? 0 : 1)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToList();
        _pending = orders.ToList();
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

    private static Control BuildColumn(string number, string title, TextBox search,
        ComboBox? filter, DataGridView grid, Label counter, bool isOrder)
    {
        var card = new LuxuryCard
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            Margin = new Padding(7), Padding = new Padding(14, 10, 14, 12),
        };
        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1,
            BackColor = LuxuryPalette.Surface,
        };
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 55));
        body.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        body.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        card.Controls.Add(body);
        var titlebar = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface,
            ColumnCount = 2, Padding = new Padding(3, 5, 3, 0),
        };
        titlebar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        titlebar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        titlebar.Controls.Add(Label(number + "  /  " + title, 15, LuxuryPalette.Text, true), 0, 0);
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
                1 => "READY", 2 => "IDLE", 3 => "SLEEP", 4 => "WORK", _ => "",
            };
            employees = employees.Where(e => e.LocalStatus == code);
        }
        var people = OrderFilters.Employees(employees, _workerSearch.Text).ToList();
        var orders = OrderFilters.Pending(_pending, _orderSearch.Text).ToList();
        _workerCount.Text = people.Count + " karyawan";
        _orderCount.Text = orders.Count + " order";
        _binding = true;
        try
        {
            RebindGrid(_workers, people, _employeeCode, obj => ((Employee)obj).Code);
            RebindGrid(_orders, orders, _orderRef, obj => ((PayrollOrder)obj).OrderRef);
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
            : worker.Name + "  •  " + worker.Code;
        _orderChoice.Text = order == null ? "Pilih order di sebelah kanan"
            : order.OrderRef + "  •  " + (string.IsNullOrWhiteSpace(order.Game) ? order.OrderName : order.Game);
        _workerChoice.ForeColor = worker == null ? LuxuryPalette.Muted : LuxuryPalette.Text;
        _orderChoice.ForeColor = order == null ? LuxuryPalette.Muted : LuxuryPalette.Text;
        _take.Enabled = !_working && worker != null && order != null;
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
        var grid = new DataGridView
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
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(39, 70, 105);
        grid.DefaultCellStyle.SelectionForeColor = LuxuryPalette.Text;
        grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(30, 44, 65);
        grid.AlternatingRowsDefaultCellStyle.ForeColor = LuxuryPalette.Text;
        grid.DefaultCellStyle.Font = new Font("Segoe UI", 10);
        grid.DefaultCellStyle.Padding = new Padding(7, 3, 4, 3);
        grid.CellFormatting += (_, args) =>
        {
            if (args.RowIndex < 0 || args.ColumnIndex < 0) return;
            if (grid.Columns[args.ColumnIndex].DataPropertyName != "DisplayLocalStatus") return;
            var status = args.Value?.ToString() ?? "";
            args.CellStyle.ForeColor = status == "Ready Boosting"
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
