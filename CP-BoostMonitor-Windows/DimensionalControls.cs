using System.Drawing.Drawing2D;

namespace CPBoostMonitor;

internal sealed class LuxuryGrid : DataGridView
{
    private readonly SlimGridScroll _scroll;
    public LuxuryGrid()
    {
        DoubleBuffered = true; Dock = DockStyle.Fill; ReadOnly = true; MultiSelect = false;
        AutoGenerateColumns = false; AllowUserToAddRows = false; AllowUserToDeleteRows = false;
        AllowUserToResizeRows = false; RowHeadersVisible = false; BorderStyle = BorderStyle.None;
        EnableHeadersVisualStyles = false; SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        BackgroundColor = LuxuryPalette.Surface; GridColor = LuxuryPalette.Border;
        CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None;
        ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
        ColumnHeadersHeight = 42; RowTemplate.Height = 54;
        DefaultCellStyle = new DataGridViewCellStyle { BackColor = LuxuryPalette.Surface, ForeColor = LuxuryPalette.Text,
            SelectionBackColor = LuxuryPalette.Selection, SelectionForeColor = LuxuryPalette.Text,
            Padding = new Padding(12, 5, 8, 5), Font = new Font("Segoe UI", 10) };
        AlternatingRowsDefaultCellStyle.BackColor = LuxuryPalette.SurfaceRaised;
        ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle { BackColor = LuxuryPalette.SurfaceRaised,
            ForeColor = LuxuryPalette.Muted, Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), Padding = new Padding(12, 0, 5, 0),
            SelectionBackColor = LuxuryPalette.SurfaceRaised, SelectionForeColor = LuxuryPalette.Text };
        ScrollBars = ScrollBars.None;
        _scroll = new SlimGridScroll(this); Controls.Add(_scroll);
        Scroll += (_, _) => UpdateScroll(); RowsAdded += (_, _) => UpdateScroll(); RowsRemoved += (_, _) => UpdateScroll();
        DataBindingComplete += (_, _) => UpdateScroll(); SizeChanged += (_, _) => UpdateScroll();
    }
    private void UpdateScroll()
    {
        if (_scroll is null || IsDisposed) return;
        _scroll.SetBounds(Math.Max(0, ClientSize.Width - 11), ColumnHeadersHeight + 4, 8, Math.Max(0, ClientSize.Height - ColumnHeadersHeight - 9));
        _scroll.Visible = RowCount > Math.Max(1, DisplayedRowCount(false)); _scroll.BringToFront(); _scroll.Invalidate();
    }
    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (RowCount == 0) return;
        MoveTo(Math.Max(0, FirstDisplayedScrollingRowIndex) - Math.Sign(e.Delta) * 3);
    }
    internal void MoveTo(int row)
    {
        if (RowCount == 0) return;
        int max = Math.Max(0, RowCount - Math.Max(1, DisplayedRowCount(false)));
        try { FirstDisplayedScrollingRowIndex = Math.Clamp(row, 0, max); } catch (InvalidOperationException) { }
        _scroll.Invalidate();
    }
}

internal sealed class SlimGridScroll : Control
{
    private readonly LuxuryGrid _grid;
    private bool _dragging;
    private int _grab;
    public SlimGridScroll(LuxuryGrid grid)
    {
        _grid = grid; DoubleBuffered = true; BackColor = LuxuryPalette.Surface; Cursor = Cursors.Hand;
        TabStop = true; AccessibleName = "Gulir daftar"; AccessibleRole = AccessibleRole.ScrollBar;
    }
    private Rectangle Thumb()
    {
        int visible = Math.Max(1, _grid.DisplayedRowCount(false)), rows = Math.Max(1, _grid.RowCount);
        int height = Math.Min(Height, Math.Max(26, Height * visible / rows));
        int top = Math.Max(0, _grid.FirstDisplayedScrollingRowIndex) * Math.Max(0, Height - height) / Math.Max(1, rows - visible);
        return new Rectangle(1, top, Math.Max(1, Width - 2), height);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(BackColor); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var thumb = Thumb(); if (thumb.Height < 2) return;
        using var path = LuxuryPalette.Round(thumb, 3);
        using var fill = new LinearGradientBrush(thumb, _dragging || Focused ? LuxuryPalette.Accent : LuxuryPalette.Muted,
            LuxuryPalette.Muted, 0f); e.Graphics.FillPath(fill, path);
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e); Focus(); var thumb = Thumb();
        _dragging = true; Capture = true; _grab = thumb.Contains(e.Location) ? e.Y - thumb.Top : thumb.Height / 2;
        Drag(e.Y);
    }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); if (_dragging) Drag(e.Y); }
    protected override void OnMouseUp(MouseEventArgs e) { _dragging = false; Capture = false; Invalidate(); base.OnMouseUp(e); }
    private void Drag(int y)
    {
        int visible = Math.Max(1, _grid.DisplayedRowCount(false)), range = Math.Max(0, _grid.RowCount - visible);
        double position = (double)(y - _grab) / Math.Max(1, Height - Thumb().Height);
        _grid.MoveTo((int)Math.Round(Math.Clamp(position, 0, 1) * range));
    }
    protected override bool IsInputKey(Keys keyData) => keyData is Keys.Up or Keys.Down or Keys.PageUp or Keys.PageDown or Keys.Home or Keys.End || base.IsInputKey(keyData);
    protected override void OnKeyDown(KeyEventArgs e)
    {
        int current = Math.Max(0, _grid.FirstDisplayedScrollingRowIndex), page = Math.Max(1, _grid.DisplayedRowCount(false));
        int next = e.KeyCode switch { Keys.Up => current - 1, Keys.Down => current + 1, Keys.PageUp => current - page,
            Keys.PageDown => current + page, Keys.Home => 0, Keys.End => _grid.RowCount, _ => current };
        _grid.MoveTo(next); base.OnKeyDown(e);
    }
}

