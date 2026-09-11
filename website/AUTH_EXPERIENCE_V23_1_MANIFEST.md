# V23.1 Authentication Experience Manifest

## Changed

- `app/components/MainHeader.tsx`
- `lib/supabase.ts`
- `package.json`
- `PROJECT_STATUS.md`

## Added

- `components/auth/AuthModal.tsx`
- `components/auth/PasswordStrengthMeter.tsx`
- `lib/auth/sessionStorage.ts`
- `lib/auth/passwordStrength.ts`
- `lib/auth/cooldown.ts`
- `app/reset-password/page.tsx`
- `app/terms/page.tsx`
- `app/privacy/page.tsx`
- `tests/auth/passwordStrength.test.ts`
- `tests/auth/cooldown.test.ts`
- `AUTH_EXPERIENCE_V23_1_INSTALL.md`
- `AUTH_EXPERIENCE_V23_1_MANIFEST.md`

## Database

No database migration is required.

## External configuration

Supabase Site URL and redirect URLs must include `/reset-password` for local and production deployments.
