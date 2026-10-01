param(
  [string]$IdentityName = $env:COMEPLAYERS_STORE_IDENTITY_NAME,
  [string]$PublisherId = $env:COMEPLAYERS_STORE_PUBLISHER_ID,
  [string]$PublisherDisplayName = "ComePlayers"
)

$ErrorActionPreference = "Stop"

function Find-WindowsSdkTool {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $sdkBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (Test-Path -LiteralPath $sdkBin) {
    $candidate = Get-ChildItem -LiteralPath $sdkBin -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "x64\$Name" } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate
    }
  }

  throw "$Name was not found. Install the Windows 10/11 SDK before creating the Store package."
}

function New-SquarePng {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][int]$Size
  )

  Add-Type -AssemblyName System.Drawing
  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)
      }
      finally {
        $graphics.Dispose()
      }
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $bitmap.Dispose()
    }
  }
  finally {
    $sourceImage.Dispose()
  }
}

if (-not $IdentityName) {
  throw "COMEPLAYERS_STORE_IDENTITY_NAME is required. Copy the Package/Identity Name exactly from Partner Center."
}
if (-not $PublisherId) {
  throw "COMEPLAYERS_STORE_PUBLISHER_ID is required. Copy the Publisher value exactly from Partner Center (for example CN=...)."
}
if ($IdentityName -notmatch '^[A-Za-z0-9.-]+$') {
  throw "COMEPLAYERS_STORE_IDENTITY_NAME contains unsupported characters."
}
if ($PublisherId -notmatch '^CN=[A-Za-z0-9-]+$') {
  throw "COMEPLAYERS_STORE_PUBLISHER_ID must be the Partner Center Publisher ID in CN=... form."
}

$desktopRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $desktopRoot "..\.."))
$tauriCommand = Join-Path $workspaceRoot "node_modules\.bin\tauri.cmd"
$packageRoot = Join-Path $desktopRoot "store-package"
$layoutRoot = Join-Path $packageRoot "layout"
$assetsRoot = Join-Path $layoutRoot "Assets"
$outputRoot = Join-Path $packageRoot "output"
$manifestPath = Join-Path $layoutRoot "AppxManifest.xml"
$executable = Join-Path $desktopRoot "src-tauri\target\release\comeplayers-desktop.exe"
$sourceIcon = Join-Path $desktopRoot "src-tauri\icons\256x256.png"
$version = [string](Get-Content -Raw -LiteralPath (Join-Path $desktopRoot "package.json") | ConvertFrom-Json).version
if ($version -notmatch '^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$') {
  throw "Desktop version must use Major.Minor.Build numeric format for Microsoft Store."
}
$versionParts = $version.Split('.') | ForEach-Object { [int]$_ }
if ($versionParts[0] -eq 0 -or ($versionParts | Where-Object { $_ -gt 65535 })) {
  throw "Microsoft Store requires a nonzero major version and version fields no greater than 65535."
}
$msixVersion = "$version.0"
$outputPath = Join-Path $outputRoot "ComePlayers_$($version)_x64.msix"

if (-not (Test-Path -LiteralPath $tauriCommand)) {
  throw "Tauri CLI was not found. Run npm install from $workspaceRoot first."
}

$makeAppx = Find-WindowsSdkTool -Name "makeappx.exe"

if (Test-Path -LiteralPath $packageRoot) {
  $expectedPackageRoot = [System.IO.Path]::GetFullPath((Join-Path $desktopRoot "store-package"))
  if ($packageRoot -ne $expectedPackageRoot -or
      -not $packageRoot.StartsWith(($desktopRoot.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a Store package directory outside the desktop workspace."
  }
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $assetsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$previousDistribution = $env:VITE_COMEPLAYERS_DISTRIBUTION
try {
  $env:VITE_COMEPLAYERS_DISTRIBUTION = "store"
  Push-Location -LiteralPath $desktopRoot
  try {
    & $tauriCommand build --ci --no-bundle
    if ($LASTEXITCODE -ne 0) {
      throw "Tauri Store build failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  $env:VITE_COMEPLAYERS_DISTRIBUTION = $previousDistribution
}

if (-not (Test-Path -LiteralPath $executable)) {
  throw "ComePlayers desktop executable was not produced at $executable."
}

Copy-Item -LiteralPath $executable -Destination (Join-Path $layoutRoot "ComePlayers.exe")
New-SquarePng -Source $sourceIcon -Destination (Join-Path $assetsRoot "StoreLogo.png") -Size 50
New-SquarePng -Source $sourceIcon -Destination (Join-Path $assetsRoot "Square44x44Logo.png") -Size 44
New-SquarePng -Source $sourceIcon -Destination (Join-Path $assetsRoot "Square150x150Logo.png") -Size 150

$escapedIdentity = [System.Security.SecurityElement]::Escape($IdentityName)
$escapedPublisher = [System.Security.SecurityElement]::Escape($PublisherId)
$escapedDisplayName = [System.Security.SecurityElement]::Escape($PublisherDisplayName)

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap3 rescap">
  <Identity Name="$escapedIdentity" Publisher="$escapedPublisher" Version="$msixVersion" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>ComePlayers</DisplayName>
    <PublisherDisplayName>$escapedDisplayName</PublisherDisplayName>
    <Description>Play. Trade. Connect.</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-us" />
    <Resource Language="id-id" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Applications>
    <Application Id="ComePlayers" Executable="ComePlayers.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="ComePlayers"
        Description="Play. Trade. Connect."
        BackgroundColor="transparent"
        Square44x44Logo="Assets\Square44x44Logo.png"
        Square150x150Logo="Assets\Square150x150Logo.png" />
      <Extensions>
        <uap3:Extension Category="windows.protocol">
          <uap3:Protocol Name="comeplayers" Parameters="&quot;%1&quot;" />
        </uap3:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8
& $makeAppx pack /d $layoutRoot /p $outputPath /o
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
  throw "MakeAppx failed to create the Microsoft Store package."
}

Write-Host "Microsoft Store MSIX created:" -ForegroundColor Green
Write-Host $outputPath
Write-Warning "This package is for Partner Center submission. Microsoft signs it after certification; do not distribute this unsigned file directly."
