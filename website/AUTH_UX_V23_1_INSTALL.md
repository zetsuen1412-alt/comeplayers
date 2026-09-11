# ComePlayers Auth UX V23.1 installation

Apply this patch on top of the V23 source tree.

## Included

- Premium two-column authentication modal
- Login, register, forgot-password, and email-verification states
- Password visibility controls and strength meter
- Remember-me storage behavior
- Client cooldown UX for repeated login, signup, reset, and verification requests
- Reset-password page
- Terms and privacy pages linked by registration
- Auth helper unit tests

## Supabase configuration

Add these redirect URLs in **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:3000/reset-password`
- `https://YOUR_DOMAIN/reset-password`

Keep the normal site URL configured for email verification and OAuth callbacks.

## Validate

```bash
npm ci
npm run typecheck
npx eslint app/components/MainHeader.tsx app/reset-password/page.tsx app/terms/page.tsx app/privacy/page.tsx components/auth/AuthModal.tsx components/auth/PasswordStrengthMeter.tsx lib/auth/*.ts lib/supabase.ts tests/auth/*.test.ts
npm test
```

No SQL migration or new environment variable is required.
