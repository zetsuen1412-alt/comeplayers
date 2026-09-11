param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$setupScript = Join-Path $ProjectRoot "scripts\SETUP_EMPIRES_ALLIES.ps1"
$serviceScript = Join-Path $ProjectRoot "scripts\START_EMPIRES_ALLIES.ps1"
$websiteDir = Join-Path $ProjectRoot "website"
$serviceEnv = Join-Path $ProjectRoot "game-services\empires-allies\.env"
$healthUrl = "http://127.0.0.1:5005/healthz"
$logFile = Join-Path $ProjectRoot "game-services\empires-allies\logs\empires-service.log"

function Test-EmpiresHealth {
  try {
    $result = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3
    return [bool]$result.ok
  } catch {
    return $false
  }
}

if (-not (Test-Path $serviceEnv)) {
  & $setupScript -ProjectRoot $ProjectRoot
}

if (-not (Test-EmpiresHealth)) {
  Write-Host "Starting CP Empires & Allies..." -ForegroundColor Cyan

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

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  do {
    Start-Sleep -Seconds 1

    if ($serviceProcess.HasExited) {
      throw "The CP Empires & Allies service stopped before becoming ready. Check: $logFile"
    }

    if (Test-EmpiresHealth) {
      break
    }

    Write-Host "." -NoNewline -ForegroundColor DarkCyan
  } while ((Get-Date) -lt $deadline)

  Write-Host ""

  if (-not (Test-EmpiresHealth)) {
    throw "CP Empires & Allies did not become ready within $StartupTimeoutSeconds seconds. Check: $logFile"
  }
}

Write-Host "CP Empires & Allies is ready at $healthUrl" -ForegroundColor Green

$websiteAlreadyRunning = $false
try {
  $websiteCheck = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 2
  $websiteAlreadyRunning = $websiteCheck.StatusCode -ge 200
} catch {
  $websiteAlreadyRunning = $false
}

if ($websiteAlreadyRunning) {
  Write-Host "ComePlayers is already running on port 3000." -ForegroundColor Yellow
  Write-Host "Return to the browser and press the reload button inside CP Empires & Allies." -ForegroundColor Green
  exit 0
}

Set-Location $websiteDir
npm run dev
