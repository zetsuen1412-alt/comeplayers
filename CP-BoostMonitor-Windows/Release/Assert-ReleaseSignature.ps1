#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $FilePath,
    [Parameter(Mandatory)][string] $SignToolPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedCertificateSha256,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $ExpectedPublisherSubject
)

$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $FilePath
$signTool = Get-Item -LiteralPath $SignToolPath
if ($file.PSIsContainer -or $signTool.PSIsContainer) { throw 'Expected file paths, not directories.' }
$beforeHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash

# Do not accept catalog-only trust: users download this EXE without a catalog.
$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
if ($signature.Status.ToString() -ne 'Valid' -or $signature.SignatureType.ToString() -ne 'Authenticode') {
    throw "Release requires a valid embedded Authenticode signature; found $($signature.Status)/$($signature.SignatureType)."
}
if ($null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) {
    throw 'Release requires both a signing certificate and a trusted timestamp.'
}

$hasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $certificateHash = ([BitConverter]::ToString($hasher.ComputeHash($signature.SignerCertificate.RawData))).Replace('-', '').ToLowerInvariant()
} finally { $hasher.Dispose() }
if ($certificateHash -ne $ExpectedCertificateSha256.ToLowerInvariant()) {
    throw 'Release signing certificate does not match the approved SHA-256 fingerprint.'
}
if ($signature.SignerCertificate.Subject -cne $ExpectedPublisherSubject) {
    throw 'Release publisher subject does not match the approved publisher.'
}

# Windows Authenticode policy checks the chain, digest and timestamp. /all also
# checks additional embedded signatures. Treat warnings as release failures.
$verification = & $signTool.FullName verify /pa /all /tw /v $file.FullName 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "SignTool verification failed (exit $LASTEXITCODE): $($verification -join [Environment]::NewLine)"
}
$afterHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
if ($beforeHash -ne $afterHash) { throw 'Release file changed during signature verification.' }

[pscustomobject]@{
    File = $file.FullName
    Sha256 = $afterHash.ToLowerInvariant()
    Bytes = (Get-Item -LiteralPath $file.FullName).Length
    Status = 'Valid'
    SignatureType = 'Authenticode'
    SignerSubject = $signature.SignerCertificate.Subject
    SignerCertificateSha256 = $certificateHash
    TimestampSubject = $signature.TimeStamperCertificate.Subject
}
