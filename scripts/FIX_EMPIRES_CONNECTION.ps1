param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$RebuildPythonEnvironment,
  [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"
$venvDir = Join-Path $serviceDir ".venv"
$setupScript = Join-Path $ProjectRoot "scripts\SETUP_EMPIRES_ALLIES.ps1"
$serviceScript = Join-Path $ProjectRoot "scripts\START_EMPIRES_ALLIES.ps1"
$healthUrl = "http://127.0.0.1:5005/healthz"
$logFile = Join-Path $serviceDir "logs\empires-service.log"

function Test-EmpiresHealth {
  try {
    $result = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3
    return [bool]$result.ok
  } catch {
    return $false
  }
}

if (-not (Test-Path $serviceDir)) {
  throw "CP Empires & Allies files were not found: $serviceDir"
}

if ($RebuildPythonEnvironment -and (Test-Path $venvDir)) {
  Write-Host "Removing the old Python environment..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $venvDir
}

if (-not (Test-Path (Join-Path $serviceDir ".env"))) {
  & $setupScript -ProjectRoot $ProjectRoot
}

if (Test-EmpiresHealth) {
  Write-Host "CP Empires & Allies is already online." -ForegroundColor Green
  exit 0
}

$argumentLine = @(
  "-NoExit"
  "-ExecutionPolicy Bypass"
  "-File `"$serviceScript`""
  "-ProjectRoot `"$ProjectRoot`""
) -join " "

$serviceProcess = Start-Process -FilePath "powershell.exe" `
  -ArgumentList $argumentLine `
  -WorkingDirectory $ProjectRoot `
  -PassThru

Write-Host "Waiting for the local game service..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)

do {
  Start-Sleep -Seconds 1

  if ($serviceProcess.HasExited) {
    throw "The game service stopped. Read the error in the new PowerShell window or open: $logFile"
  }

  if (Test-EmpiresHealth) {
    Write-Host "CP Empires & Allies is online at http://127.0.0.1:5005" -ForegroundColor Green
    Write-Host "Return to ComePlayers and click the reload icon in the game header." -ForegroundColor Green
    exit 0
  }

  Write-Host "." -NoNewline -ForegroundColor DarkCyan
} while ((Get-Date) -lt $deadline)

Write-Host ""
if (Test-Path $logFile) {
  Write-Host "Last CP Empires & Allies log lines:" -ForegroundColor Yellow
  $tail = Get-Content $logFile -Tail 35 -ErrorAction SilentlyContinue
  $tail | Write-Host

  if (($tail -join "`n") -match "unable to open database file") {
    throw "SQLite could not open the old save path. Apply V57.2, then run this script again. The fixed database location is: $serviceDir\data\save.db"
  }
}
throw "The service did not start within $StartupTimeoutSeconds seconds. Check: $logFile"
