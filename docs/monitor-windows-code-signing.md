# Windows publisher signing preparation

Status on 2026-10-25: the public Windows 2.0.3 EXE is **unsigned**. Its SHA-256 is
`118eccccfb892225442aebb526852daa0fb235e4f433a393e5e2021633772991`.
This change prepares a verification tool and tests. It does **not** sign that
download, activate a signing service, change the production release process, or
claim that SmartScreen warnings have been resolved.

## Certificate selection is still required

The owner chose direct EXE distribution with an official publisher certificate.
We still need to know whether an existing certificate/service is available and
whether the publisher is an individual or a registered organization. Certificate
issuance, country eligibility, the legal publisher name and the final price must
be confirmed with the chosen CA before purchase. Identity checks and accepting
the provider's terms belong to the owner. Never collect identity documents,
passwords, OTP seeds or private keys in chat or this repository.

Possible providers researched from their official pages:

- [SSL.com IV](https://www.ssl.com/products/software-integrity/code-signing/iv/)
  supports a verified individual publisher without a business entity. The
  [eSigner pricing page](https://www.ssl.com/products/software-integrity/signing-service/)
  lists IV/OV certificates at USD 129/year plus a cloud signing subscription;
  its displayed starting subscription is USD 15/month. Billing selection,
  taxes, renewal, validation and country eligibility need confirmation at
  checkout. eSigner supports GitHub Actions; it keeps signing keys in its HSM.
- [Certum Standard](https://www.certum.eu/en/code-signing-certificates/)
  supports individuals and companies and lists a starting price of EUR 139.
  Confirm the cloud product, term, final cost and supported automation before
  choosing it. A desktop cloud-signing client alone does not establish that our
  unattended GitHub runner can use it.

These are options for review, not purchases or provider endorsements. Do not use
the Android key, a development certificate or a self-signed Windows certificate
as a substitute. The certificate's key storage must meet the CA's requirements;
do not assume the private key can be downloaded as a PFX.

## Release verification tool

`CP-BoostMonitor-Windows/Release/Assert-ReleaseSignature.ps1` accepts an EXE, the
Windows SDK SignTool path, an approved certificate SHA-256 fingerprint and the
exact approved publisher subject. Both identity values are public certificate
metadata; obtain and review them after the CA issues the certificate. Pin the
certificate itself, not a file hash or the Windows SHA-1 thumbprint.

The script requires:

1. A valid **embedded** Authenticode signature. Catalog-only trust is rejected.
2. The approved signer fingerprint and publisher subject.
3. A timestamp and a successful `signtool verify /pa /all /tw /v` result,
   including no warning exit code.
4. Identical file SHA-256 before and after verification.

On success it returns the EXE hash/length, signer identity and timestamp signer.
It relies on the Windows trust configuration and SignTool on the runner. It does
not establish CA eligibility, a publisher's identity, malware safety, SmartScreen
reputation, or that a machine's trust store has not been modified. Keep the normal
runner trust store; never import a private root to make a release pass.

```powershell
# Values below come from the independently approved public certificate.
./CP-BoostMonitor-Windows/Release/Assert-ReleaseSignature.ps1 `
  -FilePath dist/cp-boost-monitor-windows/EVOGAMINGMonitor.exe `
  -SignToolPath $windowsSdkSignTool `
  -ExpectedCertificateSha256 $approvedCertificateSha256 `
  -ExpectedPublisherSubject $approvedPublisherSubject
```

CI runs `CP-BoostMonitor-Windows.Tests/ReleaseSignature.Tests.ps1` against a real
Microsoft-signed SDK binary. It checks a trusted timestamped signature, exact
hash/length reporting, a wrong certificate, a wrong publisher, an unsigned file
and a changed signed file. It never executes the modified fixture, installs a
root certificate or needs release credentials.

## Integration after the certificate is ready

The signing provider has not been integrated yet. The existing Windows workflow
still publishes unsigned releases. Before enabling signed publication:

1. Confirm provider, account eligibility, legal identity and approved cost with
   the owner. Complete CA validation in the owner's provider account.
2. Configure the provider's documented HSM/cloud signing method in a protected
   GitHub environment. Use credentials scoped to releases. Review and pin any
   third-party action/tool to an immutable version, with integrity verification.
   Never expose signing access to pull-request code or `pull_request_target`.
3. Set the approved public certificate fingerprint and subject. Certificate
   replacement requires reviewing those values again; do not auto-approve every
   certificate accessible through an account.
4. On authorized main releases: publish the final EXE, sign it with SHA-256 and a
   trusted timestamp, then run this verification tool **before** executing the
   package startup probe, creating the ZIP, calculating delivery hashes or
   uploading either download. Signing failures must stop publication with no
   unsigned fallback. PR builds continue to run without signing credentials.
5. Build the ZIP from the verified signed EXE. Verify the extracted EXE hash,
   publish signed identity metadata alongside the file hashes, then verify the
   actual public EXE and the copy inside the public ZIP against that metadata.
6. Remove the unsigned release note only when the delivered EXE passes these
   checks. Review the concrete PR before merging/deploying. Keep existing local
   sessions/history, Android signing and all Payroll/Closing data intact.

Signing establishes publisher identity and detects covered file modifications.
It does not guarantee immediate disappearance of Edge/SmartScreen reputation
warnings. Do not disable browser or Defender checks as part of this change.

References: [Microsoft SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
[Microsoft signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool),
[Get-AuthenticodeSignature](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature).
