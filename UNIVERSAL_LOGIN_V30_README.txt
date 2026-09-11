COMEPLAYERS UNIVERSAL LOGIN V30
================================

Purpose
-------
This replace package unifies the ComePlayers login experience across:
- Marketplace / website
- Messages & Chat
- Android mobile app WebView
- Desktop app surfaces that load the ComePlayers website

What changed
------------
1. Universal compact login card
   - Removed the large Alexia/marketplace split hero from authentication.
   - Single centered ComePlayers account card.
   - Responsive desktop, tablet, and phone layout.
   - Mobile keyboard/safe-area friendly scrolling.

2. Same authentication features everywhere
   - Login
   - Register
   - Forgot password
   - Email verification / resend
   - Remember me
   - Google OAuth
   - Existing login cooldown/rate-limit protection
   - Existing password strength and Terms/Privacy checks

3. Messages & Chat now reuses the same AuthModal
   - Removed the separate gamer-access login design.
   - Guest users on /messages see the same login UI as the marketplace.
   - Registration and recovery are available from the same shared surface.

4. Legacy LoginModal now delegates to the same AuthModal
   - Prevents older pages from drifting to a different login design.

5. Android OAuth integration improvement
   - Trusted Google and Supabase authentication navigation stays inside
     the ComePlayers WebView.
   - OAuth returns to /auth/confirm and then /messages.
   - The same ComePlayers Supabase account is used on website and mobile.

Important account behavior
--------------------------
Website, mobile, and desktop use the same ComePlayers/Supabase account data.
Sessions remain stored per device/browser for security; this does not silently
copy an authenticated session from one physical device to another.

Install
-------
1. Close the dev server/app build process.
2. Extract this ZIP over the original Comeplayers-new project directory.
3. Choose Replace All.
4. Website:
   cd website
   npm run typecheck
   npm run dev
5. Android shell (when releasing a new app/OTA update):
   cd comeplayers-apps
   npm run mobile:update
   or use your normal Android release workflow.

Validation completed in the ChatGPT environment
-----------------------------------------------
- Website: npm run typecheck -> PASS
- Modified TS/TSX files: TypeScript syntax transpilation -> PASS
- Runtime unit tests could not run in this Linux environment because the
  uploaded node_modules contains the Windows esbuild binary. This is an
  environment/platform mismatch, not a TypeScript compile error.

Version: V30
Date: 2026-08-19
