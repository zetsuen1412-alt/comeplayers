using CPBoostMonitor;

internal static class PearlBlueChecks
{
    private static IEnumerable<Control> All(Control parent)
    {
        foreach (Control child in parent.Controls) { yield return child; foreach (var nested in All(child)) yield return nested; }
    }
    private static double Contrast(Color first, Color second)
    {
        static double Channel(byte value) { double c = value / 255d; return c <= .04045 ? c / 12.92 : Math.Pow((c + .055) / 1.055, 2.4); }
        static double Luminance(Color color) => .2126 * Channel(color.R) + .7152 * Channel(color.G) + .0722 * Channel(color.B);
        double a = Luminance(first), b = Luminance(second); return (Math.Max(a, b) + .05) / (Math.Min(a, b) + .05);
    }
    internal static void Run()
    {
        static void Check(bool value, string message) { if (!value) throw new Exception(message); Console.WriteLine("PASS: " + message); }
        using var form = new MainForm(preview:true) {ClientSize=new Size(1120,740),ShowInTaskbar=false,Opacity=0};
        form.Show(); form.LoadPreview(new CompletedSnapshot(), new(), new(), "Pengaturan"); form.PerformLayout();
        var active = All(form).OfType<LuxuryButton>().Single(b => b.Navigation && b.Text == "Pengaturan");
        var inactive = All(form).OfType<LuxuryButton>().Single(b => b.Navigation && b.Text.StartsWith("Take Order"));
        using var selected = new Bitmap(active.Width, active.Height); active.DrawToBitmap(selected, new Rectangle(Point.Empty, active.Size));
        using var unselected = new Bitmap(inactive.Width, inactive.Height); inactive.DrawToBitmap(unselected, new Rectangle(Point.Empty, inactive.Size));
        var selectedFill = selected.GetPixel(active.Width - 20, active.Height / 2);
        var unselectedFill = unselected.GetPixel(inactive.Width - 20, inactive.Height / 2);
        Check(unselectedFill.ToArgb() == Color.White.ToArgb() && selectedFill.ToArgb() != unselectedFill.ToArgb(),
            "Pearl Blue white sidebar retains a visibly distinct selected menu");
        Check(Contrast(selectedFill, active.ForeColor) >= 4.5 && Contrast(unselectedFill, inactive.ForeColor) >= 4.5,
            "rendered selected and unselected navigation text exceed 4.5 to 1 contrast");
        Check(form.Controls.Find("CurrentTheme", true).Single().Text.Contains("Pearl Blue"), "Settings identifies the applied Pearl Blue theme");
    }
}
