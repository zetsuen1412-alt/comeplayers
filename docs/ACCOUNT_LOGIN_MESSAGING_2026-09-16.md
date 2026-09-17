# Account login messaging

## Approved product model
The owner explicitly selected ordinary Google/email sign-in with server-readable messages on 2026-09-16. This replaces the earlier requirement for device-only E2EE recovery. Do not describe account messaging as E2EE.

Private conversations now use the existing authenticated chat_messages/chat_attachments APIs. The server stores and processes content. Account access, room participation, blocks, phone verification, moderation, and rate limits remain in place. Single-device sessions stay disabled. No extra chat passkey or 64-character recovery key is required.

## Implementation
- Mobile opens its existing account conversation screen directly and removes the global passkey gate.
- Web loads account conversation history and uses account-authenticated calls.
- Profile/security explains the actual storage model without a blocking setup screen.
- Retired encrypted enrollment endpoints return an authenticated 426 upgrade response. They never convert a device-signed request into a plaintext write.
- The additive account_messaging_mode migration preserves the existing recovery generation/passkey checks in e2ee mode; account mode blocks INSERT/UPDATE of encrypted identities even through retained deployments.
- Existing crypto modules and data are retained. This release performs no reset or deletion.

## Deployment order
1. Run web/mobile typechecks, account access/call tests, existing recovery/crypto tests, and both isolated PostgreSQL fixtures.
2. Apply only the new additive migration. Never reapply preparation migration 20260915134209.
3. Verify encrypted identities/events remain zero; activate account mode under the recovery-control row lock in the same transaction as that check. Abort on nonzero inventory, preserve it for a separate migration.
4. Promote the tested website and verify public/authenticated boundaries.
5. Build and publish the Android update using the existing Expo project and original certificate. Install as an update without uninstalling.
6. Verify real message sync and media on devices. CI cannot substitute for hardware/browser permission testing.

## Historical reset
The authorized E2EE reset committed at 2026-09-16T11:52:09.241719Z, generation 1. It preserved 174 Auth/non-E2EE table fingerprints. The owner waived physical Android/Windows proof; rollout_verified remains false. See CODEX/reset evidence from commit 8d47122. This account-mode change does not repeat that reset.

## Validation status
Implementation candidate; production promotion, Android artifact and account-mode activation must be recorded after they actually complete. No device evidence is claimed by this document.
