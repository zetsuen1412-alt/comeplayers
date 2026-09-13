param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$AppsRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $AppsRoot
if (-not $OutputPath) {
  $Parent = Split-Path -Parent $ProjectRoot
  $OutputPath = Join-Path $Parent "ComePlayers-source.zip"
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ComePlayers-source-" + [Guid]::NewGuid().ToString("N"))
$StageProject = Join-Path $StageRoot "ComePlayers"

Write-Host "Preparing a source-only archive..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $StageProject | Out-Null

$ExcludedDirectories = @(
  "node_modules",
  ".git",
  ".next",
  ".expo",
  ".turbo",
  ".vercel",
  ".gradle",
  "target",
  "coverage",
  "playwright-report",
  "test-results"
)

$ExcludedFiles = @(
  ".env",
  ".env.local",
  ".env.*.local",
  "*.log",
  "*.keystore",
  "*.jks",
  "*.p12",
  "*.pem",
  "credentials.json"
)

$RoboCopyArguments = @(
  $ProjectRoot,
  $StageProject,
  "/E",
  "/R:1",
  "/W:1",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP",
  "/XD"
) + $ExcludedDirectories + @("/XF") + $ExcludedFiles

& robocopy @RoboCopyArguments | Out-Null
$RoboCopyExitCode = $LASTEXITCODE
if ($RoboCopyExitCode -ge 8) {
  throw "Source copy failed. Robocopy exit code: $RoboCopyExitCode"
}

# Remove native build outputs while keeping the Android source project.
$GeneratedPaths = @(
  (Join-Path $StageProject "comeplayers-apps/apps/mobile/android/app/build"),
  (Join-Path $StageProject "comeplayers-apps/apps/mobile/android/build"),
  (Join-Path $StageProject "comeplayers-apps/apps/mobile/android/.cxx")
)
foreach ($GeneratedPath in $GeneratedPaths) {
  if (Test-Path $GeneratedPath) {
    Remove-Item -Recurse -Force $GeneratedPath
  }
}

$OutputDirectory = Split-Path -Parent $OutputPath
if ($OutputDirectory) {
  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
}
if (Test-Path $OutputPath) {
  Remove-Item -Force $OutputPath
}

Compress-Archive -Path $StageProject -DestinationPath $OutputPath -CompressionLevel Optimal
Remove-Item -Recurse -Force $StageRoot

$Archive = Get-Item $OutputPath
$SizeMb = [Math]::Round($Archive.Length / 1MB, 2)
Write-Host "Source-only archive created:" -ForegroundColor Green
Write-Host $Archive.FullName
Write-Host "Size: $SizeMb MB"
