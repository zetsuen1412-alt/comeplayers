using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>Neutral surfaces, strong typography and quiet depth for daily operations.</summary>
internal static class LuxuryPalette
{
    public static readonly Color Background = Color.FromArgb(237, 237, 237);
    public static readonly Color Sidebar = Color.FromArgb(247, 247, 247);
    public static readonly Color Surface = Color.White;
    public static readonly Color SurfaceRaised = Color.FromArgb(243, 243, 243);
    public static readonly Color Border = Color.FromArgb(215, 215, 215);
    public static readonly Color Accent = Color.FromArgb(30, 30, 30);
    public static readonly Color AccentHover = Color.FromArgb(65, 65, 65);
    public static readonly Color Violet = Accent;
    public static readonly Color Gold = Accent; // Compatibility aliases for older views
    public static readonly Color GoldBright = AccentHover;
    public static readonly Color Text = Color.FromArgb(28, 28, 28);
    public static readonly Color Muted = Color.FromArgb(96, 96, 96);
    public static readonly Color Success = Text;
    public static readonly Color Selection = Color.FromArgb(223, 223, 223);

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
        if (Width < 12 || Height < 12) return;
        var bounds = new Rectangle(1, 1, Width - 8, Height - 9);
        for (int depth = 6; depth >= 1; depth--) {
            using var shadow = LuxuryPalette.Round(new Rectangle(bounds.X + depth / 2, bounds.Y + depth, bounds.Width, bounds.Height), Radius);
            using var shade = new SolidBrush(Color.FromArgb(3, 0, 0, 0));
            e.Graphics.FillPath(shade, shadow);
        }
        using var path = LuxuryPalette.Round(bounds, Radius);
        using var gradient = new LinearGradientBrush(bounds,
            Color.White, BackColor, LinearGradientMode.ForwardDiagonal);
        e.Graphics.FillPath(gradient, path);
        using var border = new Pen(LuxuryPalette.Border, 1.0f);
        e.Graphics.DrawPath(border, path);
        using var highlight = new Pen(Color.FromArgb(180, Color.White));
        e.Graphics.DrawLine(highlight, bounds.Left + Radius, bounds.Top + 1, bounds.Right - Radius, bounds.Top + 1);
    }
}

internal sealed class LuxuryButton : Button
{
    private bool _hover;
    private float _glow;
    private readonly System.Windows.Forms.Timer _motion = new() { Interval = 16 };
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
        _motion.Tick += (_, _) => {
            float target = _hover && Enabled ? 1 : 0;
            _glow += (target - _glow) * .24f;
            if (Math.Abs(target - _glow) < .02f) { _glow = target; _motion.Stop(); }
            Invalidate();
        };
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; _motion.Start(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; _motion.Start(); base.OnMouseLeave(e); }
    protected override void Dispose(bool disposing) { if (disposing) _motion.Dispose(); base.Dispose(disposing); }
    protected override void OnBackColorChanged(EventArgs e) { base.OnBackColorChanged(e); Invalidate(); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent?.BackColor ?? LuxuryPalette.Background);
        if (Width < 24 || Height < 12) return;
        var bounds = new Rectangle(1, 1, Width - 4, Height - 6);
        using (var shadow = LuxuryPalette.Round(new Rectangle(2, 4, Width - 4, Height - 5), 13))
        using (var brush = new SolidBrush(Color.FromArgb(12, 0, 0, 0))) e.Graphics.FillPath(brush, shadow);
        using var path = LuxuryPalette.Round(bounds, Navigation ? 11 : 13);
        bool active = Navigation && BackColor != LuxuryPalette.Sidebar;
        var fill = !Enabled ? Color.FromArgb(232, 232, 232)
            : Primary ? LuxuryPalette.Accent
            : active ? LuxuryPalette.Selection
            : Navigation ? LuxuryPalette.Sidebar : BackColor;
        if (Enabled && !Primary) fill = Color.FromArgb(Math.Max(0, fill.R - (int)(_glow * 12)),
            Math.Max(0, fill.G - (int)(_glow * 12)), Math.Max(0, fill.B - (int)(_glow * 12)));
        if (Primary && Enabled)
        {
            using var grad = new LinearGradientBrush(bounds,
                _hover ? LuxuryPalette.AccentHover : Color.FromArgb(50, 50, 50),
                LuxuryPalette.Accent,
                LinearGradientMode.ForwardDiagonal);
            e.Graphics.FillPath(grad, path);
        }
        else
        {
            using var brush = new SolidBrush(fill);
            e.Graphics.FillPath(brush, path);
        }
        var stroke = Primary ? LuxuryPalette.Accent : LuxuryPalette.Border;
        using var border = new Pen(stroke, 1.0f);
        e.Graphics.DrawPath(border, path);
        using (var bevel = new Pen(Color.FromArgb(50, Color.White)))
            e.Graphics.DrawLine(bevel, bounds.Left + 12, bounds.Top + 1, bounds.Right - 12, bounds.Top + 1);
        if (active) {
            using var rail = new SolidBrush(LuxuryPalette.Accent);
            e.Graphics.FillRectangle(rail, 5, bounds.Top + 12, 3, Math.Max(1, bounds.Height - 24));
        }
        var textRect = Navigation
            ? new Rectangle(15, 0, Width - 20, Height) : bounds;
        TextRenderer.DrawText(e.Graphics, Text, Font, textRect,
            !Enabled ? LuxuryPalette.Muted
                : Primary ? Color.White
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
