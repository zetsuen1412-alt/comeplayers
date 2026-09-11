# ComePlayers V23.1 Authentication Experience

This patch upgrades the login, registration, verification, and password-recovery experience without requiring a database migration.

## Included

- Split desktop authentication modal with marketplace trust panel
- Responsive mobile layout
- Login and registration tabs
- Show/hide password controls
- Password-strength meter and registration requirements
- Functional Remember me session persistence
- Dedicated email-verification success screen
- Verification email resend with 60-second cooldown
- Forgot-password request with 60-second cooldown
- Temporary client-side pause after repeated failed login attempts
- Password reset page at `/reset-password`
- Public Terms and Privacy pages
- Inline success/error messages
- Google and Discord sign-in buttons

## Supabase configuration

Open:

```text
Supabase Dashboard
→ Authentication
→ URL Configuration
```

Set the local development URLs:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000
Redirect URL: http://localhost:3000/reset-password
```

Add the production equivalents:

```text
https://your-domain.example
https://your-domain.example/reset-password
```

Do not remove any existing OAuth callback URLs required by Google or Discord.

## Email authentication

In Supabase Authentication settings:

1. Enable email/password authentication.
2. Enable email confirmation for production.
3. Review the Confirm signup and Reset password email templates.
4. Ensure the sender domain is configured for production delivery.
5. Review Supabase server-side email and authentication rate limits.

The UI cooldowns improve feedback and reduce accidental repeated requests, but provider/server rate limits remain the authoritative anti-abuse control.

## Validation

```bash
npm ci
npm run typecheck
npm run typecheck:e2e
npm run lint
npm test
npx playwright test --list
```

A production build should still be run in the deployment environment before release.
