param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"

if (-not (Test-Path (Join-Path $serviceDir "comeplayers_server.py"))) {
  throw "CP Empires & Allies service files are missing. Install V57 and V58 first."
}

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Railway CLI..." -ForegroundColor Cyan
  npm install -g @railway/cli
  if ($LASTEXITCODE -ne 0) { throw "Railway CLI installation failed." }
}

Write-Host "Signing in to Railway..." -ForegroundColor Cyan
railway login
if ($LASTEXITCODE -ne 0) { throw "Railway login failed." }

Set-Location $serviceDir

Write-Host "Create or link the Railway project when prompted." -ForegroundColor Yellow
railway init
if ($LASTEXITCODE -ne 0) { throw "Railway project initialization failed." }

$databaseUrl = Read-Host "Paste the Supabase PostgreSQL connection string"
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw "DATABASE_URL is required." }

$sharedSecret = Read-Host "Enter EMPIRES_ALLIES_SHARED_SECRET (minimum 32 characters)"
if ($sharedSecret.Length -lt 32) { throw "Shared secret must contain at least 32 characters." }

$flaskSecret = Read-Host "Enter a different FLASK_SECRET_KEY (minimum 32 characters)"
if ($flaskSecret.Length -lt 32) { throw "Flask secret must contain at least 32 characters." }

Write-Host "Setting Railway environment variables..." -ForegroundColor Cyan
railway variable set `
  "DATABASE_URL=$databaseUrl" `
  "EMPIRES_ALLIES_SHARED_SECRET=$sharedSecret" `
  "FLASK_SECRET_KEY=$flaskSecret" `
  "COMEPLAYERS_COOKIE_SECURE=1" `
  "COMEPLAYERS_COOKIE_SAMESITE=None" `
  "COMEPLAYERS_COOKIE_PARTITIONED=1" `
  "COMEPLAYERS_EMBED_MODE=1" `
  "COMEPLAYERS_ALLOW_GUEST=0" `
  "COMEPLAYERS_REQUIRE_ONLINE_STORAGE=1" `
  "COMEPLAYERS_FRAME_ANCESTORS='self' https://comeplayers.com https://www.comeplayers.com"
if ($LASTEXITCODE -ne 0) { throw "Could not set Railway variables." }

Write-Host "Uploading CP Empires & Allies to Railway. The first upload is large and may take time..." -ForegroundColor Cyan
railway up --detach
if ($LASTEXITCODE -ne 0) { throw "Railway deployment failed." }

Write-Host "" 
Write-Host "Deployment started successfully." -ForegroundColor Green
Write-Host "Opening Railway dashboard..." -ForegroundColor Cyan
railway open
Write-Host "" 
Write-Host "In Railway: Settings > Networking > Generate Domain." -ForegroundColor Yellow
Write-Host "Then set the resulting HTTPS URL in Vercel as:" -ForegroundColor Yellow
Write-Host "  EMPIRES_ALLIES_PUBLIC_URL=https://YOUR-RAILWAY-DOMAIN" -ForegroundColor White
Write-Host "  NEXT_PUBLIC_EMPIRES_ALLIES_URL=https://YOUR-RAILWAY-DOMAIN" -ForegroundColor White
Write-Host "  EMPIRES_ALLIES_SHARED_SECRET=$sharedSecret" -ForegroundColor White
Write-Host "Redeploy ComePlayers on Vercel after adding the variables." -ForegroundColor Green
