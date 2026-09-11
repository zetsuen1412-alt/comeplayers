param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$serviceDir = Join-Path $ProjectRoot "game-services\empires-allies"
$envFile = Join-Path $serviceDir ".env.production"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.production. Run scripts\CONFIGURE_EMPIRES_ONLINE.ps1 first."
}

Set-Location $serviceDir
docker compose -f docker-compose.production.yml up -d --build
if ($LASTEXITCODE -ne 0) { throw "Docker deployment failed." }

docker compose -f docker-compose.production.yml ps
Write-Host "Reverse-proxy HTTPS to http://127.0.0.1:5005 and test /healthz." -ForegroundColor Green
