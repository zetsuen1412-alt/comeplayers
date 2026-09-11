$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pagePath = Join-Path $root "app\messages\page.tsx"

if (-not (Test-Path $pagePath)) {
  Write-Host "ERROR: app\messages\page.tsx tidak ditemukan." -ForegroundColor Red
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$pagePath.before-loading-v15-1-$timestamp.bak"
Copy-Item $pagePath $backupPath -Force
Write-Host "Backup dibuat: $backupPath" -ForegroundColor DarkGray

$content = Get-Content $pagePath -Raw

# Remove imports from every previous loader version so only V15.1 remains.
$content = $content -replace '(?m)^import MessagesLoadingOperatorV15 from "@/components/messages/MessagesLoadingOperatorV15";\r?\n', ''
$content = $content -replace '(?m)^import MessagesChatLoaderV16 from "@/components/messages/MessagesChatLoaderV16";\r?\n', ''
$content = $content -replace '(?m)^import MessagesChatLoaderV17 from "@/components/messages/MessagesChatLoaderV17";\r?\n', ''

$newImport = 'import MessagesLoadingOperatorV15 from "@/components/messages/MessagesLoadingOperatorV15";'
if ($content -notmatch [regex]::Escape($newImport)) {
  $content = $content -replace '"use client";\r?\n', "`"use client`";`r`n`r`n$newImport`r`n"
}

# Keep the loader visible until the real Messages data is ready and the page has painted.
if ($content -notmatch 'loaderStartedAtRef') {
  $stateMarker = '  const [loading, setLoading] = useState(true);'
  $stateBlock = @"
  const [loading, setLoading] = useState(true);
  const [loaderDataReady, setLoaderDataReady] = useState(false);
  const [loaderCanExit, setLoaderCanExit] = useState(false);
  const loaderStartedAtRef = useRef(Date.now());
"@

  if (-not $content.Contains($stateMarker)) {
    Write-Host "ERROR: State loading utama tidak ditemukan. File asli dikembalikan." -ForegroundColor Red
    Copy-Item $backupPath $pagePath -Force
    exit 1
  }

  $content = $content.Replace($stateMarker, $stateBlock.TrimEnd())
}

$gateEffect = @"
  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    let readyTimer: number | null = null;
    let exitTimer: number | null = null;

    async function finishMessagesBoot() {
      const minimumVisibleMs = 1100;
      const elapsed = Date.now() - loaderStartedAtRef.current;
      const remaining = Math.max(0, minimumVisibleMs - elapsed);

      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          readyTimer = window.setTimeout(resolve, remaining);
        });
      }

      try {
        await document.fonts?.ready;
      } catch {
        // Font readiness is optional.
      }

      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      );

      if (cancelled) return;
      setLoaderDataReady(true);

      exitTimer = window.setTimeout(() => {
        if (!cancelled) setLoaderCanExit(true);
      }, 650);
    }

    void finishMessagesBoot();

    return () => {
      cancelled = true;
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      if (exitTimer !== null) window.clearTimeout(exitTimer);
    };
  }, [loading]);

"@

if ($content -notmatch 'finishMessagesBoot') {
  $loaderIndex = $content.LastIndexOf('  if (loading')
  if ($loaderIndex -lt 0) {
    Write-Host "ERROR: Posisi loader Messages tidak ditemukan. File asli dikembalikan." -ForegroundColor Red
    Copy-Item $backupPath $pagePath -Force
    exit 1
  }
  $content = $content.Insert($loaderIndex, $gateEffect)
}

$newLoaderBlock = @"
  if (loading || !loaderCanExit) {
    return <MessagesLoadingOperatorV15 ready={loaderDataReady} />;
  }
"@

$patterns = @(
  '(?s)\s{2}if \(loading \|\| !loaderCanExit\) \{\s*return <MessagesChatLoaderV17[^;]*;\s*\}',
  '(?s)\s{2}if \(loading \|\| !loaderCanExit\) \{\s*return <MessagesLoadingOperatorV15[^;]*;\s*\}',
  '(?s)\s{2}if \(loading\) \{\s*return <MessagesChatLoaderV16\s*/>;\s*\}',
  '(?s)\s{2}if \(loading\) \{\s*return <MessagesLoadingOperatorV15(?:\s+ready=\{[^}]+\})?\s*/>;\s*\}',
  '(?s)\s{2}if \(loading\) \{\s*return \(\s*<main[^>]*>.*?Loading ComePlayers servers\.\.\..*?</main>\s*\);\s*\}'
)

$replaced = $false
foreach ($pattern in $patterns) {
  if ([regex]::IsMatch($content, $pattern)) {
    $content = [regex]::Replace($content, $pattern, "`r`n$newLoaderBlock", 1)
    $replaced = $true
    break
  }
}

if (-not $replaced -and $content -match 'return <MessagesLoadingOperatorV15 ready=\{loaderDataReady\}') {
  $replaced = $true
}

if (-not $replaced) {
  Write-Host "ERROR: Blok loader lama tidak dapat diganti. File asli dikembalikan." -ForegroundColor Red
  Copy-Item $backupPath $pagePath -Force
  exit 1
}

Set-Content -Path $pagePath -Value $content -Encoding UTF8

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Cache .next dihapus." -ForegroundColor DarkGray
}

Write-Host "MESSAGES LOADING OPERATOR V15.1 BERHASIL DIPASANG." -ForegroundColor Green
Write-Host "Kompatibel dengan halaman asli, V15, V16, maupun V17." -ForegroundColor Cyan
Write-Host "Loader bertahan sampai data siap lalu mencapai 100 persen sebelum Messages tampil." -ForegroundColor Cyan
