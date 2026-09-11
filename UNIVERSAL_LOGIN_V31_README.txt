COMEPLAYERS UNIVERSAL LOGIN V31 - NO SCROLL
================================================

Purpose
-------
This replace package keeps the V30 universal authentication flow and fixes
the login presentation so the login screen does not show a page scrollbar or
an internal card scrollbar during normal login.

Target surfaces
---------------
- Marketplace / website
- ComePlayers Community / Messages login gates
- Android mobile app WebView
- Desktop app surfaces that load the ComePlayers website

What changed in V31
-------------------
1. No-scroll login viewport
   - Locks both <html> and <body> while authentication is open.
   - Prevents background page scrolling and overscroll/bounce.
   - Modal/page viewport is fixed to 100dvh and overflow is hidden.

2. No internal scrollbar in LOGIN mode
   - Login form pane is forced to overflow:hidden.
   - Login-only spacing is compacted so the full form fits one viewport.
   - Logo, secure badge, title, tabs, fields, remember-me, action button,
     Google button, and footer keep the same functions but use tighter spacing.
   - Additional short-height rules compact the layout on smaller laptop screens.

3. Other authentication modes remain usable
   - Register, forgot password, and email verification retain controlled
     internal scrolling when their extra fields/messages require it.
   - Login itself remains scrollbar-free.

4. Same authentication system retained
   - Supabase email/password login
   - Register
   - Forgot password
   - Email verification/resend
   - Remember me
   - Google OAuth
   - Existing login cooldown/rate-limit protection
   - Existing password strength and Terms/Privacy checks

Install
-------
1. Close the website dev/build process.
2. Extract this ZIP over the original Comeplayers-new project directory.
3. Choose Replace All.
4. Website:
      cd website
      npm run typecheck
      npm run dev
5. Production deploy:
      npx vercel@latest --prod --force

Validation completed in the ChatGPT environment
-----------------------------------------------
- Modified TS/TSX files: TypeScript syntax transpilation -> PASS
- Full project typecheck was not run here because this replace ZIP contains
  only the V31 replacement files, not the complete project dependency tree.

Version: V31
Date: 2026-08-19
