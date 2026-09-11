COMEPLAYERS MARKETPLACE LOGIN MOBILE V28

This replace package updates the responsive authentication modal used by the ComePlayers marketplace.

Main improvements:
- Full-screen mobile layout with no horizontal overflow.
- Compact Alexia hero header on phones and tablets.
- Desktop split layout keeps the large Alexia marketplace presentation.
- Mobile keyboard-friendly scrolling using dynamic viewport units.
- Safe-area support for phones with notches.
- Minimum 48px touch targets for inputs and controls.
- Login, registration, forgot password, verification, Google, and Discord flows are preserved.
- Yellow/black ComePlayers marketplace theme.
- Short landscape devices automatically hide the mobile hero to leave more room for the form.

Install:
1. Extract this ZIP.
2. Copy the Comeplayers-new folder into the project root.
3. Select Replace All.
4. Restart the development server with npm run dev.
5. Test at 360x800, 390x844, 768x1024, and desktop resolutions.

Changed files:
- website/components/auth/AuthModal.tsx
- website/components/auth/AuthModal.module.css
- website/public/auth/marketplace-login-alexia.webp
