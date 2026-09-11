# Auth UX V23.1 manifest

## User-facing changes

- Split-panel marketplace-grade modal on desktop with responsive single-panel mobile layout.
- Improved field labels, autocomplete hints, inline feedback, keyboard Escape close, backdrop close, and body scroll lock.
- Strong registration password requirement with live meter.
- Terms acceptance and dedicated legal pages.
- Remember-me toggle changes Supabase session storage between localStorage and sessionStorage.
- Forgot-password request and `/reset-password` completion flow.
- Dedicated verification-email screen with masked email and resend countdown.
- Cooldown UI for repeated signup, password reset, verification resend, and repeated failed login attempts.

## Security boundary

The browser cooldown improves UX and discourages simple repeated actions, but it is not a replacement for Supabase/server-side rate limiting, CAPTCHA, email abuse controls, or WAF policies.

## Database

No migration.
