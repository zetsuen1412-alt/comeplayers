namespace CPBoostMonitor;

/// <summary>The owner's original FH3 artwork, shared by the window, tray and notifications.</summary>
internal static class Fh3Branding
{
    private static readonly Lazy<Bitmap> Artwork = new(() => {
        using var stream = typeof(Fh3Branding).Assembly.GetManifestResourceStream("CPBoostMonitor.Assets.Fh3Logo.png")
            ?? throw new InvalidOperationException("Logo FH3 tidak tersedia.");
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    });
    private static readonly Lazy<Icon> AppIcon = new(() => {
        using var stream = typeof(Fh3Branding).Assembly.GetManifestResourceStream("CPBoostMonitor.Assets.Fh3.ico")
            ?? throw new InvalidOperationException("Ikon FH3 tidak tersedia.");
        using var icon = new Icon(stream, new Size(32, 32));
        return (Icon)icon.Clone();
    });
    internal static Bitmap Logo => Artwork.Value;
    internal static Icon Icon => AppIcon.Value;
    internal static void Draw(Graphics graphics, Rectangle bounds)
    {
        var previous = graphics.InterpolationMode;
        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        graphics.DrawImage(Logo, bounds);
        graphics.InterpolationMode = previous;
    }
}
