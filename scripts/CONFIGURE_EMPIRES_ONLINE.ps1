param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [Parameter(Mandatory = $true)][string]$PublicUrl,
  [Parameter(Mandatory = $true)][string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"
$serviceEnv = Join-Path $serviceDir ".env.production"
$websiteEnv = Join-Path $ProjectRoot "website\.env.local"

function New-RandomSecret {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvLine {
  param([string]$Path, [string]$Name, [string]$Value)
  $lines = if (Test-Path $Path) { Get-Content $Path } else { @() }
  $filtered = $lines | Where-Object { $_ -notmatch "^$([regex]::Escape($Name))=" }
  $filtered += "$Name=$Value"
  Set-Content -Path $Path -Value $filtered -Encoding UTF8
}

if (-not (Test-Path $serviceDir)) { throw "Game service not found: $serviceDir" }
if (-not $PublicUrl.StartsWith("https://")) { throw "PublicUrl must use HTTPS." }

$sharedSecret = New-RandomSecret
$flaskSecret = New-RandomSecret
Copy-Item (Join-Path $serviceDir ".env.production.example") $serviceEnv -Force
Set-EnvLine $serviceEnv "DATABASE_URL" $DatabaseUrl
Set-EnvLine $serviceEnv "EMPIRES_ALLIES_SHARED_SECRET" $sharedSecret
Set-EnvLine $serviceEnv "FLASK_SECRET_KEY" $flaskSecret

Set-EnvLine $websiteEnv "EMPIRES_ALLIES_PUBLIC_URL" $PublicUrl.TrimEnd('/')
Set-EnvLine $websiteEnv "NEXT_PUBLIC_EMPIRES_ALLIES_URL" $PublicUrl.TrimEnd('/')
Set-EnvLine $websiteEnv "EMPIRES_ALLIES_SHARED_SECRET" $sharedSecret

Write-Host "Online CP Empires & Allies configuration generated." -ForegroundColor Green
Write-Host "Service env : $serviceEnv"
Write-Host "Website env : $websiteEnv"
Write-Host "Deploy the game service, then add the same three website values to Vercel Production." -ForegroundColor Yellow
