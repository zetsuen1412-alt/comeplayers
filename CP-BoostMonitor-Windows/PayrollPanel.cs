using System.Globalization;

namespace CPBoostMonitor;

/// <summary>Read-only team payroll and paged work history. Never persists salary data locally.</summary>
internal sealed class PayrollPanel : UserControl
{
    private readonly PayrollApi _api;
    private readonly DataGridView _employees = Grid(), _work = Grid();
    private readonly TextBox _search = new() { Width = 260, PlaceholderText = "Cari nama atau kode karyawan..." };
    private readonly Label _notice = new() { Dock = DockStyle.Fill, ForeColor = LuxuryPalette.Muted, AutoEllipsis = true };
    private readonly Label _status = new() { AutoSize = true, ForeColor = LuxuryPalette.Text, Padding = new Padding(8) };
    private readonly Button _refresh = new LuxuryButton { Text = "Perbarui Penghasilan", AutoSize = true };
    private readonly Button _previous = new LuxuryButton { Text = "← Sebelumnya", AutoSize = true, Enabled = false };
    private readonly Button _next = new LuxuryButton { Text = "Berikutnya →", AutoSize = true, Enabled = false };
    private List<EmployeeEarnings> _rows = new();
    private string _code = "";
    private int _offset, _version;
    private int? _nextOffset;
    private bool _loading;

    public PayrollPanel(PayrollApi api)
    {
        _api = api; Dock = DockStyle.Fill; BackColor = LuxuryPalette.Background;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(15) };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 55));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 45));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        Controls.Add(layout);
        var tools = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        tools.Controls.Add(_refresh); tools.Controls.Add(_search);
        var website = new LuxuryButton { Text = "Buka Payroll Website", AutoSize = true };
        website.Click += (_, _) => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
            "https://www.comeplayers.com/admin/payroll/orders") { UseShellExecute = true });
        tools.Controls.Add(website);
        layout.Controls.Add(tools, 0, 0); layout.Controls.Add(_notice, 0, 1);
        layout.Controls.Add(_employees, 0, 2); layout.Controls.Add(_work, 0, 3);
        var pager = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        pager.Controls.Add(_previous); pager.Controls.Add(_next); pager.Controls.Add(_status); layout.Controls.Add(pager, 0, 4);
        Column(_employees, "NAMA", "EmployeeName", 160); Column(_employees, "KODE", "EmployeeCode", 100);
        Column(_employees, "BAGI HASIL %", "SharePercent", 90);
        Column(_employees, "PENDAPATAN", "EarningMinor", 140, money: true);
        Column(_employees, "BONUS/TIPS", "BonusTipsMinor", 120, money: true);
        Column(_employees, "OPERASIONAL", "OperationalMinor", 120, money: true);
        Column(_employees, "DENDA", "PenaltyMinor", 110, money: true);
        Column(_employees, "POTONGAN KASBON", "KasbonMinor", 145, money: true);
        Column(_employees, "BERSIH BELUM CLOSING", "NetMinor", 180, money: true);
        Column(_employees, "DIBUKUKAN CLOSING", "ClosedNetMinor", 180, money: true);
        Column(_employees, "AKTIF", "ActiveOrderCount", 75);
        Column(_employees, "MENUNGGU VERIFIKASI", "AwaitingVerificationCount", 160);
        Column(_employees, "BELUM DINILAI", "UnvaluedOrderCount", 130);
        Column(_work, "ORDER", "OrderRef", 120); Column(_work, "GAME", "Game", 160);
        Column(_work, "STATUS", "Status", 150); Column(_work, "WAKTU", "Date", 200);
        Column(_work, "PEKERJAAN", "Schedule", 100); Column(_work, "ARSIP", "Archived", 80);
        Column(_work, "CLOSING", "Closed", 85);
        _refresh.Click += async (_, _) => await RefreshAsync();
        _search.TextChanged += (_, _) => BindEmployees();
        _employees.CellClick += async (_, e) => {
            if (_loading || e.RowIndex < 0 || _employees.Rows[e.RowIndex].DataBoundItem is not EmployeeEarnings row) return;
            _code = row.EmployeeCode; _offset = 0; await RefreshAsync();
        };
        _previous.Click += async (_, _) => { _offset = Math.Max(0, _offset - 100); await RefreshAsync(); };
        _next.Click += async (_, _) => { if (_nextOffset is int next) { _offset = next; await RefreshAsync(); } };
        _notice.Text = "Pilih karyawan untuk melihat riwayat kerja dari website. DONE masih menunggu verifikasi admin.";
    }

    public async Task RefreshAsync()
    {
        if (_loading || !_api.LoggedIn || IsDisposed) return;
        var version = _version; _loading = true; _refresh.Enabled = false; _employees.Enabled = false;
        _previous.Enabled = false; _next.Enabled = false; _status.Text = "Memuat dari Website Gaji...";
        try {
            var snapshot = await _api.EarningsAsync(_code, _offset);
            if (version != _version || !_api.LoggedIn || IsDisposed) return;
            _rows = snapshot.Employees; BindEmployees(); _work.DataSource = snapshot.Work;
            _notice.Text = snapshot.Notice; _nextOffset = snapshot.NextOffset;
            _previous.Enabled = _offset > 0; _next.Enabled = _nextOffset.HasValue;
            _status.Text = _code.Length == 0 ? $"{_rows.Count} karyawan FH3 • pilih nama • revisi {snapshot.Revision}"
                : $"{_code} • {_offset + (snapshot.WorkTotal > 0 ? 1 : 0)}–{Math.Min(_offset + 100, snapshot.WorkTotal)} dari {snapshot.WorkTotal} pekerjaan";
        }
        catch (Exception error) {
            if (version != _version || IsDisposed) return;
            _employees.DataSource = null; _work.DataSource = null; _rows.Clear();
            _status.Text = "Belum dapat diperbarui: " + error.Message;
        }
        finally { if (version == _version && !IsDisposed) { _loading = false; _refresh.Enabled = true; _employees.Enabled = true; } }
    }

    public void Clear()
    {
        _version++; _loading = false; _code = ""; _offset = 0; _nextOffset = null; _rows.Clear();
        _employees.DataSource = null; _work.DataSource = null; _status.Text = "Login Payroll untuk melihat penghasilan.";
    }
    private void BindEmployees() => _employees.DataSource = _rows.Where(row =>
        OrderFilters.ContainsAny(_search.Text, row.EmployeeName, row.EmployeeCode)).ToList();
    private static DataGridView Grid() => new() {
        Dock = DockStyle.Fill, ReadOnly = true, AutoGenerateColumns = false, AllowUserToAddRows = false,
        AllowUserToDeleteRows = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false,
        BackgroundColor = LuxuryPalette.Surface, ForeColor = LuxuryPalette.Text, BorderStyle = BorderStyle.None,
        DefaultCellStyle = new DataGridViewCellStyle { BackColor = LuxuryPalette.Surface, ForeColor = LuxuryPalette.Text,
            SelectionBackColor = LuxuryPalette.SurfaceRaised, SelectionForeColor = LuxuryPalette.Text },
    };
    private static void Column(DataGridView grid, string label, string property, int width, bool money = false)
    {
        var col = new DataGridViewTextBoxColumn { HeaderText = label, DataPropertyName = property, Width = width, SortMode = DataGridViewColumnSortMode.NotSortable };
        if (money) { col.DefaultCellStyle.Format = "Rp #,##0;Rp -#,##0"; col.DefaultCellStyle.FormatProvider = CultureInfo.GetCultureInfo("id-ID"); }
        grid.Columns.Add(col);
    }
}
