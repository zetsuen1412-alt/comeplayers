namespace CPBoostMonitor;

/// <summary>Completed Telegram work only. No salary data is requested or displayed.</summary>
internal sealed class CompletedOrdersPanel : UserControl
{
    private readonly PayrollApi _api;
    private readonly LuxuryGrid _employees = new(), _work = new();
    private readonly MetricCard _total = new() { Caption = "ORDER SELESAI / TIM" };
    private readonly MetricCard _contributors = new() { Caption = "KARYAWAN / SELESAI", Accent = LuxuryPalette.Violet };
    private readonly MetricCard _selected = new() { Caption = "ORDER SELESAI / DIPILIH", Accent = LuxuryPalette.Success };
    private readonly TextBox _search = new() { BorderStyle = BorderStyle.None, Dock = DockStyle.Fill,
        BackColor = LuxuryPalette.Surface, ForeColor = LuxuryPalette.Text,
        PlaceholderText = "Cari nama karyawan", Font = new Font("Segoe UI", 10.5f) };
    private readonly Label _title = Label("Pilih karyawan", 18, true), _subtitle = Label("Daftar order dengan laporan DONE terkonfirmasi.", 9);
    private readonly Label _empty = Label("Belum ada order selesai.\nOrder akan muncul setelah laporan DONE diterima Telegram.", 11);
    private readonly Label _status = Label("Perbarui untuk memuat riwayat pekerjaan.", 9);
    private readonly Label _peopleCount = Label("KARYAWAN FH3", 9, true);
    private readonly Button _refresh = new LuxuryButton { Text = "↻  Perbarui", Width = 145, Height = 43, Primary = true, Dock = DockStyle.Right };
    private readonly Button _previous = new LuxuryButton { Text = "←", Width = 44, Height = 37, Enabled = false };
    private readonly Button _next = new LuxuryButton { Text = "→", Width = 44, Height = 37, Enabled = false };
    private readonly Button _openProof = new LuxuryButton { Text = "↗  Bukti Telegram", Width = 172, Height = 39, Enabled = false };
    private List<EmployeeCompletion> _rows = new();
    private string _code = "";
    private int _offset, _version;
    private int? _nextOffset;
    private bool _binding;

