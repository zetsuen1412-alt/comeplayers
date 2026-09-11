param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$PythonCommand = ""
)

$ErrorActionPreference = "Stop"

$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"
$venvDir = Join-Path $serviceDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$depsMarker = Join-Path $venvDir ".comeplayers-deps-ready"
$logsDir = Join-Path $serviceDir "logs"
$dataDir = Join-Path $serviceDir "data"
$instanceDir = Join-Path $serviceDir "instance"
$logFile = Join-Path $logsDir "empires-service.log"

if (-not (Test-Path $serviceDir)) {
  throw "CP Empires & Allies service folder was not found: $serviceDir"
}

if (-not (Test-Path (Join-Path $serviceDir ".env"))) {
  throw "CP Empires & Allies is not configured. Run .\scripts\SETUP_EMPIRES_ALLIES.ps1 first."
}

New-Item -ItemType Directory -Force -Path $logsDir, $dataDir, $instanceDir | Out-Null

try {
  $writeTest = Join-Path $dataDir ".comeplayers-write-test"
  Set-Content -Path $writeTest -Value "ok" -Encoding ASCII
  Remove-Item -Force $writeTest
} catch {
  throw "The CP Empires & Allies data folder is not writable: $dataDir"
}
Set-Location $serviceDir

function Invoke-SystemPython {
  param([string[]]$Arguments)

  if ($PythonCommand) {
    & $PythonCommand @Arguments
    return
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    & $python.Source @Arguments
    return
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    & $py.Source -3 @Arguments
    return
  }

  throw "Python 3 was not found. Install Python 3.11 or 3.12 and enable 'Add Python to PATH'."
}

if (-not (Test-Path $pythonExe)) {
  Write-Host "Creating the CP Empires & Allies Python environment..." -ForegroundColor Cyan
  Invoke-SystemPython -Arguments @("-m", "venv", $venvDir)
}

if (-not (Test-Path $pythonExe)) {
  throw "The Python environment could not be created: $pythonExe"
}

if (-not (Test-Path $depsMarker)) {
  Write-Host "Installing the CP Empires & Allies server dependencies..." -ForegroundColor Cyan
  & $pythonExe -m pip install --upgrade pip setuptools wheel
  if ($LASTEXITCODE -ne 0) {
    throw "pip could not be upgraded. Check your internet connection and Python installation."
  }

  & $pythonExe -m pip install -r requirements-comeplayers.txt
  if ($LASTEXITCODE -ne 0) {
    throw "CP Empires & Allies dependencies could not be installed. See the terminal output above."
  }

  Set-Content -Path $depsMarker -Value (Get-Date).ToString("o") -Encoding UTF8
}

$env:PYTHONUNBUFFERED = "1"

Write-Host ""
Write-Host "CP Empires & Allies service is starting on http://127.0.0.1:5005" -ForegroundColor Green
Write-Host "Keep this window open while playing." -ForegroundColor Yellow
Write-Host "Log: $logFile" -ForegroundColor DarkGray
Write-Host ""

try {
  & $pythonExe comeplayers_server.py --host 127.0.0.1 --port 5005 2>&1 |
    Tee-Object -FilePath $logFile -Append
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "The game service stopped with exit code $exitCode. Open $logFile for details."
  }
} catch {
  $_ | Out-String | Tee-Object -FilePath $logFile -Append | Write-Host -ForegroundColor Red
  throw
}
