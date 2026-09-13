param(
  [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"

$keyPath = Join-Path $env:USERPROFILE ".comeplayers\desktop-update.key"
$allowUnsignedBuild = $AllowUnsigned -or $env:COMEPLAYERS_ALLOW_UNSIGNED_WINDOWS_BUILD -eq "1"
$artifactEndpoint = [string]$env:COMEPLAYERS_SIGNING_ENDPOINT
$artifactAccount = [string]$env:COMEPLAYERS_SIGNING_ACCOUNT
$artifactProfile = [string]$env:COMEPLAYERS_SIGNING_PROFILE
$certificateThumbprint = ([string]$env:COMEPLAYERS_WINDOWS_CERTIFICATE_THUMBPRINT).Replace(" ", "").ToUpperInvariant()
$timestampUrl = [string]$env:COMEPLAYERS_WINDOWS_TIMESTAMP_URL
$generatedConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "comeplayers-tauri-windows-signing.json"
$requiresSignatureVerification = $false
$workspaceTauri = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\node_modules\.bin\tauri.cmd"))

function Test-ArtifactSigningConfiguration {
  return $artifactEndpoint -or $artifactAccount -or $artifactProfile
}

function Assert-SafeSigningValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if ($Value -notmatch '^[A-Za-z0-9._:/-]+$') {
    throw "$Name contains unsupported characters."
  }
}

function Assert-ValidAuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Windows signature verification failed for $Path ($($signature.Status): $($signature.StatusMessage))"
  }
  if (-not $signature.SignerCertificate) {
    throw "Windows did not report a verified publisher certificate for $Path."
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "The Windows signature is missing a trusted timestamp for $Path."
  }

  Write-Host "Verified Windows publisher: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath $keyPath)) {
  throw "The Tauri updater signing key was not found at $keyPath. Run signer generate before building the release."
}

$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyPath
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $keyPath

try {
  if (Test-ArtifactSigningConfiguration) {
    if (-not ($artifactEndpoint -and $artifactAccount -and $artifactProfile)) {
      throw "Artifact Signing requires COMEPLAYERS_SIGNING_ENDPOINT, COMEPLAYERS_SIGNING_ACCOUNT, and COMEPLAYERS_SIGNING_PROFILE."
    }
    if (-not $artifactEndpoint.StartsWith("https://")) {
      throw "COMEPLAYERS_SIGNING_ENDPOINT must use HTTPS."
    }
    Assert-SafeSigningValue -Name "COMEPLAYERS_SIGNING_ENDPOINT" -Value $artifactEndpoint
    Assert-SafeSigningValue -Name "COMEPLAYERS_SIGNING_ACCOUNT" -Value $artifactAccount
    Assert-SafeSigningValue -Name "COMEPLAYERS_SIGNING_PROFILE" -Value $artifactProfile
    if (-not (Get-Command artifact-signing-cli -ErrorAction SilentlyContinue)) {
      throw "artifact-signing-cli is required for Azure Artifact Signing."
    }

    $signCommand = "artifact-signing-cli -e $artifactEndpoint -a $artifactAccount -c $artifactProfile -d ComePlayers %1"
    $signingConfig = @{
      bundle = @{
        windows = @{
          signCommand = $signCommand
        }
      }
    }
    $signingConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $generatedConfigPath -Encoding UTF8
    $requiresSignatureVerification = $true
    Write-Host "Building with Azure Artifact Signing." -ForegroundColor Cyan
  }
  elseif ($certificateThumbprint) {
    if ($certificateThumbprint -notmatch '^[A-F0-9]{40,128}$') {
      throw "COMEPLAYERS_WINDOWS_CERTIFICATE_THUMBPRINT is not a valid certificate thumbprint."
    }
    if (-not $timestampUrl.StartsWith("https://")) {
      throw "COMEPLAYERS_WINDOWS_TIMESTAMP_URL must use HTTPS."
    }

    $certificate = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
      $_.Thumbprint -eq $certificateThumbprint -and
      $_.HasPrivateKey -and
      $_.NotBefore -le (Get-Date) -and
      $_.NotAfter -gt (Get-Date) -and
      $_.EnhancedKeyUsageList.ObjectId -contains "1.3.6.1.5.5.7.3.3"
    } | Select-Object -First 1
    if (-not $certificate) {
      throw "A valid Code Signing certificate with the configured thumbprint was not found in Cert:\CurrentUser\My."
    }

    $signingConfig = @{
      bundle = @{
        windows = @{
          certificateThumbprint = $certificateThumbprint
          digestAlgorithm = "sha256"
          timestampUrl = $timestampUrl
        }
      }
    }
    $signingConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $generatedConfigPath -Encoding UTF8
    $requiresSignatureVerification = $true
    Write-Host "Building with the Windows Code Signing certificate for $($certificate.Subject)." -ForegroundColor Cyan
  }
  elseif (-not $allowUnsignedBuild) {
    throw @"
Public Windows builds must be Authenticode-signed.

Configure Azure Artifact Signing:
  COMEPLAYERS_SIGNING_ENDPOINT
  COMEPLAYERS_SIGNING_ACCOUNT
  COMEPLAYERS_SIGNING_PROFILE
  AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID

Or install a trusted OV/EV Code Signing certificate and configure:
  COMEPLAYERS_WINDOWS_CERTIFICATE_THUMBPRINT
  COMEPLAYERS_WINDOWS_TIMESTAMP_URL

For local testing only, set COMEPLAYERS_ALLOW_UNSIGNED_WINDOWS_BUILD=1.
Never publish an unsigned installer.
"@
  }
  else {
    Write-Warning "Building an unsigned local test installer. This artifact must not be published."
  }

  $arguments = @("build", "--ci")
  if (Test-Path -LiteralPath $generatedConfigPath) {
    $arguments += @("--config", $generatedConfigPath)
  }

  $tauriCommand = Get-Command tauri -ErrorAction SilentlyContinue
  if ($tauriCommand) {
    & $tauriCommand.Source @arguments
  }
  elseif (Test-Path -LiteralPath $workspaceTauri) {
    & $workspaceTauri @arguments
  }
  else {
    throw "The Tauri CLI was not found. Run npm install from the comeplayers-apps workspace first."
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri desktop build failed with exit code $LASTEXITCODE."
  }

  $releaseRoot = Join-Path $PSScriptRoot "..\src-tauri\target\release"
  $mainExecutable = Join-Path $releaseRoot "comeplayers-desktop.exe"
  $installer = Get-ChildItem -LiteralPath (Join-Path $releaseRoot "bundle\nsis") -Filter "*-setup.exe" -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not (Test-Path -LiteralPath $mainExecutable) -or -not $installer) {
    throw "The expected ComePlayers Windows executable or NSIS installer was not produced."
  }

  if ($requiresSignatureVerification) {
    Assert-ValidAuthenticodeSignature -Path $mainExecutable
    Assert-ValidAuthenticodeSignature -Path $installer.FullName
  }
}
finally {
  if (Test-Path -LiteralPath $generatedConfigPath) {
    Remove-Item -LiteralPath $generatedConfigPath -Force
  }
}