    public CompletedOrdersPanel(PayrollApi api)
    {
        _api = api; Dock = DockStyle.Fill; BackColor = LuxuryPalette.Background;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(22, 16, 14, 10) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 112)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 67));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        Controls.Add(root);
        var metrics = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, Margin = Padding.Empty };
        for (int i = 0; i < 3; i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / 3));
        metrics.Controls.Add(_total, 0, 0); metrics.Controls.Add(_contributors, 1, 0); metrics.Controls.Add(_selected, 2, 0);
        root.Controls.Add(metrics, 0, 0);
        var tools = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 11, 12, 10) };
        var searchFrame = new LuxuryCard { Dock = DockStyle.Left, Width = 355, Radius = 12, Padding = new Padding(15, 11, 16, 8) };
        searchFrame.Controls.Add(_search);
        searchFrame.Controls.Add(new Label { Text = "CARI", Dock = DockStyle.Left, Width = 48,
            ForeColor = LuxuryPalette.Accent, Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), TextAlign = ContentAlignment.MiddleLeft });
        tools.Controls.Add(searchFrame); tools.Controls.Add(_refresh);
        root.Controls.Add(tools, 0, 1);
        var content = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34)); content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 66));
        var people = new LuxuryCard { Dock = DockStyle.Fill, Padding = new Padding(14, 15, 20, 20), Margin = new Padding(0, 0, 9, 0) };
        var peopleBody = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, BackColor = LuxuryPalette.Surface };
        peopleBody.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        peopleBody.RowStyles.Add(new RowStyle(SizeType.Absolute, 32)); peopleBody.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        peopleBody.Controls.Add(_peopleCount, 0, 0); peopleBody.Controls.Add(_employees, 0, 1); people.Controls.Add(peopleBody);
        content.Controls.Add(people, 0, 0);
        var detail = new LuxuryCard { Dock = DockStyle.Fill, Padding = new Padding(19, 16, 24, 20), Margin = new Padding(2, 0, 0, 0) };
        var detailBody = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, BackColor = LuxuryPalette.Surface };
        detailBody.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        detailBody.RowStyles.Add(new RowStyle(SizeType.Absolute, 38)); detailBody.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        detailBody.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); detailBody.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        detailBody.Controls.Add(_title, 0, 0); detailBody.Controls.Add(_subtitle, 0, 1);
        var workArea = new Panel { Dock = DockStyle.Fill, BackColor = LuxuryPalette.Surface };
        _empty.Dock = DockStyle.Fill; _empty.TextAlign = ContentAlignment.MiddleCenter; _empty.ForeColor = LuxuryPalette.Muted;
        workArea.Controls.Add(_work); workArea.Controls.Add(_empty); detailBody.Controls.Add(workArea, 0, 2);
        var actions = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 0), BackColor = LuxuryPalette.Surface };
        _openProof.Dock = DockStyle.Left; actions.Controls.Add(_openProof);
        var pager = new FlowLayoutPanel { Dock = DockStyle.Right, Width = 100, WrapContents = false };
        pager.Controls.Add(_previous); pager.Controls.Add(_next); actions.Controls.Add(pager);
        detailBody.Controls.Add(actions, 0, 3); detail.Controls.Add(detailBody); content.Controls.Add(detail, 1, 0);
        root.Controls.Add(content, 0, 2); root.Controls.Add(_status, 0, 3);
        Column(_employees, "KARYAWAN", "EmployeeName", 72, 110); Column(_employees, "SELESAI", "CompletedCount", 28, 75);
        _employees.Columns[1].HeaderCell.Style.Padding = new Padding(2);
        _employees.Columns[1].HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleCenter;
        _employees.Columns[1].DefaultCellStyle.Padding = new Padding(2);
        Column(_work, "ORDER", "OrderRef", 20, 80); Column(_work, "GAME", "Game", 20, 80);
        Column(_work, "DISCORD", "DisplayDiscord", 25, 95);
        Column(_work, "BAGIAN", "ShareDisplay", 15, 70);
        Column(_work, "SELESAI PADA", "CompletedDisplay", 35, 145);
        _employees.RowTemplate.Height = 57; _work.RowTemplate.Height = 57;
        _employees.CellFormatting += (_, e) => {
            if (e.RowIndex >= 0 && e.ColumnIndex == 1) { e.CellStyle!.ForeColor = LuxuryPalette.Accent; e.CellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter; }
        };
        _work.CellToolTipTextNeeded += (_, e) => {
            if (e.RowIndex >= 0 && _work.Rows[e.RowIndex].DataBoundItem is CompletedOrder row)
                e.ToolTipText = $"Bagian {row.ShareDisplay}\n{TeamAllocation.Summary(row.Participants)}\nDiscord: {row.DisplayDiscord}\n{row.CompletedDisplay} • {row.Duration}\n{row.Task}";
        };
        _employees.SelectionChanged += async (_, _) => {
            if (_binding || _employees.CurrentRow?.DataBoundItem is not EmployeeCompletion row || row.EmployeeCode == _code) return;
            _code = row.EmployeeCode; _offset = 0; _title.Text = row.EmployeeName;
            _subtitle.Text = $"{row.CompletedCount:N0} order selesai";
            _selected.Value = row.CompletedCount.ToString("N0"); await RefreshAsync();
        };
        _work.SelectionChanged += (_, _) => _openProof.Enabled = _work.CurrentRow?.DataBoundItem is CompletedOrder { TelegramMessageUrl: not null };
        _work.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OpenProof(); };
        _openProof.Click += (_, _) => OpenProof();
        _search.TextChanged += (_, _) => BindEmployees();
        _refresh.Click += async (_, _) => await RefreshAsync();
        _previous.Click += async (_, _) => { _offset = Math.Max(0, _offset - 50); await RefreshAsync(); };
        _next.Click += async (_, _) => { if (_nextOffset is int next) { _offset = next; await RefreshAsync(); } };
    }

    public async Task RefreshAsync()
    {
        if (!_api.WorkspaceAvailable || IsDisposed) return;
        int version = ++_version; string code = _code; int offset = _offset;
        _refresh.Enabled = false; _previous.Enabled = false; _next.Enabled = false;
        _status.Text = "Memuat riwayat order selesai…";
        _work.DataSource = null; _openProof.Enabled = false; _empty.Text = "Memuat daftar order…"; _empty.Visible = true;
        try {
            var data = await _api.CompletedAsync(code, offset);
            if (version != _version || !_api.WorkspaceAvailable || IsDisposed) return;
            ApplySnapshot(data, offset);
            if (code.Length == 0 && _rows.Count > 0) { _code = _rows[0].EmployeeCode; _offset = 0; await RefreshAsync(); }
        }
        catch (Exception error) {
            if (version != _version || IsDisposed) return;
            _status.Text = "Belum diperbarui: " + error.Message;
            _empty.Text = "Daftar belum dapat dimuat.\nTekan Perbarui untuk mencoba lagi.";
        }
        finally { if (version == _version && !IsDisposed) _refresh.Enabled = true; }
    }

    internal void ApplySnapshot(CompletedSnapshot data, int offset = 0)
    {
        _rows = data.Employees; _code = data.SelectedEmployeeCode ?? ""; _offset = offset; _nextOffset = data.NextOffset;
        _total.Value = data.Totals.CompletedCount.ToString("N0"); _contributors.Value = data.Totals.Contributors.ToString("N0");
        var person = _rows.FirstOrDefault(row => row.EmployeeCode == _code);
        _selected.Value = person?.CompletedCount.ToString("N0") ?? "—";
        _title.Text = person?.EmployeeName ?? "Pilih karyawan";
        _subtitle.Text = person is null ? "Klik nama untuk membuka daftar order selesai." : $"{person.CompletedCount:N0} order selesai";
        BindEmployees(); _work.DataSource = data.Work; _empty.Visible = data.Work.Count == 0;
        _empty.Text = person is null ? "Pilih karyawan di sebelah kiri." : "Belum ada order selesai.\nOrder muncul setelah laporan DONE diterima Telegram.";
        _previous.Enabled = _offset > 0; _next.Enabled = _nextOffset.HasValue;
        _status.Text = person is null ? data.Notice : $"{_offset + (data.WorkTotal > 0 ? 1 : 0)}–{Math.Min(_offset + 50, data.WorkTotal)} dari {data.WorkTotal} order  •  Waktu lokal  •  DONE terkonfirmasi";
    }

    public void Clear()
    {
        _version++; _rows.Clear(); _code = ""; _offset = 0; _nextOffset = null;
        _employees.DataSource = null; _work.DataSource = null; _total.Value = "—"; _contributors.Value = "—"; _selected.Value = "—";
        _previous.Enabled = _next.Enabled = _openProof.Enabled = false; _refresh.Enabled = true;
        _title.Text = "Pilih karyawan"; _subtitle.Text = ""; _empty.Visible = true; _empty.Text = "Login untuk melihat order selesai.";
        _status.Text = "Riwayat pekerjaan hanya tersedia setelah login.";
    }
    private void BindEmployees()
    {
        _binding = true;
        try {
            var visible = _rows.Where(row => OrderFilters.ContainsAny(_search.Text, row.EmployeeName, row.EmployeeCode)).ToList();
            _employees.DataSource = visible; _employees.ClearSelection();
            foreach (DataGridViewRow row in _employees.Rows) if (row.DataBoundItem is EmployeeCompletion item && item.EmployeeCode == _code) {
                row.Selected = true; _employees.CurrentCell = row.Cells[0]; break;
            }
            _peopleCount.Text = $"KARYAWAN FH3  /  {visible.Count}";
        } finally { _binding = false; }
    }
    private void OpenProof()
    {
        if (_work.CurrentRow?.DataBoundItem is not CompletedOrder row || row.TelegramMessageUrl is null
            || !System.Text.RegularExpressions.Regex.IsMatch(row.TelegramMessageUrl, @"^https://t\.me/c/[0-9]+/[0-9]+$")) return;
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(row.TelegramMessageUrl) { UseShellExecute = true }); }
        catch { _status.Text = "Telegram belum dapat dibuka. Periksa aplikasi atau browser Anda."; }
    }
    private static Label Label(string text, float size, bool bold = false) => new() { Text = text, Dock = DockStyle.Fill,
        ForeColor = bold ? LuxuryPalette.Text : LuxuryPalette.Muted, TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), AutoEllipsis = true };
    private static void Column(DataGridView grid, string title, string property, int weight, int minimum) => grid.Columns.Add(
        new DataGridViewTextBoxColumn { HeaderText = title, DataPropertyName = property, FillWeight = weight, MinimumWidth = minimum,
            SortMode = DataGridViewColumnSortMode.NotSortable });
}

