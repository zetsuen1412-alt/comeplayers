$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$repo=Split-Path -Parent $PSScriptRoot
$source=Join-Path $repo 'assets/monitor/fh3-logo.png'
$art=[Drawing.Image]::FromFile($source)
try {
    # Format/size conversion only; preserve the supplied artwork and white background.
    function PngBytes([int]$size) {
        $bitmap=[Drawing.Bitmap]::new($size,$size)
        $graphics=[Drawing.Graphics]::FromImage($bitmap)
        $stream=[IO.MemoryStream]::new()
        try {
            $graphics.Clear([Drawing.Color]::White)
            $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($art,[Drawing.Rectangle]::new(0,0,$size,$size))
            $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
            return ,$stream.ToArray()
        } finally { $stream.Dispose();$graphics.Dispose();$bitmap.Dispose() }
    }
    $sizes=@(16,24,32,48,64,128,256)
    $frames=@($sizes | ForEach-Object { ,(PngBytes $_) })
    $iconPath=Join-Path $repo 'CP-BoostMonitor-Windows/Assets/fh3.ico'
    $stream=[IO.File]::Create($iconPath);$writer=[IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count)
        $offset=6+16*$sizes.Count
        for($i=0;$i -lt $sizes.Count;$i++) {
            $dimension=if($sizes[$i] -eq 256){0}else{$sizes[$i]}
            $writer.Write([byte]$dimension);$writer.Write([byte]$dimension)
            $writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$i].Length);$writer.Write([uint32]$offset)
            $offset+=$frames[$i].Length
        }
        foreach($frame in $frames){$writer.Write([byte[]]$frame)}
    } finally {$writer.Dispose();$stream.Dispose()}
    $res=Join-Path $repo 'CP-BoostMonitor-Android/app/src/main/res'
    foreach($density in @(@('mdpi',48),@('hdpi',72),@('xhdpi',96),@('xxhdpi',144),@('xxxhdpi',192))) {
        $dir=Join-Path $res ('mipmap-'+$density[0]);[IO.Directory]::CreateDirectory($dir)|Out-Null
        [IO.File]::WriteAllBytes((Join-Path $dir 'ic_launcher.png'),(PngBytes $density[1]))
    }
    $dir=Join-Path $res 'drawable-nodpi';[IO.Directory]::CreateDirectory($dir)|Out-Null
    Copy-Item -LiteralPath $source -Destination (Join-Path $dir 'fh3_logo.png') -Force
} finally {$art.Dispose()}
