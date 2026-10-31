namespace CPBoostMonitor;

/// <summary>Edits a reviewed team snapshot. It never sends requests or changes the lead.</summary>
internal sealed class OrderTeamDialog : Form
{
    private sealed record Entry(Panel Panel, ComboBox Worker, NumericUpDown Share, bool Existing);
    private readonly List<Entry> _entries = new();
    private readonly FlowLayoutPanel _rows = new() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
    private readonly Label _total = new() { AutoSize = true, Font = new Font("Segoe UI", 10, FontStyle.Bold) };
    private readonly Button _add = new LuxuryButton { Name = "TeamAdd", Text = "+ Tambah karyawan", AutoSize = true, MinimumSize = new Size(170, 36) };
    private readonly Button _save = new LuxuryButton { Name = "TeamSave", Text = "Simpan pembagian", Primary = true, Width = 180, Height = 40 };
    private readonly List<Employee> _roster;
    private readonly string _leadCode;
    private readonly string[] _existingCodes;
    public List<OrderParticipant> Participants { get; private set; } = new();

    public OrderTeamDialog(string orderRef, IEnumerable<Employee> roster, string leadCode,
        IReadOnlyCollection<OrderParticipant> participants, bool initial)
    {
        _roster = roster.Where(e => e.Active && e.Team == "FH3").OrderBy(e => e.Name).ToList();
        _leadCode = leadCode;
        _existingCodes = initial ? Array.Empty<string>() : participants.Select(p => p.EmployeeCode).ToArray();
        Text = initial ? $"Tim & pembagian hasil • {orderRef}" : $"Tambah Karyawan / Bagi Hasil • {orderRef}";
        ClientSize = new Size(720, 480); MinimumSize = new Size(736, 519);
        StartPosition = FormStartPosition.CenterParent; BackColor = LuxuryPalette.Background;
        ForeColor = LuxuryPalette.Text; Font = new Font("Segoe UI", 10); MinimizeBox = false; MaximizeBox = false;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 4 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        var leadName = participants.FirstOrDefault(p => p.EmployeeCode.Equals(leadCode, StringComparison.OrdinalIgnoreCase))?.EmployeeName ?? leadCode;
        layout.Controls.Add(new Label { Dock = DockStyle.Fill, Text = $"Satu order dapat dikerjakan 1–4 karyawan. Total bagian harus 100%.\nPersentase membagi total hasil order, termasuk jika karyawan baru bergabung di tengah pekerjaan.\nPenanggung jawab laporan START / PAUSE / DONE tetap {leadName}.", AutoSize = false }, 0, 0);
        layout.Controls.Add(_rows, 0, 1);
        var tools = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(0, 6, 0, 0) };
        var equal = new LuxuryButton { Text = "Bagi rata", AutoSize = true, MinimumSize = new Size(112, 36) };
        tools.Controls.Add(_add); tools.Controls.Add(equal); _total.Margin = new Padding(18, 8, 0, 0); tools.Controls.Add(_total);
        layout.Controls.Add(tools, 0, 2);
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(0, 8, 0, 0) };
        var cancel = new LuxuryButton { Text = "Batal", Width = 100, Height = 40, DialogResult = DialogResult.Cancel };
        footer.Controls.Add(_save); footer.Controls.Add(cancel); layout.Controls.Add(footer, 0, 3);
        Controls.Add(layout); CancelButton = cancel; AcceptButton = _save;
        foreach (var participant in participants) AddRow(participant, !initial || participant.EmployeeCode.Equals(leadCode, StringComparison.OrdinalIgnoreCase));
        _add.Click += (_, _) => { if (_entries.Count < 4) AddRow(null, false); };
        equal.Click += (_, _) => {
            if (_entries.Count == 0) return;
            int baseShare = 10000 / _entries.Count, remainder = 10000 % _entries.Count;
            for (int i = 0; i < _entries.Count; i++) _entries[i].Share.Value = (baseShare + (i < remainder ? 1 : 0)) / 100m;
            UpdateTotal();
        };
        _save.Click += (_, _) => {
            try {
                var chosen = ReadParticipants();
                TeamAllocation.Validate(chosen, _leadCode, _existingCodes);
                Participants = chosen; DialogResult = DialogResult.OK;
            }
            catch (InvalidOperationException error) { MessageBox.Show(this, error.Message, "Pembagian hasil", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        };
        UpdateTotal();
    }

    private void AddRow(OrderParticipant? participant, bool existing)
    {
        var row = new Panel { Width = 644, Height = 52, Margin = new Padding(0, 3, 0, 3) };
        var worker = new ComboBox { Name = "TeamWorker", Left = 0, Top = 8, Width = 310, DropDownStyle = ComboBoxStyle.DropDownList,
            DisplayMember = "Name", BindingContext = new BindingContext(), Enabled = !existing };
        var choices = _roster.ToList();
        if (participant is not null && !choices.Any(e => e.Code.Equals(participant.EmployeeCode, StringComparison.OrdinalIgnoreCase)))
            choices.Add(new Employee { Code = participant.EmployeeCode, Name = participant.EmployeeName, Id = participant.EmployeeId });
        worker.DataSource = choices;
        worker.SelectedItem = participant is null ? null : choices.FirstOrDefault(e => e.Code.Equals(participant.EmployeeCode, StringComparison.OrdinalIgnoreCase));
        var share = new NumericUpDown { Left = 326, Top = 8, Width = 100, DecimalPlaces = 2, Increment = .01m, Maximum = 100, Value = participant?.ShareBps / 100m ?? 0 };
        row.Controls.Add(worker); row.Controls.Add(share);
        row.Controls.Add(new Label { Text = "%", Left = 432, Top = 12, Width = 25 });
        if (existing) row.Controls.Add(new Label { Text = participant?.EmployeeCode.Equals(_leadCode, StringComparison.OrdinalIgnoreCase) == true ? "Penanggung jawab" : "Sudah bergabung", Left = 464, Top = 12, Width = 175, ForeColor = LuxuryPalette.Muted });
        var entry = new Entry(row, worker, share, existing); _entries.Add(entry); _rows.Controls.Add(row);
        if (!existing) {
            var remove = new LuxuryButton { Text = "Hapus", Left = 476, Top = 4, Width = 100, Height = 38 };
            remove.Click += (_, _) => { _entries.Remove(entry); _rows.Controls.Remove(row); row.Dispose(); UpdateTotal(); };
            row.Controls.Add(remove);
        }
        share.ValueChanged += (_, _) => UpdateTotal(); worker.SelectedIndexChanged += (_, _) => UpdateTotal();
        UpdateTotal();
    }

    private List<OrderParticipant> ReadParticipants() => _entries.Select(e => new OrderParticipant {
        EmployeeCode = (e.Worker.SelectedItem as Employee)?.Code ?? "",
        EmployeeId = (e.Worker.SelectedItem as Employee)?.Id ?? "",
        EmployeeName = (e.Worker.SelectedItem as Employee)?.Name ?? "",
        ShareBps = decimal.ToInt32(e.Share.Value * 100),
    }).ToList();

    private void UpdateTotal()
    {
        var total = _entries.Sum(e => decimal.ToInt32(e.Share.Value * 100));
        _total.Text = "Total " + TeamAllocation.Percent(total);
        _total.ForeColor = total == 10000 ? LuxuryPalette.Success : LuxuryPalette.Muted;
        _add.Enabled = _entries.Count < 4;
        try { TeamAllocation.Validate(ReadParticipants(), _leadCode, _existingCodes); _save.Enabled = true; }
        catch (InvalidOperationException) { _save.Enabled = false; }
    }
}
