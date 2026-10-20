using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>EVOGAMING Dark Soft Blue — balanced contrast for long operational shifts.</summary>
internal static class LuxuryPalette
{
    // Soft navy: lower glare than silver/white, without using pitch black.
    public static readonly Color Background = Color.FromArgb(17, 24, 39);      // #111827
    public static readonly Color Sidebar = Color.FromArgb(15, 23, 42);         // #0F172A
    public static readonly Color Surface = Color.FromArgb(30, 41, 59);         // #1E293B
    public static readonly Color SurfaceRaised = Color.FromArgb(36, 50, 71);   // #243247
    public static readonly Color Border = Color.FromArgb(51, 65, 85);          // #334155
    public static readonly Color Accent = Color.FromArgb(96, 165, 250);        // #60A5FA
    public static readonly Color AccentHover = Color.FromArgb(132, 190, 255);
    public static readonly Color Gold = Accent; // Compatibility aliases for older views
    public static readonly Color GoldBright = AccentHover;
    public static readonly Color Text = Color.FromArgb(229, 238, 248);         // #E5EEF8
    public static readonly Color Muted = Color.FromArgb(148, 163, 184);        // #94A3B8
    public static readonly Color Success = Color.FromArgb(52, 211, 153);       // #34D399

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
                Color.FromArgb(39, 57, 81), Color.FromArgb(27, 40, 61));
            e.Graphics.FillPath(gradient, path);
        }
        else
        {
            using var brush = new SolidBrush(BackColor);
            e.Graphics.FillPath(brush, path);
        }
        using var border = new Pen(Hero ? Color.FromArgb(66, 96, 133) : LuxuryPalette.Border, 1.2f);
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
        using var path = LuxuryPalette.Round(bounds, Navigation ? 11 : 13);
        bool active = Navigation && BackColor != LuxuryPalette.Sidebar;
        var fill = !Enabled ? Color.FromArgb(42, 52, 66)
            : Primary ? LuxuryPalette.Accent
            : active ? Color.FromArgb(38, 60, 87)
            : Navigation ? LuxuryPalette.Sidebar : BackColor;
        if (_hover && Enabled && !Primary) fill = Color.FromArgb(45, 65, 92);
        if (Primary && Enabled)
        {
            using var grad = new LinearGradientBrush(bounds,
                _hover ? LuxuryPalette.AccentHover : Color.FromArgb(116, 179, 251),
                _hover ? LuxuryPalette.Accent : Color.FromArgb(74, 146, 231),
                LinearGradientMode.ForwardDiagonal);
            e.Graphics.FillPath(grad, path);
        }
        else
        {
            using var brush = new SolidBrush(fill);
            e.Graphics.FillPath(brush, path);
        }
        var stroke = Primary ? Color.FromArgb(118, 179, 250)
            : active ? Color.FromArgb(77, 132, 191) : LuxuryPalette.Border;
        using var border = new Pen(stroke, 1.0f);
        e.Graphics.DrawPath(border, path);
        var textRect = Navigation
            ? new Rectangle(15, 0, Width - 20, Height) : bounds;
        TextRenderer.DrawText(e.Graphics, Text, Font, textRect,
            !Enabled ? LuxuryPalette.Muted
                : Primary ? LuxuryPalette.Background
                : LuxuryPalette.Text,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            (Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter));
        if (Focused && ShowFocusCues)
        {
            using var focus = new Pen(LuxuryPalette.Accent);
            var inner = Rectangle.Inflate(bounds, -4, -4);
            using var path2 = LuxuryPalette.Round(inner, Navigation ? 9 : 11);
            e.Graphics.DrawPath(focus, path2);
        }
    }
}
