COMEPLAYERS UNIVERSAL LOGIN V32 - BUILD FIX + NO SCROLL
======================================================

Purpose
-------
V32 keeps the V31 universal no-scroll login design and fixes the TypeScript
build error reported by Vercel in website/components/auth/AuthModal.tsx.

Build fix
---------
Vercel reported TS2367 at AuthModal.tsx around line 616 because the email
verification branch already narrows mode to "verify", but the notice class
still compared mode === "login". V32 removes that impossible comparison and
uses the verification notice spacing directly.

No-scroll behavior retained
---------------------------
- Login modal/page locks document scrolling while authentication is open.
- Login mode does not use an internal vertical scrollbar.
- Compact viewport rules remain enabled for shorter desktop/laptop screens.
- Register, forgot-password, and verification flows can retain controlled
  scrolling when their longer content requires it.

Authentication features retained
--------------------------------
- Supabase email/password login
- Register
- Forgot password
- Email verification/resend
- Remember me
- Google OAuth
- Login cooldown/rate-limit protection
- Password strength and Terms/Privacy checks
- Shared web/mobile authentication flow from V31

Install
-------
1. Extract this ZIP over the original Comeplayers-new directory.
2. Choose Replace All.
3. In PowerShell:
      cd C:\Comeplayers-new\website
      npm run build
4. Only after the build succeeds, deploy:
      npx vercel@latest --prod --force

Validation in the ChatGPT environment
-------------------------------------
- AuthModal.tsx semantic TypeScript check with dependency stubs: PASS
- The exact Vercel TS2367 impossible-comparison error is removed.
- Full Next.js project build cannot be executed from this small replacement
  archive alone because it does not include the complete dependency tree.

Version: V32
Date: 2026-08-19