internal sealed class MetricCard : Control
{
    private string _value = "—", _caption = "";
    public string Value { get => _value; set { _value = value; Invalidate(); } }
    public string Caption { get => _caption; set { _caption = value; Invalidate(); } }
    public Color Accent { get; init; } = LuxuryPalette.Accent;
    public MetricCard() { DoubleBuffered = true; Dock = DockStyle.Fill; Margin = new Padding(0, 0, 12, 0); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 30 || Height < 30) return;
        var r = new Rectangle(1, 1, Width - 9, Height - 10);
        for (int d = 7; d >= 1; d--) {
            using var shadow = LuxuryPalette.Round(new Rectangle(r.X + d / 2, r.Y + d, r.Width, r.Height), 20);
            using var shade = new SolidBrush(Color.FromArgb(3, 0, 0, 0)); g.FillPath(shade, shadow);
        }
        using var path = LuxuryPalette.Round(r, 20);
        using var fill = new LinearGradientBrush(r, Color.White, LuxuryPalette.SurfaceRaised, 55);
        g.FillPath(fill, path);
        using var stroke = new Pen(Color.FromArgb(70, Accent)); g.DrawPath(stroke, path);
        using var top = new Pen(Color.White); g.DrawLine(top, 22, 2, r.Right - 22, 2);
        using var small = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        using var number = new Font("Segoe UI", 25, FontStyle.Bold);
        TextRenderer.DrawText(g, Caption, small, new Rectangle(20, 14, r.Width - 40, 20), LuxuryPalette.Muted, TextFormatFlags.EndEllipsis);
        TextRenderer.DrawText(g, Value, number, new Rectangle(18, 37, r.Width - 70, 49), LuxuryPalette.Text, TextFormatFlags.EndEllipsis);
        var ring = new Rectangle(r.Right - 55, r.Bottom - 49, 31, 31);
        using var ringShade = new Pen(Color.FromArgb(35, Accent), 5); g.DrawEllipse(ringShade, ring);
        using var ringLight = new Pen(Accent, 3); g.DrawArc(ringLight, ring, -70, 240);
        using var highlight = new Pen(Color.White, 1); g.DrawArc(highlight, ring, 205, 60);
    }
}

internal sealed class BrandMark : Control
{
    public BrandMark() { DoubleBuffered = true; Size = new Size(216, 106); Margin = new Padding(0, 7, 0, 26); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(LuxuryPalette.Sidebar);
        var orb = new Rectangle(6, 8, 40, 40);
        using var fill = new SolidBrush(LuxuryPalette.Accent);
        g.FillEllipse(fill, orb);
        using var letter = new Font("Segoe UI", 16, FontStyle.Bold);
        TextRenderer.DrawText(g, "E", letter, orb, Color.White,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        using var brand = new Font("Segoe UI", 12, FontStyle.Bold);
        using var caption = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        TextRenderer.DrawText(g, "EVOGAMING", brand, new Point(56, 13), LuxuryPalette.SidebarText);
        TextRenderer.DrawText(g, "OPERATIONS / FH3", caption, new Point(57, 36), LuxuryPalette.SidebarMuted);
        using var line = new Pen(LuxuryPalette.SidebarBorder); g.DrawLine(line, 8, 78, Width - 12, 78);
        TextRenderer.DrawText(g, "WORKSPACE", caption, new Point(10, 90), LuxuryPalette.SidebarMuted);
    }
}
