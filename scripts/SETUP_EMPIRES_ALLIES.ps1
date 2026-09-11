param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$ServiceUrl = "http://127.0.0.1:5005"
)

$ErrorActionPreference = "Stop"
$websiteEnv = Join-Path $ProjectRoot "website\.env.local"
$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"
$serviceEnv = Join-Path $serviceDir ".env"
$dataDir = Join-Path $serviceDir "data"
$instanceDir = Join-Path $serviceDir "instance"
$logsDir = Join-Path $serviceDir "logs"

if (-not (Test-Path $serviceDir)) {
  throw "CP Empires & Allies service folder was not found: $serviceDir"
}

New-Item -ItemType Directory -Force -Path $dataDir, $instanceDir, $logsDir | Out-Null

$secretBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
$secret = -join ($secretBytes | ForEach-Object { $_.ToString("x2") })

function Set-EnvLine {
  param([string]$Path, [string]$Name, [string]$Value)
  $lines = @()
  if (Test-Path $Path) { $lines = Get-Content $Path }
  $filtered = $lines | Where-Object { $_ -notmatch "^$([regex]::Escape($Name))=" }
  $filtered += "$Name=$Value"
  Set-Content -Path $Path -Value $filtered -Encoding UTF8
}

Set-EnvLine -Path $websiteEnv -Name "EMPIRES_ALLIES_PUBLIC_URL" -Value $ServiceUrl
Set-EnvLine -Path $websiteEnv -Name "NEXT_PUBLIC_EMPIRES_ALLIES_URL" -Value $ServiceUrl
Set-EnvLine -Path $websiteEnv -Name "EMPIRES_ALLIES_SHARED_SECRET" -Value $secret

Copy-Item (Join-Path $serviceDir ".env.example") $serviceEnv -Force
Set-EnvLine -Path $serviceEnv -Name "EMPIRES_ALLIES_SHARED_SECRET" -Value $secret
Set-EnvLine -Path $serviceEnv -Name "HOST" -Value "127.0.0.1"
Set-EnvLine -Path $serviceEnv -Name "PORT" -Value "5005"
Set-EnvLine -Path $serviceEnv -Name "COMEPLAYERS_ALLOW_GUEST" -Value "0"
Set-EnvLine -Path $serviceEnv -Name "COMEPLAYERS_DATA_DIR" -Value "data"

Write-Host "CP Empires & Allies integration configured." -ForegroundColor Green
Write-Host "Website env: $websiteEnv"
Write-Host "Game service env: $serviceEnv"
Write-Host "Service URL: $ServiceUrl"
Write-Host "Game data: $dataDir"
