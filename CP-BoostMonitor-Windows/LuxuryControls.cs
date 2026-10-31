using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace CPBoostMonitor;

/// <summary>Pearl Blue: white navigation and surfaces with clear blue actions.</summary>
internal static class LuxuryPalette
{
    public const string ThemeName = "Pearl Blue";
    public static readonly Color Background = Color.FromArgb(241, 245, 250);
    public static readonly Color Sidebar = Color.White;
    public static readonly Color SidebarText = Color.FromArgb(52, 68, 92);
    public static readonly Color SidebarMuted = Color.FromArgb(94, 112, 133);
    public static readonly Color SidebarBorder = Color.FromArgb(220, 228, 238);
    public static readonly Color Surface = Color.White;
    public static readonly Color SurfaceRaised = Color.FromArgb(246, 248, 252);
    public static readonly Color Border = Color.FromArgb(220, 228, 238);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);
    public static readonly Color Violet = Accent;
    public static readonly Color Gold = Accent; // Compatibility aliases for older views
    public static readonly Color GoldBright = AccentHover;
    public static readonly Color Text = Color.FromArgb(26, 43, 67);
    public static readonly Color Muted = Color.FromArgb(94, 112, 133);
    public static readonly Color Success = Color.FromArgb(21, 123, 87);
    public static readonly Color Selection = Color.FromArgb(233, 240, 255);

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
    public int Radius { get; init; } = 17;
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
        using (var shadow = LuxuryPalette.Round(new Rectangle(bounds.X, bounds.Y + 2, bounds.Width, bounds.Height), Radius))
        using (var shade = new SolidBrush(Color.FromArgb(8, LuxuryPalette.Text))) e.Graphics.FillPath(shade, shadow);
        using var path = LuxuryPalette.Round(bounds, Radius);
        using var fill = new SolidBrush(BackColor);
        e.Graphics.FillPath(fill, path);
        using var border = new Pen(LuxuryPalette.Border, 1.0f);
        e.Graphics.DrawPath(border, path);
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
        using var path = LuxuryPalette.Round(bounds, Navigation ? 11 : 13);
        bool active = Navigation && BackColor != LuxuryPalette.Sidebar;
        var fill = !Enabled ? LuxuryPalette.SurfaceRaised
            : Primary || active ? _hover ? LuxuryPalette.AccentHover : LuxuryPalette.Accent
            : Navigation ? LuxuryPalette.Sidebar : BackColor;
        if (Enabled && !Primary && !active && _glow > 0)
            fill = Color.FromArgb((int)(fill.R + (LuxuryPalette.Selection.R - fill.R) * _glow),
                (int)(fill.G + (LuxuryPalette.Selection.G - fill.G) * _glow), (int)(fill.B + (LuxuryPalette.Selection.B - fill.B) * _glow));
        using (var brush = new SolidBrush(fill)) e.Graphics.FillPath(brush, path);
        var stroke = !Enabled ? LuxuryPalette.Border : Primary || active ? fill
            : Navigation ? fill : LuxuryPalette.Border;
        using var border = new Pen(stroke, 1.0f);
        e.Graphics.DrawPath(border, path);
        if (active) {
            using var rail = new SolidBrush(Color.White);
            e.Graphics.FillRectangle(rail, 5, bounds.Top + 12, 3, Math.Max(1, bounds.Height - 24));
        }
        var textRect = Navigation
            ? new Rectangle(15, 0, Width - 20, Height) : bounds;
        TextRenderer.DrawText(e.Graphics, Text, Font, textRect,
            !Enabled ? LuxuryPalette.Muted
                : Primary || active ? Color.White
                : Navigation ? LuxuryPalette.SidebarText
                : LuxuryPalette.Text,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            (Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter));
        if (Focused && ShowFocusCues)
        {
            using var focus = new Pen(Primary || active ? Color.White : LuxuryPalette.Accent);
            var inner = Rectangle.Inflate(bounds, -4, -4);
            using var path2 = LuxuryPalette.Round(inner, Navigation ? 9 : 11);
            e.Graphics.DrawPath(focus, path2);
        }
    }
}

