using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>Executive Dark Luxury visual identity, shared in spirit with the Android palette.</summary>
internal static class LuxuryPalette
{
    public static readonly Color Background = Color.FromArgb(11, 16, 26);
    public static readonly Color Sidebar = Color.FromArgb(17, 26, 42);
    public static readonly Color Surface = Color.FromArgb(25, 36, 55);
    public static readonly Color SurfaceRaised = Color.FromArgb(33, 47, 69);
    public static readonly Color Border = Color.FromArgb(52, 68, 92);
    public static readonly Color Gold = Color.FromArgb(212, 175, 55);
    public static readonly Color GoldBright = Color.FromArgb(241, 213, 114);
    public static readonly Color Text = Color.FromArgb(248, 250, 252);
    public static readonly Color Muted = Color.FromArgb(170, 185, 205);
    public static readonly Color Success = Color.FromArgb(110, 231, 183);

    public static GraphicsPath Round(Rectangle bounds, float radius)
    {
        var path = new GraphicsPath();
        float d = Math.Min(bounds.Width, Math.Min(bounds.Height, radius * 2));
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d - 1, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d - 1, bounds.Bottom - d - 1, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d - 1, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class LuxuryCard : Panel
{
    public bool Hero { get; init; }
    public int Radius { get; init; } = 20;
    public LuxuryCard()
    {
        DoubleBuffered = true;
        BackColor = LuxuryPalette.Surface;
        ForeColor = LuxuryPalette.Text;
        Padding = new Padding(16);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 4 || Height < 4) return;
        using var shape = LuxuryPalette.Round(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        if (Hero)
        {
            using var gradient = new LinearGradientBrush(
                new Point(0, 0), new Point(Width, Height),
                Color.FromArgb(43, 59, 81), Color.FromArgb(22, 33, 53));
            e.Graphics.FillPath(gradient, shape);
        }
        else
        {
            using var fill = new SolidBrush(BackColor);
            e.Graphics.FillPath(fill, shape);
        }
        using var line = new Pen(Hero ? Color.FromArgb(103, 88, 51) : LuxuryPalette.Border, 1f);
        e.Graphics.DrawPath(line, shape);
    }
}

internal sealed class LuxuryButton : Button
{
    private bool _hover;
    public bool Primary { get; init; }
    public bool Navigation { get; init; }

    public LuxuryButton()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        Cursor = Cursors.Hand;
        ForeColor = LuxuryPalette.Text;
        BackColor = LuxuryPalette.SurfaceRaised;
        Font = new Font("Segoe UI", 10f, FontStyle.Bold);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 4 || Height < 4) return;
        var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = LuxuryPalette.Round(bounds, Navigation ? 12 : 13);
        Color fill = Primary ? LuxuryPalette.Gold :
            BackColor == LuxuryPalette.Sidebar ? LuxuryPalette.Sidebar : BackColor;
        if (_hover && Enabled)
            fill = Primary ? LuxuryPalette.GoldBright : Color.FromArgb(49, 65, 89);
        if (!Enabled)
            fill = Color.FromArgb(41, 48, 60);
        using var brush = new SolidBrush(fill);
        e.Graphics.FillPath(brush, path);
        using var border = new Pen(Primary ? Color.FromArgb(242, 219, 131) :
            Navigation && BackColor == LuxuryPalette.Sidebar ? LuxuryPalette.Sidebar : LuxuryPalette.Border);
        e.Graphics.DrawPath(border, path);
        TextRenderer.DrawText(e.Graphics, Text, Font, bounds,
            !Enabled ? LuxuryPalette.Muted :
            Primary ? LuxuryPalette.Background : ForeColor,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            (Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter));
        if (Focused && ShowFocusCues)
        {
            var focus = Rectangle.Inflate(bounds, -4, -4);
            ControlPaint.DrawFocusRectangle(e.Graphics, focus, LuxuryPalette.Gold, fill);
        }
    }
}
