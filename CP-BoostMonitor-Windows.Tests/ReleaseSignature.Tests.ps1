#Requires -Version 5.1
[CmdletBinding()]
param([string] $SignToolPath)
$ErrorActionPreference = 'Stop'
$guard = Join-Path $PSScriptRoot '../CP-BoostMonitor-Windows/Release/Assert-ReleaseSignature.ps1'

if (-not $SignToolPath) {
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    $SignToolPath = Get-ChildItem -LiteralPath $sdkRoot -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending |
        ForEach-Object { Join-Path $_.FullName 'x64/signtool.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}
if (-not $SignToolPath) { throw 'Windows SDK SignTool is required for real signature integration tests.' }

# Use the SDK's real Microsoft-signed binary as a positive fixture. Never create
# a test root, import certificates, export keys, or execute the fixture.
$fixture = (Get-Item -LiteralPath $SignToolPath).FullName
$signature = Get-AuthenticodeSignature -LiteralPath $fixture
if ($signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
    throw 'Expected the Microsoft-signed Windows SDK fixture.'
}
$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $pin = ([BitConverter]::ToString($hasher.ComputeHash($signature.SignerCertificate.RawData))).Replace('-', '').ToLowerInvariant()
} finally { $hasher.Dispose() }
$arguments = @{
    FilePath = $fixture
    SignToolPath = $fixture
    ExpectedCertificateSha256 = $pin
    ExpectedPublisherSubject = $signature.SignerCertificate.Subject
}
$script:assertions = 0
function Assert-Rejected([string] $Name, [hashtable] $Arguments, [string] $ExpectedMessage) {
    $caught = $null
    try { $null = & $guard @Arguments } catch { $caught = $_.Exception.Message }
    if (-not $caught -or $caught -notlike "*$ExpectedMessage*") {
        throw "$Name did not fail as expected: $caught"
    }
    $script:assertions++
    Write-Host "PASS $Name"
}

$report = & $guard @arguments
if ($report.Status -ne 'Valid' -or $report.SignerCertificateSha256 -ne $pin -or
    $report.Sha256 -ne (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant() -or
    $report.Bytes -ne (Get-Item -LiteralPath $fixture).Length -or -not $report.TimestampSubject) {
    throw 'Valid timestamped fixture returned an incorrect report.'
}
$script:assertions++
Write-Host 'PASS trusted timestamped signature and exact digest report'

$wrongPin = $arguments.Clone()
$wrongPin.ExpectedCertificateSha256 = '0' * 64
Assert-Rejected 'wrong certificate' $wrongPin 'approved SHA-256 fingerprint'
$wrongPublisher = $arguments.Clone()
$wrongPublisher.ExpectedPublisherSubject = 'CN=Unapproved Publisher'
Assert-Rejected 'wrong publisher' $wrongPublisher 'approved publisher'

$caseDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('monitor-signature-tests-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $caseDirectory
$unsignedFile = Join-Path $caseDirectory 'unsigned.exe'
$tamperedFile = Join-Path $caseDirectory 'tampered.exe'
try {
    [System.IO.File]::WriteAllBytes($unsignedFile, [byte[]]::new(128))
    $unsigned = $arguments.Clone()
    $unsigned.FilePath = $unsignedFile
    Assert-Rejected 'unsigned file' $unsigned 'valid embedded Authenticode signature'

    Copy-Item -LiteralPath $fixture -Destination $tamperedFile
    # Flip one DOS-stub byte in our temporary copy. Never run the modified file.
    $stream = [System.IO.File]::Open($tamperedFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite)
    try {
        $stream.Position = 0x40
        $original = $stream.ReadByte()
        $stream.Position = 0x40
        $stream.WriteByte([byte]($original -bxor 1))
    } finally { $stream.Dispose() }
    $tampered = $arguments.Clone()
    $tampered.FilePath = $tamperedFile
    Assert-Rejected 'modified signed file' $tampered 'valid embedded Authenticode signature'
} finally {
    # Only remove the exact files created above, then the now-empty directory.
    foreach ($createdFile in @($unsignedFile, $tamperedFile)) {
        if (Test-Path -LiteralPath $createdFile) { Remove-Item -LiteralPath $createdFile -Force }
    }
    Remove-Item -LiteralPath $caseDirectory
}
Write-Host "$script:assertions real Windows signature assertions passed. No publisher credentials or trusted roots were changed."
