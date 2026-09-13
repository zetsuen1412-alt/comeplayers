$ErrorActionPreference = "Stop"
& "$PSScriptRoot\build-desktop-windows.ps1"
& "$PSScriptRoot\07_BUILD_ANDROID_PRODUCTION.ps1"
& "$PSScriptRoot\build-ios.ps1" -Profile production
