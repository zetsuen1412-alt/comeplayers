# Chat otomatis tanpa passkey wajib

Released on 28 September 2026 (UTC+7). Supersedes the mandatory-passkey behavior documented in CHAT-UX-2026-09-28.md.

## User behavior

- A new encrypted account is enrolled automatically after login. There is no passkey creation dialog or setup button before the first chat.
- Keys are stored in the device's protected storage before enrollment. A journal resumes the same identity/device after a lost response or app restart. Existing remote identities are never replaced automatically.
- Profile → **Chat & cadangan** offers optional encrypted backup. Users can choose a backup password without creating a passkey. It is separate from the login password and stays on the client.
- On a new device, an existing account uses its saved backup password or previously configured passkey. Losing every authorized device without a recovery method cannot be repaired using account login alone.
- Existing passkey backups remain supported. Adding password recovery preserves the original identity, passkey wrapper and older encrypted archives.

## Published artifacts

- Website/API source: `9b627700ed520620aece0f7268788a5f688a79b5`, deployed from a Git source archive without local environment files.
- Vercel production: `dpl_8EZfiSyeuQfcfcYziiVTY5XCVK8W`, https://www.comeplayers.com. Build, TypeScript and 242 generated pages completed successfully. The public version endpoint independently confirmed this deployment.
- Android source: `a41ce1d7540f89c2a1641e6e4226625ee500235d` (only the release verification script changed after the website deployment).
- EAS project: `a663aa70-99b7-4c8f-93ea-5f8637baa2df`; channel/branch: `production`; runtime: `0.15.0`; platform: Android.
- Update group: `14651907-ca7d-4bc1-abb1-7b345d5da3cb`.
- Android update: `01a0e49f-08b4-726c-8b68-0f8f79a1e6aa`, published `2026-09-27T20:47:02.836Z` (03:47 UTC+7).
- The EAS endpoint returned HTTP 200 and that exact update ID, runtime and project using Android production headers. This confirms availability, not installation on a physical phone.
- Publication loaded the five EAS production public variables with `EXPO_NO_DOTENV=1`. No native module, permission or signing change; this is an OTA update for the existing Play internal-test build 0.15.0 (22).

## Database and security

Migration `20260927203117_optional_device_enrollment.sql` adds an initially disabled `allow_device_setup` capability. Both SQL enrollment guards continue enforcing the recovery generation and backend-only access. Existing password/passkey recovery wrappers cannot be removed or substituted. Root signatures, device proofs, immutable roots and device limits remain in force.

Production had `messaging_mode=account`, zero encrypted accounts and zero encrypted events, despite the mobile client using encrypted chat. After the API deployment, enrollment was enabled with `messaging_mode=e2ee` and `allow_device_setup=true`, guarded by the observed generation and zero encrypted rows. No account, message or previous chat table was converted or reset. Generation remains `1`; reset timestamp remains `2026-09-16 11:52:09.241719+00`. `require_passkey=true` remains as legacy generation metadata; updated clients honor the explicit optional-device capability.

Password recovery uses client-side PBKDF2-HMAC-SHA256 with a random 256-bit salt, a fixed signed 600,000-iteration cost, domain/account binding, and a 12-character minimum. The existing authenticated encryption seals the account root; root signatures bind the wrapper and its parameters. Neither the password, derived key nor plaintext root is accepted by the API. The async derivation yields to the UI; native-device performance has not been measured. Password changes/replacement are deliberately rejected to preserve existing archives.

The Supabase security-advisor comparison found no new notices. Pre-existing notices remain outside this change. The bounded Vercel error-log query returned no matching logs for the new deployment.

## Verification

- 13 actual React component/orchestration cases: automatic setup, no overlay, existing-account recovery, cancellation, double taps/remounts, account switching, optional password settings and password-manager compatibility.
- 29 protocol/policy cases: automatic enrollment/journal interruption, real password encryption, wrong password/tampering/hostile KDF parameters, cross-platform recovery, existing passkeys, signed rosters/device proofs, retained-history encryption and generation checks.
- Two isolated PostgreSQL suites checked RPC/trigger behavior and permissions, including missing/stale generations, disabled messaging mode and recovery downgrade rejection.
- Mobile TypeScript, website TypeScript and production build passed. Android export bundled 1,126 modules.
- Actual recovery component checked through React Native Web at 320px: password input, enabled/disabled action and completion; no browser runtime errors. Native calls were mocked for this visual check.
- Live API test created two disposable accounts, enrolled them without passkeys, sent/pulled/decrypted a real encrypted message, added password recovery, enrolled a recovered device and decrypted the retained message with the same account root. No push notification or email was sent. Authentication rejection was verified. All generated users/rooms were removed and cleanup independently confirmed.

Physical Play-installed update activation and Google Drive consent/backup still need device verification. Public Google Play production submission remains subject to the separately documented Play requirements; this OTA is already published to the installed internal-test app.

## Rollback / application

The installed app downloads the update in the background and applies it on a full restart. Open ComePlayers online, allow the download to finish, then close and reopen it.

Do not revert the database capability or old API while password-only accounts exist: doing so would block their enrollment/recovery. A UI rollback must preserve the new API and password recovery support. Never reset identities to repair an update problem.
