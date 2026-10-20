using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>EVOGAMING Future Silver — accessible light surfaces and ice-blue accents.</summary>
internal static class LuxuryPalette
{
    public static readonly Color Background = Color.FromArgb(238, 244, 250);     // #EEF4FA
    public static readonly Color Sidebar = Color.FromArgb(220, 231, 243);        // #DCE7F3
    public static readonly Color Surface = Color.FromArgb(248, 251, 255);        // #F8FBFF
    public static readonly Color SurfaceRaised = Color.FromArgb(234, 242, 249);  // #EAF2F9
    public static readonly Color Border = Color.FromArgb(188, 208, 224);         // #BCD0E0
    public static readonly Color Gold = Color.FromArgb(110, 197, 255);           // Legacy alias: ice-blue #6EC5FF
    public static readonly Color GoldBright = Color.FromArgb(143, 211, 255);     // Legacy alias: soft-blue #8FD3FF
    public static readonly Color Text = Color.FromArgb(24, 50, 74);              // #18324A
    public static readonly Color Muted = Color.FromArgb(96, 124, 150);           // #607C96
    public static readonly Color Success = Color.FromArgb(27, 136, 109);         // Accessible on light background

    public static GraphicsPath Round(Rectangle bounds, float radius)
    {
        var path = new GraphicsPath();
        float d = Math.Min(bounds.Width, Math.Min(bounds.Height, radius * 2));
        if (d < 2) { path.AddRectangle(bounds); return path; }
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
    public int Radius { get; init; } = 21;
    public LuxuryCard()
    {
        DoubleBuffered = true;
        BackColor = LuxuryPalette.Surface;
        ForeColor = LuxuryPalette.Text;
        Padding = new Padding(17);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 4 || Height < 4) return;
        using var path = LuxuryPalette.Round(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        if (Hero)
        {
            using var gradient = new LinearGradientBrush(new Point(0, 0), new Point(Width, Height),
                Color.FromArgb(249, 253, 255), Color.FromArgb(211, 232, 248));
            e.Graphics.FillPath(gradient, path);
        }
        else
        {
            using var brush = new SolidBrush(BackColor);
            e.Graphics.FillPath(brush, path);
        }
        using var border = new Pen(Hero ? Color.FromArgb(135, 189, 222) : LuxuryPalette.Border, 1.2f);
        e.Graphics.DrawPath(border, path);
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
    protected override void OnBackColorChanged(EventArgs e) { base.OnBackColorChanged(e); Invalidate(); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 4 || Height < 4) return;
        var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = LuxuryPalette.Round(bounds, Navigation ? 13 : 14);
        var active = Navigation && BackColor != LuxuryPalette.Sidebar;
        Color fill = !Enabled ? Color.FromArgb(225, 234, 241)
            : Primary ? LuxuryPalette.GoldBright
            : active ? Color.FromArgb(241, 250, 255)
            : Navigation ? LuxuryPalette.Sidebar : LuxuryPalette.Surface;
        if (_hover && Enabled && !Primary)
            fill = Color.FromArgb(224, 243, 255);
        if (Primary && Enabled)
        {
            using var gradient = new LinearGradientBrush(bounds,
                _hover ? Color.FromArgb(225, 244, 255) : Color.FromArgb(220, 232, 241),
                _hover ? Color.FromArgb(123, 207, 255) : LuxuryPalette.GoldBright,
                LinearGradientMode.ForwardDiagonal);
            e.Graphics.FillPath(gradient, path);
        }
        else
        {
            using var brush = new SolidBrush(fill);
            e.Graphics.FillPath(brush, path);
        }
        var strokeColor = Primary || active ? Color.FromArgb(112, 186, 229) : LuxuryPalette.Border;
        using var border = new Pen(Navigation && !active && !_hover ? LuxuryPalette.Sidebar : strokeColor, 1.1f);
        e.Graphics.DrawPath(border, path);
        var textRect = Navigation ? new Rectangle(16, 0, Width - 23, Height) : bounds;
        TextRenderer.DrawText(e.Graphics, Text, Font, textRect,
            Enabled ? LuxuryPalette.Text : LuxuryPalette.Muted,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            (Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter));
        if (Focused && ShowFocusCues)
        {
            var focus = Rectangle.Inflate(bounds, -5, -5);
            ControlPaint.DrawFocusRectangle(e.Graphics, focus, LuxuryPalette.Text, fill);
        }
    }
}
