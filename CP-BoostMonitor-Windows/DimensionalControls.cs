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
        BackgroundColor = LuxuryPalette.Surface; GridColor = Color.FromArgb(31, 47, 65);
        CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None;
        ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
        ColumnHeadersHeight = 42; RowTemplate.Height = 54;
        DefaultCellStyle = new DataGridViewCellStyle { BackColor = LuxuryPalette.Surface, ForeColor = LuxuryPalette.Text,
            SelectionBackColor = Color.FromArgb(28, 65, 84), SelectionForeColor = Color.FromArgb(207, 252, 255),
            Padding = new Padding(12, 5, 8, 5), Font = new Font("Segoe UI", 10) };
        AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(21, 34, 52);
        ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle { BackColor = Color.FromArgb(15, 26, 42),
            ForeColor = LuxuryPalette.Muted, Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), Padding = new Padding(12, 0, 5, 0),
            SelectionBackColor = Color.FromArgb(15, 26, 42), SelectionForeColor = LuxuryPalette.Text };
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
        using var fill = new LinearGradientBrush(thumb, _dragging || Focused ? LuxuryPalette.Accent : Color.FromArgb(89, 127, 148),
            Color.FromArgb(48, 76, 96), 0f); e.Graphics.FillPath(fill, path);
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
            using var shade = new SolidBrush(Color.FromArgb(9, 0, 0, 0)); g.FillPath(shade, shadow);
        }
        using var path = LuxuryPalette.Round(r, 20);
        using var fill = new LinearGradientBrush(r, Color.FromArgb(34, 54, 76), Color.FromArgb(16, 28, 46), 55);
        g.FillPath(fill, path);
        using var stroke = new Pen(Color.FromArgb(70, Accent)); g.DrawPath(stroke, path);
        using var top = new Pen(Color.FromArgb(90, 218, 245, 255)); g.DrawLine(top, 22, 2, r.Right - 22, 2);
        using var small = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        using var number = new Font("Segoe UI", 25, FontStyle.Bold);
        TextRenderer.DrawText(g, Caption, small, new Rectangle(20, 14, r.Width - 40, 20), LuxuryPalette.Muted, TextFormatFlags.EndEllipsis);
        TextRenderer.DrawText(g, Value, number, new Rectangle(18, 37, r.Width - 70, 49), LuxuryPalette.Text, TextFormatFlags.EndEllipsis);
        var ring = new Rectangle(r.Right - 55, r.Bottom - 49, 31, 31);
        using var ringShade = new Pen(Color.FromArgb(35, Accent), 5); g.DrawEllipse(ringShade, ring);
        using var ringLight = new Pen(Accent, 3); g.DrawArc(ringLight, ring, -70, 240);
        using var highlight = new Pen(Color.FromArgb(160, 231, 255, 255), 1); g.DrawArc(highlight, ring, 205, 60);
    }
}

internal sealed class BrandMark : Control
{
    public BrandMark() { DoubleBuffered = true; Size = new Size(216, 106); Margin = new Padding(0, 7, 0, 26); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(LuxuryPalette.Sidebar);
        var orb = new Rectangle(6, 8, 40, 40);
        using var sphere = new GraphicsPath(); sphere.AddEllipse(orb);
        using var fill = new PathGradientBrush(sphere) { CenterPoint = new PointF(18, 17),
            CenterColor = Color.FromArgb(211, 255, 255), SurroundColors = new[] { Color.FromArgb(20, 85, 121) } };
        g.FillEllipse(fill, orb);
        using var ring = new Pen(LuxuryPalette.Violet, 2); g.DrawEllipse(ring, 3, 17, 46, 19);
        using var brand = new Font("Segoe UI", 12, FontStyle.Bold);
        using var caption = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        TextRenderer.DrawText(g, "EVOGAMING", brand, new Point(56, 13), LuxuryPalette.Text);
        TextRenderer.DrawText(g, "OPERATIONS / FH3", caption, new Point(57, 36), LuxuryPalette.Accent);
        using var line = new Pen(LuxuryPalette.Border); g.DrawLine(line, 8, 78, Width - 12, 78);
        TextRenderer.DrawText(g, "WORKSPACE", caption, new Point(10, 90), LuxuryPalette.Muted);
    }
}

internal sealed class DepthEmblem : Control
{
    public DepthEmblem() { DoubleBuffered = true; Dock = DockStyle.Right; Width = 155; AccessibleName = "Emblem FH3 tiga dimensi"; }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(LuxuryPalette.Background);
        PointF[] top = { new(77, 15), new(116, 35), new(77, 56), new(38, 35) };
        PointF[] left = { new(38, 35), new(77, 56), new(77, 94), new(38, 72) };
        PointF[] right = { new(77, 56), new(116, 35), new(116, 72), new(77, 94) };
        using var floor = new SolidBrush(Color.FromArgb(45, 62, 130, 171)); g.FillEllipse(floor, 31, 88, 94, 13);
        Fill(left, Color.FromArgb(29, 108, 137), Color.FromArgb(15, 40, 68));
        Fill(right, Color.FromArgb(90, 88, 161), Color.FromArgb(30, 29, 61));
        Fill(top, Color.FromArgb(159, 236, 243), Color.FromArgb(32, 115, 150));
        using var edge = new Pen(Color.FromArgb(110, 180, 239, 255));
        g.DrawLine(edge, 77, 56, 77, 93); g.DrawLine(edge, 38, 35, 77, 56); g.DrawLine(edge, 77, 56, 116, 35);
        using var orbit = new Pen(Color.FromArgb(65, LuxuryPalette.Violet));
        g.DrawEllipse(orbit, 19, 38, 116, 39);
        void Fill(PointF[] points, Color a, Color b) {
            using var path = new GraphicsPath(); path.AddPolygon(points);
            using var gradient = new LinearGradientBrush(new Rectangle(30, 10, 95, 90), a, b, 70);
            g.FillPath(gradient, path);
        }
    }
}
